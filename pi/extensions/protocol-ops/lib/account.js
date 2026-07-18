import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { assertExactKeys } from "./validation.js";
import { assertActiveReadScope, selectScopedTargets } from "./scope.js";

export const ACCOUNT_LIMITS = {
	maxTargets: 4,
	maxOutputBytes: 8 * 1024,
	timeoutSeconds: 20,
};

const SAFE_USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const ALLOWED_SHELLS = new Set(["/bin/bash", "/bin/sh"]);
const REQUIRED_REMOTE_PATHS = [
	"/usr/bin/getent",
	"/usr/bin/id",
	"/usr/bin/sudo",
	"/usr/sbin/chpasswd",
	"/usr/sbin/useradd",
	"/usr/sbin/userdel",
	"/usr/bin/chage",
];

function cleanOutput(buffer, secrets = []) {
	let value = buffer
		.toString("utf8")
		.replace(/\r\n?/g, "\n")
		.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "�")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "�")
		.trimEnd();
	for (const secret of secrets) {
		if (secret) value = value.split(secret).join("[REDACTED]");
	}
	return value;
}

export function runAccountSsh(host, remoteArgv, {
	stdin = "",
	secrets = [],
	sshBin = process.env.OPS_SSH_BIN || "ssh",
	signal,
	maxOutputBytes = ACCOUNT_LIMITS.maxOutputBytes,
	timeoutSeconds = ACCOUNT_LIMITS.timeoutSeconds,
	spawnProcess = spawn,
	killGraceMs = 250,
	settleGraceMs = 1000,
} = {}) {
	if (!Array.isArray(remoteArgv) || remoteArgv.length === 0) {
		throw new Error("account SSH operation needs a fixed remote argv");
	}
	return new Promise((resolve, reject) => {
		const child = spawnProcess(sshBin, [
			"-T",
			"-o", "BatchMode=yes",
			"-o", "ForwardAgent=no",
			"-o", "ForwardX11=no",
			"-o", "ClearAllForwardings=yes",
			"-o", "PermitLocalCommand=no",
			"-o", "UpdateHostKeys=no",
			"-o", "StrictHostKeyChecking=yes",
			"--", host, ...remoteArgv,
		], { stdio: ["pipe", "pipe", "pipe"] });
		const stdout = [];
		const stderr = [];
		let outputBytes = 0;
		let failure = null;
		let settled = false;
		let timeoutTimer;
		let killTimer;
		let settleTimer;

		const resultFor = (exitCode = null, closeSignal = null) => ({
			host,
			ok: failure === null && exitCode === 0,
			exitCode,
			signal: closeSignal,
			failure,
			stdout: cleanOutput(Buffer.concat(stdout), secrets),
			stderr: cleanOutput(Buffer.concat(stderr), secrets),
		});
		const finish = (result, error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeoutTimer);
			clearTimeout(killTimer);
			clearTimeout(settleTimer);
			if (signal) signal.removeEventListener("abort", abort);
			if (error) reject(error);
			else resolve(result);
		};
		const finishStopped = (exitCode = null, closeSignal = null) => {
			if (failure === "aborted") {
				const error = new Error("account operation aborted");
				error.name = "AbortError";
				finish(undefined, error);
				return;
			}
			finish(resultFor(exitCode, closeSignal));
		};
		const stop = (reason) => {
			if (failure === null) failure = reason;
			if (settled) return;
			child.kill("SIGTERM");
			if (killTimer === undefined) killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
			if (settleTimer === undefined) {
				settleTimer = setTimeout(() => {
					child.kill("SIGKILL");
					finishStopped();
				}, killGraceMs + settleGraceMs);
			}
		};
		const abort = () => stop("aborted");
		const capture = (bucket) => (chunk) => {
			if (failure !== null) return;
			outputBytes += chunk.length;
			if (outputBytes > maxOutputBytes) {
				stop("output_limit");
				return;
			}
			bucket.push(chunk);
		};

		timeoutTimer = setTimeout(() => stop("timeout"), timeoutSeconds * 1000);
		child.stdout.on("data", capture(stdout));
		child.stderr.on("data", capture(stderr));
		child.stdin.on("error", () => {});
		child.on("error", (error) => {
			if (failure === "aborted") return finishStopped();
			if (failure === null) failure = "spawn";
			const result = resultFor();
			result.stderr = cleanOutput(Buffer.from(error instanceof Error ? error.message : String(error)), secrets);
			finish(result);
		});
		child.on("close", (exitCode, closeSignal) => {
			if (failure !== null) finishStopped(exitCode, closeSignal);
			else finish(resultFor(exitCode, closeSignal));
		});
		if (signal) {
			if (signal.aborted) abort();
			else signal.addEventListener("abort", abort, { once: true });
		}
		child.stdin.end(stdin);
	});
}

function validateUsername(value) {
	if (typeof value !== "string" || !SAFE_USERNAME.test(value)) {
		throw new Error("ops_account input.username must be a portable normal-account name");
	}
	return value;
}

export function createAccountPlan(
	params,
	{ task, inventory, now = () => new Date(), makeId = randomUUID } = {},
) {
	assertActiveReadScope(task);
	if (task.taskType !== "account-provision") {
		throw new Error("ops_account requires an active account-provision task");
	}
	if (!task.ticket) throw new Error("ops_account requires a ticket/reference on the active task");
	const input = assertExactKeys(
		params,
		["targets", "username", "shell", "create_home", "force_password_change"],
		"ops_account input",
	);
	const targets = selectScopedTargets(input.targets, {
		task,
		inventory,
		maxTargets: ACCOUNT_LIMITS.maxTargets,
		label: "ops_account input",
	});
	const username = validateUsername(input.username);
	if (!ALLOWED_SHELLS.has(input.shell)) {
		throw new Error("ops_account input.shell must be /bin/bash or /bin/sh");
	}
	if (input.create_home !== true) throw new Error("ops_account creates normal users only with a home directory");
	if (input.force_password_change !== true) {
		throw new Error("ops_account requires a forced password change at first login");
	}
	const id = makeId();
	return {
		schema_version: "protocol-ops-account-plan/1",
		plan_id: id,
		created_at: now().toISOString(),
		task_id: task.taskId,
		ticket: task.ticket,
		approved_targets: [...targets],
		action: {
			op: "create_normal_account",
			username,
			shell: input.shell,
			create_home: true,
			supplementary_groups: [],
			force_password_change: true,
			credential_ref: `secret://protocol-ops/${id}`,
		},
		prechecks: ["account_absent", "passwordless_root", "required_tools"],
		postchecks: ["account_identity", "password_change_required"],
		rollback: "delete_only_account_created_by_this_plan",
		executor: "fixed-argv-ssh-v1",
	};
}

function preflightScript(username) {
	return [
		"set -eu",
		"export LC_ALL=C",
		`username='${username}'`,
		"if /usr/bin/getent passwd \"$username\" >/dev/null 2>&1; then printf 'account_present\\n'; exit 20; fi",
		...REQUIRED_REMOTE_PATHS.map((path) => `[ -x '${path}' ] || { printf 'missing_tool:${path}\\n'; exit 21; }`),
		"uid=$(/usr/bin/sudo -n /usr/bin/id -u 2>/dev/null) || { printf 'passwordless_root_unavailable\\n'; exit 22; }",
		"[ \"$uid\" = 0 ] || { printf 'sudo_not_root\\n'; exit 23; }",
		"printf 'ready\\n'",
	].join("\n");
}

export async function collectAccountPreflight(plan, { runner = runAccountSsh, signal } = {}) {
	const results = [];
	for (const host of plan.approved_targets) {
		if (signal?.aborted) {
			const error = new Error("account preflight aborted");
			error.name = "AbortError";
			throw error;
		}
		const result = await runner(host, ["sh", "-s"], {
			stdin: `${preflightScript(plan.action.username)}\n`,
			signal,
		});
		results.push({ ...result, stage: "preflight" });
	}
	return results;
}

export function assertAccountPreflight(plan, results) {
	if (!Array.isArray(results) || results.length !== plan.approved_targets.length) {
		throw new Error("account preflight result count does not match the plan");
	}
	for (let index = 0; index < results.length; index += 1) {
		const result = results[index];
		if (result.host !== plan.approved_targets[index]) {
			throw new Error("account preflight target order changed");
		}
		if (!result.ok || result.stdout !== "ready") {
			const reason = result.stdout || result.stderr || result.failure || `exit ${result.exitCode}`;
			throw new Error(`account preflight failed on ${result.host}: ${reason}`);
		}
	}
	return accountPreflightDigest(plan, results);
}

export function accountPreflightDigest(plan, results) {
	const snapshot = {
		plan_id: plan.plan_id,
		task_id: plan.task_id,
		targets: plan.approved_targets,
		action: plan.action,
		preflight: results.map((result) => ({ host: result.host, ok: result.ok, stdout: result.stdout })),
	};
	return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export function accountPlanDigest(plan) {
	return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

export function generateTemporaryPassword({ random = randomBytes } = {}) {
	return `Aa1!${random(18).toString("base64url")}`;
}

export function resolveSecretDirectory(env = process.env) {
	if (env.PROTOCOL_OPS_SECRET_DIR?.trim()) {
		const selected = env.PROTOCOL_OPS_SECRET_DIR.trim();
		if (!isAbsolute(selected)) throw new Error("PROTOCOL_OPS_SECRET_DIR must be absolute");
		return selected;
	}
	const stateHome = env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
	return join(stateHome, "protocol-ops", "secrets");
}

function safeFilePart(value) {
	return value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 96);
}

export function persistTemporaryPassword(plan, password, {
	directory = resolveSecretDirectory(),
	getUid = () => (typeof process.getuid === "function" ? process.getuid() : null),
} = {}) {
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	chmodSync(directory, 0o700);
	const directoryStat = statSync(directory);
	const uid = getUid();
	if (!directoryStat.isDirectory() || (uid !== null && directoryStat.uid !== uid)) {
		throw new Error("Protocol Ops secret directory is not owned by the current user");
	}
	if ((directoryStat.mode & 0o077) !== 0) {
		throw new Error("Protocol Ops secret directory must not be group/world accessible");
	}
	const filename = [safeFilePart(plan.ticket), safeFilePart(plan.action.username), plan.plan_id.slice(0, 8)].join("-");
	const path = join(directory, `${filename}.txt`);
	const body = [
		`ticket=${plan.ticket}`,
		`username=${plan.action.username}`,
		`temporary_password=${password}`,
		`hosts=${plan.approved_targets.join(",")}`,
		"password_change=required_at_first_login",
		"",
	].join("\n");
	writeFileSync(path, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
	chmodSync(path, 0o600);
	return path;
}

function verificationScript(username, shell) {
	return [
		"set -eu",
		"export LC_ALL=C",
		`username='${username}'`,
		`expected_shell='${shell}'`,
		"entry=$(/usr/bin/getent passwd \"$username\")",
		"actual_shell=$(printf '%s\\n' \"$entry\" | awk -F: '{print $7}')",
		"[ \"$actual_shell\" = \"$expected_shell\" ] || { printf 'shell_mismatch\\n'; exit 31; }",
		"last_change=$(/usr/bin/sudo -n /usr/bin/getent shadow \"$username\" | awk -F: '{print $3}')",
		"[ \"$last_change\" = 0 ] || { printf 'password_change_not_forced\\n'; exit 32; }",
		"printf 'verified:%s\\n' \"$entry\"",
	].join("\n");
}

async function runApplyStep(runner, host, stage, remoteArgv, options) {
	try {
		const result = await runner(host, remoteArgv, options);
		return { ...result, stage };
	} catch (error) {
		return {
			host,
			stage,
			ok: false,
			exitCode: null,
			failure: error?.name === "AbortError" ? "aborted" : "exception",
			stdout: "",
			stderr: error instanceof Error ? error.message.slice(0, 300) : "account operation failed",
		};
	}
}

async function rollbackCreated(plan, createdHosts, { runner, signal } = {}) {
	const results = [];
	for (const host of [...createdHosts].reverse()) {
		const result = await runApplyStep(
			runner,
			host,
			"rollback",
			["/usr/bin/sudo", "-n", "/usr/sbin/userdel", "--remove", plan.action.username],
			{ signal },
		);
		results.push(result);
	}
	return results;
}

export async function executeAccountPlan(plan, password, {
	runner = runAccountSsh,
	signal,
} = {}) {
	const results = [];
	const createdHosts = [];
	const uncertainHosts = [];
	let failure = null;
	for (const host of plan.approved_targets) {
		const useradd = await runApplyStep(
			runner,
			host,
			"useradd",
			[
				"/usr/bin/sudo", "-n", "/usr/sbin/useradd",
				"--create-home", "--shell", plan.action.shell, plan.action.username,
			],
			{ signal, secrets: [password] },
		);
		results.push(useradd);
		if (!useradd.ok) {
			if (useradd.exitCode === null || useradd.failure !== null) uncertainHosts.push(host);
			failure = useradd;
			break;
		}
		createdHosts.push(host);

		const passwordSet = await runApplyStep(
			runner,
			host,
			"chpasswd",
			["/usr/bin/sudo", "-n", "/usr/sbin/chpasswd"],
			{ stdin: `${plan.action.username}:${password}\n`, signal, secrets: [password] },
		);
		results.push(passwordSet);
		if (!passwordSet.ok) {
			failure = passwordSet;
			break;
		}

		const forceChange = await runApplyStep(
			runner,
			host,
			"chage",
			["/usr/bin/sudo", "-n", "/usr/bin/chage", "--lastday", "0", plan.action.username],
			{ signal, secrets: [password] },
		);
		results.push(forceChange);
		if (!forceChange.ok) {
			failure = forceChange;
			break;
		}
	}

	if (failure) {
		// Cleanup uses its own bounded SSH calls even when the foreground signal
		// was aborted; otherwise Ctrl-C could strand a known-created account.
		const rollback = await rollbackCreated(plan, createdHosts, { runner });
		return {
			ok: false,
			failure: { host: failure.host, stage: failure.stage, exitCode: failure.exitCode, failure: failure.failure },
			results,
			rollback,
			uncertainHosts,
			rollbackComplete:
				uncertainHosts.length === 0 &&
				rollback.length === createdHosts.length &&
				rollback.every((result) => result.ok),
		};
	}

	const verification = [];
	for (const host of plan.approved_targets) {
		const result = await runApplyStep(
			runner,
			host,
			"verify",
			["sh", "-s"],
			{ stdin: `${verificationScript(plan.action.username, plan.action.shell)}\n`, signal, secrets: [password] },
		);
		verification.push(result);
	}
	const verified = verification.every((result) => result.ok && result.stdout.startsWith("verified:"));
	if (!verified) {
		const rollback = await rollbackCreated(plan, createdHosts, { runner });
		return {
			ok: false,
			failure: { host: verification.find((result) => !result.ok)?.host ?? "verification", stage: "verify" },
			results,
			verification,
			rollback,
			uncertainHosts: [],
			rollbackComplete: rollback.length === createdHosts.length && rollback.every((result) => result.ok),
		};
	}
	return { ok: true, results, verification, rollback: [], uncertainHosts: [], rollbackComplete: false };
}

export function removeSecretFile(path) {
	try {
		unlinkSync(path);
		return true;
	} catch {
		return false;
	}
}
