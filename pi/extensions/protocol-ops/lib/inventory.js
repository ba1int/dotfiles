import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	assertBoundedString,
	assertExactKeys,
	assertSafeHost,
} from "./validation.js";

const INVENTORY_FILTER_FIELDS = ["environment", "role", "site"];

export function resolveInventoryPath(env = process.env) {
	if (env.OPS_INVENTORY?.trim()) return env.OPS_INVENTORY.trim();
	if (env.HOP_INVENTORY?.trim()) return env.HOP_INVENTORY.trim();
	const configHome = env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
	return join(configHome, "hop", "hosts.tsv");
}

export function parseInventory(text, source = "inventory") {
	if (typeof text !== "string") throw new Error(`${source} must contain text`);
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	if (lines.at(-1) === "") lines.pop();
	if (lines[0] !== "name\tenvironment\trole\tsite") {
		throw new Error(`${source} has an invalid header`);
	}

	const records = new Map();
	for (let index = 1; index < lines.length; index += 1) {
		const lineNumber = index + 1;
		const fields = lines[index].split("\t");
		if (fields.length !== 4 || fields.some((field) => field.length === 0)) {
			throw new Error(`${source}:${lineNumber} must contain four nonempty tab-separated fields`);
		}
		const [name, environment, role, site] = fields;
		assertSafeHost(name, `${source}:${lineNumber} host`);
		if (fields.some((field) => /[\x00-\x1f\x7f]/.test(field))) {
			throw new Error(`${source}:${lineNumber} contains a control character`);
		}
		if (records.has(name)) {
			throw new Error(`${source}:${lineNumber} duplicates host ${name}`);
		}
		records.set(name, { name, environment, role, site });
	}

	if (records.size === 0) throw new Error(`${source} contains no host records`);
	return records;
}

function validateInventoryFilter(value) {
	const input = assertExactKeys(value, INVENTORY_FILTER_FIELDS, "ops_task input.inventory_filter");
	const filter = {};
	for (const field of INVENTORY_FILTER_FIELDS) {
		if (input[field] === undefined) continue;
		const selected = assertBoundedString(
			input[field],
			`ops_task input.inventory_filter.${field}`,
			128,
		);
		if (/[\t\r\n]/.test(selected)) {
			throw new Error(`ops_task input.inventory_filter.${field} must be one single-line exact value`);
		}
		filter[field] = selected;
	}
	if (Object.keys(filter).length === 0) {
		throw new Error("ops_task input.inventory_filter needs environment, role, or site");
	}
	return filter;
}

export function resolveInventoryFilter(records, value, { maxTargets = 8 } = {}) {
	if (!(records instanceof Map)) throw new Error("Protocol Ops inventory must be a Map");
	if (!Number.isInteger(maxTargets) || maxTargets < 1) {
		throw new Error("inventory filter target limit must be a positive integer");
	}
	const filter = validateInventoryFilter(value);
	const targets = [];
	for (const record of records.values()) {
		if (Object.entries(filter).every(([field, selected]) => record[field] === selected)) {
			targets.push(record.name);
		}
	}
	const summary = Object.entries(filter).map(([field, selected]) => `${field}=${selected}`).join(", ");
	if (targets.length === 0) {
		throw new Error(`ops_task inventory filter matched no hosts: ${summary}`);
	}
	if (targets.length > maxTargets) {
		throw new Error(
			`ops_task inventory filter matched ${targets.length} hosts; narrow it to at most ${maxTargets} (no hosts were selected)`,
		);
	}
	return { filter, targets };
}

export function materializeTaskInput(params, records, { maxTargets = 8 } = {}) {
	const input = assertExactKeys(
		params,
		["task_type", "ticket", "objective", "targets", "inventory_filter"],
		"ops_task input",
	);
	const hasTargets = input.targets !== undefined;
	const hasFilter = input.inventory_filter !== undefined;
	if (hasTargets === hasFilter) {
		throw new Error("ops_task input requires exactly one of targets or inventory_filter");
	}
	const resolved = hasFilter
		? resolveInventoryFilter(records, input.inventory_filter, { maxTargets })
		: { filter: null, targets: input.targets };
	return {
		params: {
			task_type: input.task_type,
			...(input.ticket === undefined ? {} : { ticket: input.ticket }),
			objective: input.objective,
			targets: resolved.targets,
		},
		filter: resolved.filter,
	};
}

export function loadInventory(path = resolveInventoryPath()) {
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`could not read inventory ${path}: ${message}`);
	}
	return { path, records: parseInventory(text, path) };
}
