import { randomUUID } from "node:crypto";
import {
	assertBoundedString,
	assertExactKeys,
	assertSafeId,
	assertSafeTicket,
	assertStringList,
	assertUniqueStrings,
	MAX_OPERATION_ID_LENGTH,
	SAFE_HOST,
} from "./validation.js";

export const TASK_ENTRY_TYPE = "protocol-ops/task-state";
export const RECEIPT_ENTRY_TYPE = "protocol-ops/observation-receipt";
export const READ_SCOPE_TTL_MS = 12 * 60 * 60 * 1000;
export const TASK_PHASES = [
	"discover",
	"analyze",
	"plan",
	"review",
	"awaiting_approval",
	"verify",
	"done",
	"blocked",
];

export function assertCheckpointTurnAllowed({
	currentTurnIndex,
	lastTaskDeclarationTurnIndex,
	lastObservationTurnIndex,
	blockedObservationTurnIndex,
}) {
	if (lastTaskDeclarationTurnIndex === currentTurnIndex || blockedObservationTurnIndex === currentTurnIndex) {
		throw new Error(
			"ops_checkpoint was generated in the same model turn as a task declaration; inspect the task result and checkpoint on the next model turn",
		);
	}
	if (lastObservationTurnIndex === currentTurnIndex) {
		throw new Error(
			"ops_checkpoint was generated in the same model turn as a Protocol Ops read; inspect the result and checkpoint on the next model turn",
		);
	}
}

function assertTimestamp(value, label) {
	const text = assertBoundedString(value, label, 40);
	if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || Number.isNaN(Date.parse(text))) {
		throw new Error(`${label} must be an ISO timestamp`);
	}
	return text;
}

function validateRunbookSnapshot(value) {
	const record = assertExactKeys(
		value,
		["manuals", "profiles", "checkCatalogSha256"],
		"restored task.runbook",
	);
	if (!Array.isArray(record.manuals) || record.manuals.length === 0 || record.manuals.length > 8) {
		throw new Error("restored task.runbook.manuals must contain one through eight entries");
	}
	const manuals = record.manuals.map((entry, index) => {
		const manual = assertExactKeys(entry, ["id", "sha256"], `restored task.runbook.manuals[${index}]`);
		const id = assertSafeId(manual.id, `restored task.runbook.manuals[${index}].id`);
		if (typeof manual.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(manual.sha256)) {
			throw new Error(`restored task.runbook.manuals[${index}].sha256 is invalid`);
		}
		return { id, sha256: manual.sha256 };
	});
	const profiles = assertUniqueStrings(record.profiles, "restored task.runbook.profiles", {
		max: 8,
		pattern: /^[a-z0-9][a-z0-9._-]{0,63}$/,
	});
	if (typeof record.checkCatalogSha256 !== "string" || !/^[a-f0-9]{64}$/.test(record.checkCatalogSha256)) {
		throw new Error("restored task.runbook.checkCatalogSha256 is invalid");
	}
	return { manuals, profiles, checkCatalogSha256: record.checkCatalogSha256 };
}

function validateReadScope(value, targets) {
	const record = assertExactKeys(
		value,
		["method", "approvedAt", "expiresAt", "targets"],
		"restored task.readScope",
	);
	if (record.method !== "human-confirmation") {
		throw new Error("restored task.readScope.method is invalid");
	}
	const scopeTargets = assertUniqueStrings(record.targets, "restored task.readScope.targets", {
		min: 1,
		max: 8,
		pattern: SAFE_HOST,
	});
	if (JSON.stringify(scopeTargets) !== JSON.stringify(targets)) {
		throw new Error("restored task read scope does not match task targets");
	}
	const approvedAt = assertTimestamp(record.approvedAt, "restored task.readScope.approvedAt");
	const expiresAt = assertTimestamp(record.expiresAt, "restored task.readScope.expiresAt");
	const lifetimeMs = Date.parse(expiresAt) - Date.parse(approvedAt);
	if (lifetimeMs <= 0 || lifetimeMs > READ_SCOPE_TTL_MS) {
		throw new Error("restored task.readScope expiration is invalid");
	}
	return {
		method: record.method,
		approvedAt,
		expiresAt,
		targets: scopeTargets,
	};
}

function validateReceipt(value, index, taskId) {
	const label = `restored task.receipts[${index}]`;
	const record = assertExactKeys(
		value,
		[
			"id",
			"taskId",
			"at",
			"targets",
			"checks",
			"operations",
			"collected",
			"collectionFailed",
			"failedOperations",
			"output",
		],
		label,
	);
	const id = assertBoundedString(record.id, `${label}.id`, 128);
	if (record.taskId !== taskId) throw new Error(`${label}.taskId does not match the active task`);
	const targets = assertUniqueStrings(record.targets, `${label}.targets`, { min: 1, max: 4, pattern: SAFE_HOST });
	const checks = assertUniqueStrings(record.checks, `${label}.checks`, {
		min: 1,
		max: 16,
		pattern: /^[a-z0-9][a-z0-9._-]{0,63}$/,
	});
	for (const key of ["operations", "collected", "collectionFailed"]) {
		if (!Number.isInteger(record[key]) || record[key] < 0 || record[key] > 32) {
			throw new Error(`${label}.${key} is invalid`);
		}
	}
	if (record.operations !== record.collected + record.collectionFailed) {
		throw new Error(`${label} operation totals do not add up`);
	}
	const failedOperations = assertStringList(record.failedOperations, `${label}.failedOperations`, {
		maxItems: 32,
		maxLength: MAX_OPERATION_ID_LENGTH,
	});
	if (failedOperations.length !== record.collectionFailed) {
		throw new Error(`${label}.failedOperations does not match failed count`);
	}
	let output;
	if (record.output !== undefined) {
		const outputRecord = assertExactKeys(
			record.output,
			["limitBytes", "truncatedOperations", "omittedOperations"],
			`${label}.output`,
		);
		if (!Number.isInteger(outputRecord.limitBytes) || outputRecord.limitBytes < 1024 || outputRecord.limitBytes > 262144) {
			throw new Error(`${label}.output.limitBytes is invalid`);
		}
		output = {
			limitBytes: outputRecord.limitBytes,
			truncatedOperations: assertStringList(
				outputRecord.truncatedOperations,
				`${label}.output.truncatedOperations`,
				{ maxItems: 32, maxLength: MAX_OPERATION_ID_LENGTH },
			),
			omittedOperations: assertStringList(
				outputRecord.omittedOperations,
				`${label}.output.omittedOperations`,
				{ maxItems: 32, maxLength: MAX_OPERATION_ID_LENGTH },
			),
		};
	}
	return {
		id,
		taskId,
		at: assertTimestamp(record.at, `${label}.at`),
		targets,
		checks,
		operations: record.operations,
		collected: record.collected,
		collectionFailed: record.collectionFailed,
		failedOperations,
		...(output ? { output } : {}),
	};
}

export function validateRestoredTask(value) {
	const record = assertExactKeys(
		value,
		[
			"version",
			"active",
			"taskId",
			"taskType",
			"ticket",
			"objective",
			"targets",
			"readScope",
			"runbook",
			"phase",
			"summary",
			"facts",
			"nextSteps",
			"blockers",
			"receipts",
			"createdAt",
			"updatedAt",
		],
		"restored task",
	);
	if (record.version !== 1 || record.active !== true) throw new Error("restored task version/active state is invalid");
	const taskId = assertBoundedString(record.taskId, "restored task.taskId", 128);
	const targets = assertUniqueStrings(record.targets, "restored task.targets", { min: 1, max: 8, pattern: SAFE_HOST });
	if (typeof record.phase !== "string" || !TASK_PHASES.includes(record.phase)) {
		throw new Error("restored task.phase is invalid");
	}
	if (!Array.isArray(record.receipts) || record.receipts.length > 10) {
		throw new Error("restored task.receipts is invalid");
	}
	return {
		version: 1,
		active: true,
		taskId,
		taskType: assertSafeId(record.taskType, "restored task.taskType"),
		ticket: assertSafeTicket(record.ticket, "restored task.ticket", { optional: true }),
		objective: assertBoundedString(record.objective, "restored task.objective", 1000),
		targets,
		readScope: validateReadScope(record.readScope, targets),
		runbook: validateRunbookSnapshot(record.runbook),
		phase: record.phase,
		summary: assertBoundedString(record.summary, "restored task.summary", 1200),
		facts: assertStringList(record.facts, "restored task.facts", { maxItems: 12, maxLength: 400 }),
		nextSteps: assertStringList(record.nextSteps, "restored task.nextSteps", { maxItems: 8, maxLength: 400 }),
		blockers: assertStringList(record.blockers, "restored task.blockers", { maxItems: 8, maxLength: 400 }),
		receipts: record.receipts.map((receipt, index) => validateReceipt(receipt, index, taskId)),
		createdAt: assertTimestamp(record.createdAt, "restored task.createdAt"),
		updatedAt: assertTimestamp(record.updatedAt, "restored task.updatedAt"),
	};
}

function assertKnownTargets(targets, inventory, label, max = 8) {
	const names = assertUniqueStrings(targets, label, { min: 1, max, pattern: SAFE_HOST });
	for (const name of names) {
		if (!inventory.has(name)) throw new Error(`${label} contains a host outside the inventory: ${name}`);
	}
	return names;
}

export function createTask(params, { inventory, runbooks, now = () => new Date(), makeId = randomUUID }) {
	const input = assertExactKeys(params, ["task_type", "ticket", "objective", "targets"], "ops_task input");
	if (typeof input.task_type !== "string") throw new Error("ops_task input.task_type is required");
	const runbook = runbooks.get(input.task_type);
	if (!runbook || !runbook.selectable) throw new Error(`unknown task type: ${input.task_type}`);
	const ticket = assertSafeTicket(input.ticket, "ops_task input.ticket", { optional: true });
	const objective = assertBoundedString(input.objective, "ops_task input.objective", 1000);
	const targets = assertKnownTargets(input.targets, inventory, "ops_task input.targets");
	const timestamp = now().toISOString();
	return {
		version: 1,
		active: true,
		taskId: makeId(),
		taskType: input.task_type,
		ticket,
		objective,
		targets,
		phase: "discover",
		summary: "Task declared; discovery has not started.",
		facts: [],
		nextSteps: [],
		blockers: [],
		receipts: [],
		createdAt: timestamp,
		updatedAt: timestamp,
	};
}

export function checkpointTask(current, params, { now = () => new Date() } = {}) {
	if (!current?.active) throw new Error("no active Protocol Ops task; call ops_task first");
	const input = assertExactKeys(
		params,
		["phase", "summary", "facts", "next_steps", "blockers"],
		"ops_checkpoint input",
	);
	if (typeof input.phase !== "string" || !TASK_PHASES.includes(input.phase)) {
		throw new Error(`ops_checkpoint input.phase must be one of: ${TASK_PHASES.join(", ")}`);
	}
	return {
		...current,
		phase: input.phase,
		summary: assertBoundedString(input.summary, "ops_checkpoint input.summary", 1200),
		facts:
			input.facts === undefined
				? current.facts
				: assertStringList(input.facts, "ops_checkpoint input.facts", { maxItems: 12, maxLength: 400 }),
		nextSteps:
			input.next_steps === undefined
				? current.nextSteps
				: assertStringList(input.next_steps, "ops_checkpoint input.next_steps", {
					maxItems: 8,
					maxLength: 400,
				}),
		blockers:
			input.blockers === undefined
				? current.blockers
				: assertStringList(input.blockers, "ops_checkpoint input.blockers", {
					maxItems: 8,
					maxLength: 400,
				}),
		updatedAt: now().toISOString(),
	};
}

export function addReceipt(current, receipt, { now = () => new Date() } = {}) {
	if (!current?.active) throw new Error("no active Protocol Ops task");
	return {
		...current,
		receipts: [...current.receipts, receipt].slice(-10),
		updatedAt: now().toISOString(),
	};
}

export function makeReceipt(
	plan,
	results,
	{ taskId, now = () => new Date(), makeId = randomUUID } = {},
) {
	const failures = results.filter((result) => !result.collected);
	return {
		id: makeId(),
		taskId,
		at: now().toISOString(),
		targets: [...plan.targets],
		checks: plan.checks.map((check) => check.id),
		operations: results.length,
		collected: results.length - failures.length,
		collectionFailed: failures.length,
		failedOperations: failures.map((result) => `${result.host}/${result.checkId}`),
	};
}

export function restoreTask(branch, { onInvalid } = {}) {
	let current = null;
	for (const entry of branch) {
		if (entry?.type !== "custom" || entry.customType !== TASK_ENTRY_TYPE) continue;
		const candidate = entry.data;
		if (candidate === null || candidate?.active === false) {
			current = null;
		} else {
			try {
				current = validateRestoredTask(candidate);
			} catch (error) {
				current = null;
				onInvalid?.(error instanceof Error ? error.message : String(error));
			}
		}
	}
	return current;
}

export function taskPromptState(task) {
	if (!task?.active) return null;
	return {
		task_id: task.taskId,
		task_type: task.taskType,
		runbook: task.runbook,
		ticket: task.ticket,
		objective: task.objective,
		targets: task.targets,
		read_scope: task.readScope,
		phase: task.phase,
		summary: task.summary,
		facts: task.facts,
		next_steps: task.nextSteps,
		blockers: task.blockers,
		receipts: task.receipts,
		updated_at: task.updatedAt,
	};
}
