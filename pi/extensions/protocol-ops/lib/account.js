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
import {
	assertExactKeys,
	assertSafeTicket,
	assertUniqueStrings,
	SAFE_HOST,
} from "./validation.js";

export const ACCOUNT_LIMITS = {
	maxTargets: 4,
	maxOutputBytes: 8 * 1024,
	timeoutSeconds: 20,
};

const SAFE_USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const ALLOWED_SHELLS = new Set(["/bin/bash", "/bin/sh"]);
const REQUIRED_REMOTE_PATHS = [
	"/usr/bin/awk",
	"/usr/bin/getent",
	"/usr/bin/id",
	"/usr/bin/stat",
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
	{ inventory, now = () => new Date(), makeId = randomUUID } = {},
) {
	const input = assertExactKeys(
		params,
		["targets", "username", "shell", "create_home", "force_password_change", "reference"],
		"ops_account input",
	);
	if (!(inventory instanceof Map)) throw new Error("Protocol Ops inventory must be a Map");
	const targets = assertUniqueStrings(input.targets, "ops_account input.targets", {
		min: 1,
		max: ACCOUNT_LIMITS.maxTargets,
		pattern: SAFE_HOST,
	});
	for (const host of targets) {
		if (!inventory.has(host)) throw new Error(`ops_account input target is outside the inventory: ${host}`);
	}
	const username = validateUsername(input.username);
	const externalReference = assertSafeTicket(input.reference, "ops_account input.reference", { optional: true });
	if (!ALLOWED_SHELLS.has(input.shell)) {
		throw new Error("ops_account input.shell must be /bin/bash or /bin/sh");
	}
	if (input.create_home !== true) throw new Error("ops_account creates normal users only with a home directory");
	if (input.force_password_change !== true) {
		throw new Error("ops_account requires a forced password change at first login");
	}
	const id = makeId();
	return {
		schema_version: "protocol-ops-account-plan/2",
		plan_id: id,
		created_at: now().toISOString(),
		external_reference: externalReference ?? null,
		targets: [...targets],
		action: {
			op: "create_normal_account",
			username,
			shell: input.shell,
			create_home: true,
			supplementary_groups: [],
			force_password_change: true,
			credential_ref: `secret://protocol-ops/${id}`,
		},
		prechecks: ["account_absent", "noninteractive_root_probe", "required_tools"],
		postchecks: ["account_identity", "home_ownership", "no_supplementary_groups", "password_set", "password_change_required"],
		rollback: "delete_only_account_created_by_this_plan",
		executor: "fixed-argv-ssh-v1",
	};
}

const DEFAULT_NON_PRODUCTION_ENVIRONMENTS = new Set([
	"LAB",
	"TEST",
]);

function nonProductionEnvironments(value) {
	if (value === undefined || value.trim() === "") return DEFAULT_NON_PRODUCTION_ENVIRONMENTS;
	const selected = value
		.split(",")
		.map((item) => item.trim().toUpperCase())
		.filter(Boolean);
	if (selected.length === 0 || selected.some((item) => !/^[A-Z0-9._-]{1,64}$/.test(item))) {
		throw new Error("PROTOCOL_OPS_NON_PRODUCTION_ENVIRONMENTS is invalid");
	}
	return new Set(selected);
}

export function accountConfirmationDecision(plan, inventory, env = process.env) {
	const mode = (env.PROTOCOL_OPS_ACCOUNT_CONFIRM || "risk").trim().toLowerCase();
	if (!new Set(["always", "operator", "risk"]).has(mode)) {
		throw new Error("PROTOCOL_OPS_ACCOUNT_CONFIRM must be always, risk, or operator");
	}
	if (mode === "always") return { mode, required: true, reason: "operator policy requires confirmation" };
	if (mode === "operator") {
		return { mode, required: false, reason: "explicit operator mode trusts typed account actions" };
	}
	if (!(inventory instanceof Map)) throw new Error("Protocol Ops inventory must be a Map");
	if (plan.targets.length > 1) {
		return { mode, required: true, reason: "multi-host account change" };
	}
	const nonProduction = nonProductionEnvironments(env.PROTOCOL_OPS_NON_PRODUCTION_ENVIRONMENTS);
	const elevatedTargets = plan.targets.filter((host) => {
		const record = inventory.get(host);
		return !record || !nonProduction.has(record.environment.toUpperCase());
	});
	if (elevatedTargets.length > 0) {
		return {
			mode,
			required: true,
			reason: `environment requires confirmation: ${elevatedTargets.join(", ")}`,
		};
	}
	return { mode, required: false, reason: "single non-production target" };
}

function preflightScript(username, shell) {
	return [
		"set -eu",
		"export LC_ALL=C",
		`username='${username}'`,
		`login_shell='${shell}'`,
		"if /usr/bin/getent passwd \"$username\" >/dev/null 2>&1; then printf 'account_present\\n'; exit 20; fi",
		...REQUIRED_REMOTE_PATHS.map((path) => `[ -x '${path}' ] || { printf 'missing_tool:${path}\\n'; exit 21; }`),
		"[ -x \"$login_shell\" ] || { printf 'missing_login_shell:%s\\n' \"$login_shell\"; exit 21; }",
		"uid=$(/usr/bin/sudo -n /usr/bin/id -u 2>/dev/null) || { printf 'passwordless_root_unavailable\\n'; exit 22; }",
		"[ \"$uid\" = 0 ] || { printf 'sudo_not_root\\n'; exit 23; }",
		"printf 'ready\\n'",
	].join("\n");
}

export async function collectAccountPreflight(plan, { runner = runAccountSsh, signal } = {}) {
	const results = [];
	for (const host of plan.targets) {
		if (signal?.aborted) {
			const error = new Error("account preflight aborted");
			error.name = "AbortError";
			throw error;
		}
		const result = await runner(host, ["/bin/sh", "-s"], {
			stdin: `${preflightScript(plan.action.username, plan.action.shell)}\n`,
			signal,
		});
		results.push({ ...result, stage: "preflight" });
	}
	return results;
}

export function assertAccountPreflight(plan, results) {
	if (!Array.isArray(results) || results.length !== plan.targets.length) {
		throw new Error("account preflight result count does not match the plan");
	}
	for (let index = 0; index < results.length; index += 1) {
		const result = results[index];
		if (result.host !== plan.targets[index]) {
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
		targets: plan.targets,
		action: plan.action,
		preflight: results.map((result) => ({ host: result.host, ok: result.ok, stdout: result.stdout })),
	};
	return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
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
	const reference = plan.external_reference || "adhoc";
	const filename = [safeFilePart(reference), safeFilePart(plan.action.username), plan.plan_id.slice(0, 8)].join("-");
	const path = join(directory, `${filename}.txt`);
	const body = [
		`operation_id=${plan.plan_id}`,
		...(plan.external_reference ? [`external_reference=${plan.external_reference}`] : []),
		`username=${plan.action.username}`,
		`temporary_password=${password}`,
		`hosts=${plan.targets.join(",")}`,
		"password_change=required_at_first_login",
		"",
	].join("\n");
	writeFileSync(path, body, { encoding: "utf8", mode: 0o600, flag: "wx" });
	chmodSync(path, 0o600);
	return path;
}

function verificationScript(username, shell) {
	const home = `/home/${username}`;
	return [
		"set -eu",
		"export LC_ALL=C",
		`username='${username}'`,
		`expected_shell='${shell}'`,
		`expected_home='${home}'`,
		"entry=$(/usr/bin/getent passwd \"$username\")",
		"actual_uid=$(printf '%s\\n' \"$entry\" | /usr/bin/awk -F: '{print $3}')",
		"actual_gid=$(printf '%s\\n' \"$entry\" | /usr/bin/awk -F: '{print $4}')",
		"actual_home=$(printf '%s\\n' \"$entry\" | /usr/bin/awk -F: '{print $6}')",
		"actual_shell=$(printf '%s\\n' \"$entry\" | /usr/bin/awk -F: '{print $7}')",
		"case \"$actual_uid\" in ''|*[!0-9]*|0) printf 'invalid_identity\\n'; exit 31;; esac",
		"case \"$actual_gid\" in ''|*[!0-9]*|0) printf 'invalid_identity\\n'; exit 31;; esac",
		"[ \"$actual_shell\" = \"$expected_shell\" ] || { printf 'shell_mismatch\\n'; exit 31; }",
		"[ \"$actual_home\" = \"$expected_home\" ] || { printf 'home_mismatch\\n'; exit 32; }",
		"[ -d \"$actual_home\" ] || { printf 'home_not_directory\\n'; exit 33; }",
		"[ \"$(/usr/bin/stat -c '%u:%g' \"$actual_home\")\" = \"$actual_uid:$actual_gid\" ] || { printf 'home_owner_mismatch\\n'; exit 33; }",
		"[ \"$(/usr/bin/id -G \"$username\")\" = \"$actual_gid\" ] || { printf 'supplementary_groups_present\\n'; exit 34; }",
		"shadow=$(/usr/bin/sudo -n /usr/bin/getent shadow \"$username\")",
		"password_hash=$(printf '%s\\n' \"$shadow\" | /usr/bin/awk -F: '{print $2}')",
		"case \"$password_hash\" in ''|\\!*|\\**) printf 'password_locked\\n'; exit 35;; esac",
		"last_change=$(printf '%s\\n' \"$shadow\" | /usr/bin/awk -F: '{print $3}')",
		"[ \"$last_change\" = 0 ] || { printf 'password_change_not_forced\\n'; exit 35; }",
		"printf 'verified:%s\\n' \"$entry\"",
	].join("\n");
}

function parseCreatedIdentity(plan, result) {
	if (!result.ok) throw new Error(result.stderr || result.failure || `exit ${result.exitCode}`);
	const fields = result.stdout.split(":");
	if (fields.length !== 7) throw new Error("created account identity is malformed");
	const [username, , uid, gid, , home, shell] = fields;
	if (
		username !== plan.action.username ||
		!/^\d+$/.test(uid) || Number(uid) <= 0 ||
		!/^\d+$/.test(gid) || Number(gid) <= 0 ||
		home !== `/home/${plan.action.username}` ||
		shell !== plan.action.shell
	) {
		throw new Error("created account identity does not match the fixed plan");
	}
	return { host: result.host, username, uid, gid, home, shell };
}

function rollbackScript(identity) {
	return [
		"set -eu",
		"export LC_ALL=C",
		`username='${identity.username}'`,
		`expected_uid='${identity.uid}'`,
		`expected_gid='${identity.gid}'`,
		`expected_home='${identity.home}'`,
		`expected_shell='${identity.shell}'`,
		"entry=$(/usr/bin/getent passwd \"$username\") || { printf 'rollback_account_missing\\n'; exit 41; }",
		"actual_uid=$(printf '%s\\n' \"$entry\" | /usr/bin/awk -F: '{print $3}')",
		"actual_gid=$(printf '%s\\n' \"$entry\" | /usr/bin/awk -F: '{print $4}')",
		"actual_home=$(printf '%s\\n' \"$entry\" | /usr/bin/awk -F: '{print $6}')",
		"actual_shell=$(printf '%s\\n' \"$entry\" | /usr/bin/awk -F: '{print $7}')",
		"[ \"$actual_uid:$actual_gid:$actual_home:$actual_shell\" = \"$expected_uid:$expected_gid:$expected_home:$expected_shell\" ] || { printf 'rollback_identity_changed\\n'; exit 42; }",
		"/usr/bin/sudo -n /usr/sbin/userdel --remove \"$username\"",
		"printf 'rolled_back\\n'",
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

async function rollbackCreated(createdIdentities, { runner, signal } = {}) {
	const results = [];
	for (const identity of [...createdIdentities].reverse()) {
		const result = await runApplyStep(
			runner,
			identity.host,
			"rollback",
			["/bin/sh", "-s"],
			{ signal, stdin: `${rollbackScript(identity)}\n` },
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
	const createdIdentities = [];
	const uncertainHosts = [];
	let failure = null;
	for (const host of plan.targets) {
		const useradd = await runApplyStep(
			runner,
			host,
			"useradd",
			[
				"/usr/bin/sudo", "-n", "/usr/sbin/useradd",
				"--create-home", "--home-dir", `/home/${plan.action.username}`,
				"--shell", plan.action.shell, plan.action.username,
			],
			{ signal, secrets: [password] },
		);
		results.push(useradd);
		if (!useradd.ok) {
			if (useradd.exitCode === null || useradd.failure !== null) uncertainHosts.push(host);
			failure = useradd;
			break;
		}
		const identityResult = await runApplyStep(
			runner,
			host,
			"identity",
			["/usr/bin/getent", "passwd", plan.action.username],
			{ signal, secrets: [password] },
		);
		results.push(identityResult);
		try {
			createdIdentities.push(parseCreatedIdentity(plan, identityResult));
		} catch (error) {
			uncertainHosts.push(host);
			failure = {
				...identityResult,
				ok: false,
				failure: "identity_unverified",
				stderr: error instanceof Error ? error.message : "created account identity is unverified",
			};
			break;
		}

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
		const rollback = await rollbackCreated(createdIdentities, { runner });
		return {
			ok: false,
			failure: { host: failure.host, stage: failure.stage, exitCode: failure.exitCode, failure: failure.failure },
			results,
			rollback,
			knownCreatedHosts: createdIdentities.map((identity) => identity.host),
			uncertainHosts,
			rollbackComplete:
				uncertainHosts.length === 0 &&
				rollback.length === createdIdentities.length &&
				rollback.every((result) => result.ok),
		};
	}

	const verification = [];
	for (const host of plan.targets) {
		const result = await runApplyStep(
			runner,
			host,
			"verify",
			["/bin/sh", "-s"],
			{ stdin: `${verificationScript(plan.action.username, plan.action.shell)}\n`, signal, secrets: [password] },
		);
		verification.push(result);
	}
	const verified = verification.every((result) => result.ok && result.stdout.startsWith("verified:"));
	if (!verified) {
		const verificationFailure = verification.find(
			(result) => !result.ok || !result.stdout.startsWith("verified:"),
		);
		const rollback = await rollbackCreated(createdIdentities, { runner });
		return {
			ok: false,
			failure: {
				host: verificationFailure?.host ?? "verification",
				stage: "verify",
				exitCode: verificationFailure?.exitCode ?? null,
				failure: verificationFailure?.failure ?? (verificationFailure?.ok ? "verification_output" : null),
			},
			results,
			verification,
			rollback,
			knownCreatedHosts: createdIdentities.map((identity) => identity.host),
			uncertainHosts: [],
			rollbackComplete: rollback.length === createdIdentities.length && rollback.every((result) => result.ok),
		};
	}
	return {
		ok: true,
		results,
		verification,
		rollback: [],
		knownCreatedHosts: createdIdentities.map((identity) => identity.host),
		uncertainHosts: [],
		rollbackComplete: false,
	};
}

function receiptStep(result) {
	return {
		host: result.host,
		stage: result.stage,
		ok: result.ok === true,
		exitCode: Number.isInteger(result.exitCode) ? result.exitCode : null,
		failure: result.failure ?? null,
	};
}

export function summarizeAccountOutcome(outcome) {
	const executionSteps = [
		...(Array.isArray(outcome.results) ? outcome.results : []),
		...(Array.isArray(outcome.verification) ? outcome.verification : []),
	].map(receiptStep);
	const rollbackSteps = (Array.isArray(outcome.rollback) ? outcome.rollback : []).map(receiptStep);
	return {
		completed: outcome.ok === true,
		verified: outcome.ok === true,
		failure: outcome.ok === true
			? null
			: {
				host: outcome.failure?.host ?? null,
				stage: outcome.failure?.stage ?? null,
				exitCode: Number.isInteger(outcome.failure?.exitCode) ? outcome.failure.exitCode : null,
				failure: outcome.failure?.failure ?? null,
			},
		knownCreatedHosts: [...(outcome.knownCreatedHosts ?? [])],
		executionSteps,
		rollback: {
			attempted: rollbackSteps.length > 0,
			complete: rollbackSteps.length > 0 ? outcome.rollbackComplete === true : null,
			steps: rollbackSteps,
		},
		uncertainHosts: [...(outcome.uncertainHosts ?? [])],
	};
}

export function removeSecretFile(path) {
	try {
		unlinkSync(path);
		return true;
	} catch {
		return false;
	}
}
