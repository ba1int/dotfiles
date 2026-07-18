import assert from "node:assert/strict";
import test from "node:test";
import {
	assertCheckpointTurnAllowed,
	checkpointTask,
	createTask,
	restoreTask,
	TASK_ENTRY_TYPE,
} from "../lib/state.js";

const inventory = new Map([["app01", { name: "app01" }]]);
const runbooks = new Map([["incident", { id: "incident", selectable: true }]]);
const now = () => new Date("2026-07-18T12:00:00.000Z");

function restorableTask(overrides = {}) {
	const task = createTask(
		{ task_type: "incident", objective: "Find the fault", targets: ["app01"] },
		{ inventory, runbooks, now, makeId: () => "task-1" },
	);
	return {
		...task,
		readScope: {
			method: "human-confirmation",
			approvedAt: "2026-07-18T12:00:00.000Z",
			expiresAt: "2026-07-19T00:00:00.000Z",
			targets: ["app01"],
		},
		runbook: {
			manuals: [{ id: "incident", sha256: "a".repeat(64) }],
			profiles: ["baseline"],
			checkCatalogSha256: "b".repeat(64),
		},
		...overrides,
	};
}

test("task state uses exact runbook and inventory IDs", () => {
	const task = createTask(
		{ task_type: "incident", ticket: "INC-42", objective: "Find the fault", targets: ["app01"] },
		{ inventory, runbooks, now, makeId: () => "task-1" },
	);
	assert.equal(task.taskId, "task-1");
	assert.equal(task.phase, "discover");
	assert.throws(
		() =>
			createTask(
				{ task_type: "incident", objective: "Nope", targets: ["root@app01"] },
				{ inventory, runbooks, now },
			),
		/unsafe value/,
	);
	assert.throws(
		() =>
			createTask(
				{
					task_type: "incident",
					ticket: "INC-42\nHosts: attacker",
					objective: "No dialog spoofing",
					targets: ["app01"],
				},
				{ inventory, runbooks, now },
			),
		/single-line ticket/,
	);
});

test("checkpoint rejects command-shaped extras and remains non-authorizing", () => {
	const task = createTask(
		{ task_type: "incident", objective: "Find the fault", targets: ["app01"] },
		{ inventory, runbooks, now, makeId: () => "task-1" },
	);
	assert.throws(
		() => checkpointTask(task, { phase: "plan", summary: "Ready", command: "systemctl restart app" }),
		/unsupported field.*command/,
	);
	assert.throws(
		() => checkpointTask(task, { phase: "apply", summary: "Mutating" }),
		/must be one of/,
	);
	const checkpoint = checkpointTask(
		task,
		{ phase: "review", summary: "Plan needs review", facts: ["Unit is failed"] },
		{ now },
	);
	assert.equal(checkpoint.phase, "review");
	assert.deepEqual(checkpoint.facts, ["Unit is failed"]);
	const later = checkpointTask(checkpoint, { phase: "plan", summary: "Plan drafted" }, { now });
	assert.deepEqual(later.facts, ["Unit is failed"]);
	assert.throws(
		() => checkpointTask({ ...later, phase: "done" }, { phase: "plan", summary: "Reopen" }, { now }),
		/task is done.*instead of reopening/,
	);
});

test("checkpoint cannot outrun task declarations or attempted reads in one model turn", () => {
	const base = {
		currentTurnIndex: 7,
		lastTaskDeclarationTurnIndex: null,
		lastObservationTurnIndex: null,
		blockedObservationTurnIndex: null,
		lastMutationTurnIndex: null,
	};
	assert.doesNotThrow(() => assertCheckpointTurnAllowed(base));
	assert.throws(
		() => assertCheckpointTurnAllowed({ ...base, lastTaskDeclarationTurnIndex: 7 }),
		/task declaration/,
	);
	assert.throws(
		() => assertCheckpointTurnAllowed({ ...base, blockedObservationTurnIndex: 7 }),
		/task declaration/,
	);
	assert.throws(
		() => assertCheckpointTurnAllowed({ ...base, lastObservationTurnIndex: 7 }),
		/Protocol Ops read/,
	);
	assert.throws(
		() => assertCheckpointTurnAllowed({ ...base, lastMutationTurnIndex: 7 }),
		/Protocol Ops mutation/,
	);
});

test("latest append-only task entry restores and tombstone clears it", () => {
	const task = restorableTask();
	const branch = [
		{ type: "custom", customType: TASK_ENTRY_TYPE, data: task },
		{ type: "custom", customType: TASK_ENTRY_TYPE, data: { ...task, phase: "plan" } },
	];
	assert.equal(restoreTask(branch).phase, "plan");
	branch.push({ type: "custom", customType: TASK_ENTRY_TYPE, data: { version: 1, active: false } });
	assert.equal(restoreTask(branch), null);
});

test("restored state rejects malformed or widened read scope", () => {
	let invalidReason;
	const invalid = restorableTask({
		readScope: {
			method: "human-confirmation",
			approvedAt: "2026-07-18T12:00:00.000Z",
			expiresAt: "2026-07-19T00:00:00.000Z",
			targets: ["other"],
		},
	});
	const restored = restoreTask(
		[{ type: "custom", customType: TASK_ENTRY_TYPE, data: invalid }],
		{ onInvalid: (message) => { invalidReason = message; } },
	);
	assert.equal(restored, null);
	assert.match(invalidReason, /read scope does not match/);
});

test("typed monitoring receipt round-trips through durable task restoration", () => {
	const task = restorableTask({
		receipts: [{
			id: "monitoring-receipt-1",
			taskId: "task-1",
			at: "2026-07-18T12:01:00.000Z",
			targets: ["app01"],
			checks: ["icinga_checks"],
			operations: 1,
			collected: 1,
			collectionFailed: 0,
			failedOperations: [],
			output: {
				limitBytes: 64 * 1024,
				truncatedOperations: ["app01/icinga_checks"],
				omittedOperations: [],
			},
		}],
	});
	const restored = restoreTask([
		{ type: "custom", customType: TASK_ENTRY_TYPE, data: task },
	]);
	assert.equal(restored.receipts[0].checks[0], "icinga_checks");
	assert.deepEqual(restored.receipts[0].output.truncatedOperations, ["app01/icinga_checks"]);
});

test("receipt operation IDs support the full valid host-alias length", () => {
	const host = "a".repeat(253);
	const operation = `${host}/icinga_checks`;
	const task = restorableTask({
		targets: [host],
		readScope: {
			method: "human-confirmation",
			approvedAt: "2026-07-18T12:00:00.000Z",
			expiresAt: "2026-07-19T00:00:00.000Z",
			targets: [host],
		},
		receipts: [{
			id: "long-host-receipt",
			taskId: "task-1",
			at: "2026-07-18T12:01:00.000Z",
			targets: [host],
			checks: ["icinga_checks"],
			operations: 1,
			collected: 0,
			collectionFailed: 1,
			failedOperations: [operation],
			output: {
				limitBytes: 64 * 1024,
				truncatedOperations: [operation],
				omittedOperations: [operation],
			},
		}],
	});
	const restored = restoreTask([
		{ type: "custom", customType: TASK_ENTRY_TYPE, data: task },
	]);
	assert.equal(restored.receipts[0].failedOperations[0], operation);
	assert.equal(restored.receipts[0].output.truncatedOperations[0], operation);
});
