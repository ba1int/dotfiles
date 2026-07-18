import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import {
	assertBoundedString,
	assertExactKeys,
	assertPlainObject,
	assertSafeId,
	assertUniqueStrings,
	SAFE_ID,
} from "./validation.js";

function readJson(path, label) {
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`could not read ${label} ${path}: ${message}`);
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`invalid JSON in ${label} ${path}: ${message}`);
	}
}

export function assertTrustedLocalFile(path) {
	const stat = statSync(path);
	const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
	if (uid !== undefined && stat.uid !== uid) {
		throw new Error(`local Protocol Ops config is not owned by the current user: ${path}`);
	}
	if ((stat.mode & 0o022) !== 0) {
		throw new Error(`local Protocol Ops config is group/world writable: ${path}`);
	}
}

function validateCheck(raw, source, index, defaultSensitivity) {
	const label = `${source} checks[${index}]`;
	const record = assertExactKeys(
		raw,
		["id", "label", "command", "timeout_seconds", "accepted_exit_codes", "sensitivity"],
		label,
	);
	const id = assertSafeId(record.id, `${label}.id`);
	const displayLabel = assertBoundedString(record.label, `${label}.label`, 80);
	const command = assertBoundedString(record.command, `${label}.command`, 4096);
	const sensitivity = record.sensitivity ?? defaultSensitivity;
	if (sensitivity !== "normal" && sensitivity !== "sensitive") {
		throw new Error(`${label}.sensitivity must be normal or sensitive`);
	}
	const timeoutSeconds = record.timeout_seconds ?? 10;
	if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 30) {
		throw new Error(`${label}.timeout_seconds must be an integer from 1 through 30`);
	}
	const accepted = record.accepted_exit_codes ?? [0];
	if (!Array.isArray(accepted) || accepted.length === 0 || accepted.length > 8) {
		throw new Error(`${label}.accepted_exit_codes must contain one through eight exit codes`);
	}
	const acceptedExitCodes = [];
	const seen = new Set();
	for (const code of accepted) {
		if (!Number.isInteger(code) || code < 0 || code > 255 || seen.has(code)) {
			throw new Error(`${label}.accepted_exit_codes contains an invalid or duplicate exit code`);
		}
		seen.add(code);
		acceptedExitCodes.push(code);
	}
	return { id, label: displayLabel, command, timeoutSeconds, acceptedExitCodes, sensitivity };
}

export function validateCheckCatalog(raw, source = "check catalog", { defaultSensitivity = "normal" } = {}) {
	const root = assertExactKeys(raw, ["version", "checks", "profiles"], source);
	if (root.version !== 1) throw new Error(`${source}.version must be 1`);
	if (!Array.isArray(root.checks) || root.checks.length === 0) {
		throw new Error(`${source}.checks must contain at least one check`);
	}
	const checks = new Map();
	root.checks.forEach((entry, index) => {
		const check = validateCheck(entry, source, index, defaultSensitivity);
		if (checks.has(check.id)) throw new Error(`${source} duplicates check ${check.id}`);
		checks.set(check.id, check);
	});

	const profileRecord = assertPlainObject(root.profiles, `${source}.profiles`);
	const profiles = new Map();
	for (const [id, value] of Object.entries(profileRecord)) {
		assertSafeId(id, `${source} profile id`);
		const checkIds = assertUniqueStrings(value, `${source}.profiles.${id}`, {
			min: 1,
			max: 12,
			pattern: SAFE_ID,
		});
		for (const checkId of checkIds) {
			if (!checks.has(checkId)) {
				throw new Error(`${source} profile ${id} references unknown check ${checkId}`);
			}
		}
		profiles.set(id, checkIds);
	}
	if (profiles.size === 0) throw new Error(`${source} contains no profiles`);
	return { checks, profiles };
}

export function mergeCheckCatalogs(base, addition, source = "local check catalog") {
	const checks = new Map(base.checks);
	const profiles = new Map(base.profiles);
	for (const [id, check] of addition.checks) {
		if (checks.has(id)) throw new Error(`${source} attempts to replace bundled check ${id}`);
		checks.set(id, check);
	}
	for (const [id, checkIds] of addition.profiles) {
		if (profiles.has(id)) throw new Error(`${source} attempts to replace bundled profile ${id}`);
		profiles.set(id, checkIds);
	}
	return { checks, profiles };
}

export function loadCheckCatalog(bundledPath, localPath) {
	let catalog = validateCheckCatalog(readJson(bundledPath, "check catalog"), bundledPath);
	if (localPath && existsSync(localPath)) {
		assertTrustedLocalFile(localPath);
		const addition = validateCheckCatalog(readJson(localPath, "local check catalog"), localPath, {
			defaultSensitivity: "sensitive",
		});
		catalog = mergeCheckCatalogs(catalog, addition, localPath);
	}
	return catalog;
}

export function fingerprintCheckCatalog(catalog) {
	const checks = [...catalog.checks.values()]
		.map(({ id, label, command, timeoutSeconds, acceptedExitCodes, sensitivity }) => ({
			id,
			label,
			command,
			timeoutSeconds,
			acceptedExitCodes,
			sensitivity,
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
	const profiles = [...catalog.profiles.entries()]
		.map(([id, members]) => ({ id, members }))
		.sort((left, right) => left.id.localeCompare(right.id));
	return createHash("sha256").update(JSON.stringify({ checks, profiles })).digest("hex");
}

function validateRunbookEntry(raw, source, index) {
	const label = `${source} runbooks[${index}]`;
	const record = assertExactKeys(
		raw,
		["id", "label", "description", "manual", "parents", "default_profiles", "selectable"],
		label,
	);
	const id = assertSafeId(record.id, `${label}.id`);
	const manual = assertBoundedString(record.manual, `${label}.manual`, 100);
	if (basename(manual) !== manual || !manual.endsWith(".md")) {
		throw new Error(`${label}.manual must be one Markdown filename`);
	}
	return {
		id,
		label: assertBoundedString(record.label, `${label}.label`, 80),
		description: assertBoundedString(record.description, `${label}.description`, 300),
		manual,
		parents: assertUniqueStrings(record.parents ?? [], `${label}.parents`, { max: 8, pattern: SAFE_ID }),
		defaultProfiles: assertUniqueStrings(record.default_profiles ?? [], `${label}.default_profiles`, {
			max: 8,
			pattern: SAFE_ID,
		}),
		selectable: record.selectable === true,
	};
}

function verifyRunbookGraph(runbooks, source) {
	const visiting = new Set();
	const visited = new Set();
	const visit = (id, trail) => {
		if (visiting.has(id)) throw new Error(`${source} contains a runbook inheritance cycle: ${[...trail, id].join(" -> ")}`);
		if (visited.has(id)) return;
		const runbook = runbooks.get(id);
		if (!runbook) throw new Error(`${source} references unknown runbook ${id}`);
		visiting.add(id);
		for (const parent of runbook.parents) visit(parent, [...trail, id]);
		visiting.delete(id);
		visited.add(id);
	};
	for (const id of runbooks.keys()) visit(id, []);
}

export function validateRunbookCatalog(raw, source, catalogDir, checkCatalog) {
	const root = assertExactKeys(raw, ["version", "runbooks"], source);
	if (root.version !== 1) throw new Error(`${source}.version must be 1`);
	if (!Array.isArray(root.runbooks) || root.runbooks.length === 0) {
		throw new Error(`${source}.runbooks must contain at least one runbook`);
	}
	const runbooks = new Map();
	root.runbooks.forEach((entry, index) => {
		const runbook = validateRunbookEntry(entry, source, index);
		if (runbooks.has(runbook.id)) throw new Error(`${source} duplicates runbook ${runbook.id}`);
		for (const profile of runbook.defaultProfiles) {
			if (!checkCatalog.profiles.has(profile)) {
				throw new Error(`${source} runbook ${runbook.id} references unknown profile ${profile}`);
			}
		}
		const manualPath = resolve(catalogDir, runbook.manual);
		if (dirname(manualPath) !== resolve(catalogDir)) {
			throw new Error(`${source} runbook ${runbook.id} escapes its catalog directory`);
		}
		runbook.manualText = assertBoundedString(
			readFileSync(manualPath, "utf8"),
			`${source} runbook ${runbook.id} manual`,
			12000,
		);
		runbook.manualSha256 = createHash("sha256").update(runbook.manualText).digest("hex");
		runbooks.set(runbook.id, runbook);
	});
	verifyRunbookGraph(runbooks, source);
	if (![...runbooks.values()].some((runbook) => runbook.selectable)) {
		throw new Error(`${source} has no selectable runbook`);
	}
	return runbooks;
}

export function loadRunbookCatalog(path, checkCatalog) {
	return validateRunbookCatalog(readJson(path, "runbook catalog"), path, dirname(path), checkCatalog);
}

export function resolveRunbook(runbooks, id) {
	const selected = runbooks.get(id);
	if (!selected || !selected.selectable) throw new Error(`unknown task type: ${id}`);
	const ordered = [];
	const seen = new Set();
	const visit = (currentId) => {
		if (seen.has(currentId)) return;
		const current = runbooks.get(currentId);
		if (!current) throw new Error(`unknown parent runbook: ${currentId}`);
		for (const parent of current.parents) visit(parent);
		seen.add(currentId);
		ordered.push(current);
	};
	visit(id);
	const profiles = [];
	const seenProfiles = new Set();
	for (const runbook of ordered) {
		for (const profile of runbook.defaultProfiles) {
			if (!seenProfiles.has(profile)) {
				seenProfiles.add(profile);
				profiles.push(profile);
			}
		}
	}
	return {
		id,
		label: selected.label,
		description: selected.description,
		profiles,
		manual: ordered.map((runbook) => `## ${runbook.label}\n\n${runbook.manualText}`).join("\n\n"),
		manualIds: ordered.map((runbook) => runbook.id),
		manuals: ordered.map((runbook) => ({ id: runbook.id, sha256: runbook.manualSha256 })),
	};
}

export function describeCatalog(checkCatalog, runbooks) {
	return {
		profiles: [...checkCatalog.profiles.keys()].sort(),
		checks: [...checkCatalog.checks.keys()].sort(),
		sensitiveChecks: [...checkCatalog.checks.values()]
			.filter((check) => check.sensitivity === "sensitive")
			.map((check) => check.id)
			.sort(),
		taskTypes: [...runbooks.values()]
			.filter((runbook) => runbook.selectable)
			.map((runbook) => runbook.id)
			.sort(),
	};
}
