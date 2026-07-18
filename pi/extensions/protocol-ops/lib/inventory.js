import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { assertSafeHost } from "./validation.js";

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
