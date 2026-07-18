import { assertUniqueStrings, SAFE_HOST } from "./validation.js";

const TERMINAL_TASK_PHASES = new Set(["done", "blocked"]);

export function assertActiveReadScope(task, { nowMs = () => Date.now() } = {}) {
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
}

export function selectScopedTargets(value, {
	task,
	inventory,
	maxTargets,
	label,
}) {
	const targets = assertUniqueStrings(value, `${label}.targets`, {
		min: 1,
		max: maxTargets,
		pattern: SAFE_HOST,
	});
	const declared = new Set(task.targets);
	for (const host of targets) {
		if (!inventory.has(host)) throw new Error(`${label} target is outside the inventory: ${host}`);
		if (!declared.has(host)) throw new Error(`${label} target is outside the active task: ${host}`);
	}
	return targets;
}
