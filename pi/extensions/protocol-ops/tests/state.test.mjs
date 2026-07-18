import assert from "node:assert/strict";
import test from "node:test";
import { checkpointTask, createTask, restoreTask, TASK_ENTRY_TYPE } from "../lib/state.js";

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
