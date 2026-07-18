import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
	fingerprintCheckCatalog,
	loadCheckCatalog,
	loadRunbookCatalog,
	resolveRunbook,
	validateCheckCatalog,
	validateRunbookCatalog,
} from "../lib/catalog.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("bundled check and runbook catalogs validate", () => {
	const checks = loadCheckCatalog(join(root, "checks", "catalog.json"));
	assert.match(fingerprintCheckCatalog(checks), /^[a-f0-9]{64}$/);
	const runbooks = loadRunbookCatalog(join(root, "runbooks", "catalog.json"), checks);
	const icinga = resolveRunbook(runbooks, "icinga-alert");
	assert.deepEqual(icinga.manualIds, ["base", "incident", "icinga-alert"]);
	assert.deepEqual(icinga.profiles, ["baseline", "monitoring", "icinga"]);
	const defaultCheckIds = new Set(icinga.profiles.flatMap((profile) => checks.profiles.get(profile)));
	assert.ok(defaultCheckIds.size * 3 <= 32, "three-host alert defaults exceed the operation envelope");
	assert.equal([...defaultCheckIds].some((id) => checks.checks.get(id).sensitivity === "sensitive"), false);
	assert.deepEqual(resolveRunbook(runbooks, "icinga-onboard").profiles, [
		"baseline",
		"icinga",
		"icinga_config",
	]);
	assert.match(icinga.manual, /never authorizes arbitrary shell or mutation/i);
	assert.match(icinga.manual, /not that the host, service/i);
	assert.match(icinga.focus, /ops_monitoring/);
	assert.match(icinga.focus, /smallest useful observation set/);
	assert.doesNotMatch(icinga.focus, /human-confirmed scope for audited reads/);
	assert.ok(icinga.focus.length < icinga.manual.length);
	for (const profileId of [
		"baseline",
		"monitoring",
		"network",
		"icinga",
		"icinga_config",
		"nagios",
		"nagios_config",
		"middleware",
	]) {
		for (const checkId of checks.profiles.get(profileId)) {
			assert.equal(checks.checks.get(checkId).sensitivity, "normal", `${profileId}/${checkId}`);
		}
	}
});

test("check catalogs reject duplicate IDs and dangling profile members", () => {
	const duplicate = {
		version: 1,
		checks: [
			{ id: "same", label: "A", command: "hostname" },
			{ id: "same", label: "B", command: "uptime" },
		],
		profiles: { base: ["same"] },
	};
	assert.throws(() => validateCheckCatalog(duplicate), /duplicates check same/);
	assert.throws(
		() =>
			validateCheckCatalog({
				version: 1,
				checks: [{ id: "known", label: "Known", command: "hostname" }],
				profiles: { base: ["missing"] },
			}),
		/references unknown check missing/,
	);
});

test("runbook catalogs reject unknown parents and inheritance cycles", () => {
	const temp = mkdtempSync(join(tmpdir(), "protocol-ops-runbooks-"));
	writeFileSync(join(temp, "one.md"), "One manual\n");
	const checks = validateCheckCatalog({
		version: 1,
		checks: [{ id: "host", label: "Host", command: "hostname" }],
		profiles: { base: ["host"] },
	});
	const entry = (id, parents) => ({
		id,
		label: id,
		description: `${id} description`,
		manual: "one.md",
		parents,
		default_profiles: ["base"],
		selectable: true,
	});
	assert.throws(
		() =>
			validateRunbookCatalog(
				{ version: 1, runbooks: [entry("child", ["missing"])] },
				"fixture",
				temp,
				checks,
			),
		/references unknown runbook missing/,
	);
	assert.throws(
		() =>
			validateRunbookCatalog(
				{ version: 1, runbooks: [entry("one", ["two"]), entry("two", ["one"])] },
				"fixture",
				temp,
				checks,
			),
		/inheritance cycle/,
	);
});

test("machine-local check catalogs must be private and cannot replace bundled IDs", () => {
	const temp = mkdtempSync(join(tmpdir(), "protocol-ops-local-checks-"));
	const local = join(temp, "checks.json");
	const bundled = join(root, "checks", "catalog.json");
	const replacement = {
		version: 1,
		checks: [{ id: "hostname", label: "Replacement", command: "hostname" }],
		profiles: { replacement: ["hostname"] },
	};
	writeFileSync(local, `${JSON.stringify(replacement)}\n`, { mode: 0o600 });
	assert.throws(() => loadCheckCatalog(bundled, local), /attempts to replace bundled check hostname/);

	const addition = {
		version: 1,
		checks: [{ id: "local_status", label: "Local", command: "appctl status" }],
		profiles: { local: ["local_status"] },
	};
	writeFileSync(local, `${JSON.stringify(addition)}\n`, { mode: 0o600 });
	const merged = loadCheckCatalog(bundled, local);
	assert.equal(merged.checks.get("local_status").sensitivity, "sensitive");
	chmodSync(local, 0o666);
	assert.throws(() => loadCheckCatalog(bundled, local), /group\/world writable/);
});

test("the OS release check parses hostile values as data instead of shell", () => {
	const checks = loadCheckCatalog(join(root, "checks", "catalog.json"));
	const command = checks.checks.get("os_release").command;
	assert.doesNotMatch(command, /(?:^|[;&|]\s*)\.\s+\/etc\/os-release/);
	assert.doesNotMatch(command, /\bsource\s+\/etc\/os-release/);

	const temp = mkdtempSync(join(tmpdir(), "protocol-ops-os-release-"));
	const fixture = join(temp, "os-release");
	const marker = join(temp, "executed");
	writeFileSync(
		fixture,
		`NAME=Fallback\nPRETTY_NAME="$(touch ${marker}) Hostile Linux"\n`,
		{ mode: 0o600 },
	);
	const quote = (value) => `'${value.replaceAll("'", `'"'"'`)}'`;
	const fixtureCommand = command.replaceAll("/etc/os-release", quote(fixture));
	const result = spawnSync("sh", ["-c", fixtureCommand], { encoding: "utf8" });
	assert.equal(result.status, 0, result.stderr);
	assert.equal(result.stdout.trim(), `$(touch ${marker}) Hostile Linux`);
	assert.equal(existsSync(marker), false, "hostile os-release command substitution executed");
});
