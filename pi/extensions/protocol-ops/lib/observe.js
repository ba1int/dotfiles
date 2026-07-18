import { spawn } from "node:child_process";
import {
	assertExactKeys,
	assertUniqueStrings,
	SAFE_HOST,
	SAFE_ID,
} from "./validation.js";

export const OBSERVE_LIMITS = {
	maxTargets: 4,
	maxChecks: 16,
	maxOperations: 32,
	hostConcurrency: 4,
	maxOutputBytes: 8 * 1024,
	maxBatchOutputBytes: 128 * 1024,
};

const TERMINAL_TASK_PHASES = new Set(["done", "blocked"]);

function selectTargets(value, task, inventory, limits) {
	const targets = assertUniqueStrings(value, "ops_observe input.targets", {
		min: 1,
		max: limits.maxTargets,
		pattern: SAFE_HOST,
	});
	const declared = new Set(task.targets);
	for (const host of targets) {
		if (!inventory.has(host)) throw new Error(`ops_observe target is outside the inventory: ${host}`);
		if (!declared.has(host)) throw new Error(`ops_observe target is outside the active task: ${host}`);
	}
	return targets;
}

function expandChecks(profileIds, checkIds, taskRunbook, catalog, limits) {
	const useRunbookDefaults = profileIds === undefined && checkIds === undefined;
	const requestedProfiles = profileIds === undefined
		? (useRunbookDefaults ? [...taskRunbook.profiles] : [])
		: assertUniqueStrings(profileIds, "ops_observe input.profiles", { max: 8, pattern: SAFE_ID });
	const requestedChecks = checkIds === undefined
		? []
		: assertUniqueStrings(checkIds, "ops_observe input.checks", { max: limits.maxChecks, pattern: SAFE_ID });
	if (requestedProfiles.length === 0 && requestedChecks.length === 0) {
		throw new Error("ops_observe needs at least one profile or check");
	}

	const ids = [];
	const seen = new Set();
	const add = (id) => {
		if (!seen.has(id)) {
			seen.add(id);
			ids.push(id);
		}
	};
	for (const profile of requestedProfiles) {
		const members = catalog.profiles.get(profile);
		if (!members) throw new Error(`ops_observe references unknown profile: ${profile}`);
		for (const id of members) add(id);
	}
	for (const id of requestedChecks) {
		if (!catalog.checks.has(id)) throw new Error(`ops_observe references unknown check: ${id}`);
		add(id);
	}
	if (ids.length > limits.maxChecks) {
		throw new Error(`ops_observe expands to ${ids.length} checks; limit is ${limits.maxChecks}`);
	}
	return ids.map((id) => catalog.checks.get(id));
}

export function preflightObservation(
	params,
	{ task, taskRunbook, inventory, catalog, limits = OBSERVE_LIMITS, nowMs = () => Date.now() },
) {
	if (!task?.active) throw new Error("no active Protocol Ops task; call ops_task first");
	if (TERMINAL_TASK_PHASES.has(task.phase)) {
		throw new Error(`Protocol Ops task is ${task.phase}; declare ops_task again to open a new read scope`);
	}
	if (
		task.readScope?.method !== "human-confirmation" ||
		!Array.isArray(task.readScope.targets) ||
		JSON.stringify(task.readScope.targets) !== JSON.stringify(task.targets)
	) {
		throw new Error("active task has no valid exact-host read scope; declare ops_task again");
	}
	const expiresAt = Date.parse(task.readScope.expiresAt);
	if (!Number.isFinite(expiresAt) || nowMs() >= expiresAt) {
		throw new Error("active task read scope expired; declare ops_task again to reconfirm it");
	}
	const input = assertExactKeys(params, ["targets", "profiles", "checks"], "ops_observe input");
	const targets = selectTargets(input.targets, task, inventory, limits);
	const checks = expandChecks(input.profiles, input.checks, taskRunbook, catalog, limits);
	const operationCount = targets.length * checks.length;
	if (operationCount > limits.maxOperations) {
		throw new Error(`ops_observe expands to ${operationCount} operations; limit is ${limits.maxOperations}`);
	}
	const operations = [];
	for (const host of targets) {
		for (const check of checks) operations.push({ host, check });
	}
	return { targets, checks, operations };
}

function cleanOutput(buffer) {
	return buffer
		.toString("utf8")
		.replace(/\r\n?/g, "\n")
		.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, "�")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "�")
		.trimEnd();
}

export function runSshCheck(operation, {
	sshBin = process.env.OPS_SSH_BIN || "ssh",
	signal,
	maxOutputBytes = OBSERVE_LIMITS.maxOutputBytes,
	nowMs = () => Date.now(),
	spawnProcess = spawn,
	killGraceMs = 250,
	settleGraceMs = 1000,
} = {}) {
	const { host, check } = operation;
	return new Promise((resolve, reject) => {
		const startedAt = nowMs();
		const child = spawnProcess(sshBin, [
			"-T",
			"-o", "BatchMode=yes",
			"-o", "ForwardAgent=no",
			"-o", "ForwardX11=no",
			"-o", "ClearAllForwardings=yes",
			"-o", "PermitLocalCommand=no",
			"-o", "UpdateHostKeys=no",
			"-o", "StrictHostKeyChecking=yes",
			"--", host, "sh", "-s",
		], {
			stdio: ["pipe", "pipe", "pipe"],
		});
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
			checkId: check.id,
			label: check.label,
			collected:
				failure === null &&
				exitCode !== null &&
				check.acceptedExitCodes.includes(exitCode),
			exitCode,
			signal: closeSignal,
			failure,
			stdout: cleanOutput(Buffer.concat(stdout)),
			stderr: cleanOutput(Buffer.concat(stderr)),
			durationMs: Math.max(0, nowMs() - startedAt),
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
				const error = new Error("observation aborted");
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
			if (killTimer === undefined) {
				killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
			}
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

		timeoutTimer = setTimeout(() => stop("timeout"), check.timeoutSeconds * 1000);
		child.stdout.on("data", capture(stdout));
		child.stderr.on("data", capture(stderr));
		child.stdin.on("error", () => {
			// The process error/close handler below owns the structured result.
		});
		child.on("error", (error) => {
			if (failure === "aborted") {
				finishStopped();
				return;
			}
			if (failure === null) failure = "spawn";
			const result = resultFor();
			result.stderr = error instanceof Error ? error.message : String(error);
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
		child.stdin.end(`set -f\nLC_ALL=C\nexport LC_ALL\n${check.command}\n`);
	});
}

export async function runBounded(items, limit, worker, signal) {
	if (!Number.isInteger(limit) || limit < 1) throw new Error("concurrency must be a positive integer");
	const results = new Array(items.length);
	let nextIndex = 0;
	const take = () => {
		if (signal?.aborted || nextIndex >= items.length) return null;
		const index = nextIndex;
		nextIndex += 1;
		return index;
	};
	const runWorker = async () => {
		while (true) {
			const index = take();
			if (index === null) return;
			results[index] = await worker(items[index], index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
	if (signal?.aborted) {
		const error = new Error("observation aborted");
		error.name = "AbortError";
		throw error;
	}
	return results;
}

export async function executeObservation(plan, {
	runner = runSshCheck,
	concurrency = OBSERVE_LIMITS.hostConcurrency,
	signal,
} = {}) {
	const hostGroups = plan.targets.map((host) => ({
		host,
		operations: plan.operations.filter((operation) => operation.host === host),
	}));
	const groupedResults = await runBounded(
		hostGroups,
		concurrency,
		async (group) => {
			const results = [];
			for (const operation of group.operations) {
				if (signal?.aborted) {
					const error = new Error("observation aborted");
					error.name = "AbortError";
					throw error;
				}
				results.push(await runner(operation, { signal }));
			}
			return results;
		},
		signal,
	);
	return groupedResults.flat();
}

export async function observe(params, context, dependencies = {}) {
	// The full envelope is resolved before executeObservation is reachable. This
	// is the policy boundary: any bad target/check means zero SSH processes.
	const plan = preflightObservation(params, context);
	const results = await executeObservation(plan, dependencies);
	return { plan, results };
}

function utf8Bytes(value) {
	return Buffer.byteLength(value, "utf8");
}

function truncateUtf8(value, maxBytes) {
	if (maxBytes <= 0) return "";
	const buffer = Buffer.from(value, "utf8");
	if (buffer.length <= maxBytes) return value;
	return `${buffer.subarray(0, Math.max(0, maxBytes - 4)).toString("utf8").replace(/�$/u, "")}\n…`;
}

function formatResultSection(result) {
	const status = result.collected
		? `collected exit=${result.exitCode}`
		: `collection_failed=${result.failure ?? "exit"} exit=${result.exitCode ?? "-"}`;
	const lines = [`--- ${result.host}/${result.checkId} [${status}; ${result.durationMs}ms] ---`];
	if (result.stdout) lines.push(result.stdout);
	if (result.stderr) lines.push(`stderr: ${result.stderr}`);
	if (!result.stdout && !result.stderr) lines.push("(no output)");
	return lines.join("\n");
}

export function formatObservation(
	plan,
	results,
	receipt,
	{ maxBytes = OBSERVE_LIMITS.maxBatchOutputBytes } = {},
) {
	const lines = [
		`OBSERVATION RECEIPT ${receipt.id}`,
		`targets: ${plan.targets.join(", ")}`,
		`checks: ${plan.checks.map((check) => check.id).join(", ")}`,
		`collection: ${receipt.collected} completed / ${receipt.collectionFailed} failed`,
	];
	const truncatedOperations = [];
	const omittedOperations = [];
	const reserveBytes = Math.min(32 * 1024, Math.floor(maxBytes / 4));
	const sectionBudget = maxBytes - reserveBytes;
	for (let index = 0; index < results.length; index += 1) {
		const result = results[index];
		const operationId = `${result.host}/${result.checkId}`;
		const section = `\n\n${formatResultSection(result)}`;
		const current = lines.join("\n");
		const remaining = sectionBudget - utf8Bytes(current);
		if (utf8Bytes(section) <= remaining) {
			lines.push("", formatResultSection(result));
			continue;
		}
		if (remaining >= 256) {
			lines.push("", truncateUtf8(formatResultSection(result), remaining - 64), "[operation output truncated by batch budget]");
			truncatedOperations.push(operationId);
		} else {
			omittedOperations.push(operationId);
		}
		for (const later of results.slice(index + 1)) {
			omittedOperations.push(`${later.host}/${later.checkId}`);
		}
		break;
	}
	if (truncatedOperations.length > 0 || omittedOperations.length > 0) {
		lines.push(
			"",
			`OUTPUT BUDGET ${maxBytes} bytes`,
			`truncated operations: ${truncatedOperations.join(", ") || "none"}`,
			`omitted operations: ${omittedOperations.join(", ") || "none"}`,
		);
	}
	const text = truncateUtf8(lines.join("\n"), maxBytes);
	return { text, limitBytes: maxBytes, truncatedOperations, omittedOperations };
}
