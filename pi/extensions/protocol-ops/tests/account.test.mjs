import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	accountConfirmationDecision,
	assertAccountPreflight,
	collectAccountPreflight,
	createAccountPlan,
	executeAccountPlan,
	generateTemporaryPassword,
	persistTemporaryPassword,
	runAccountSsh,
	summarizeAccountOutcome,
} from "../lib/account.js";

const inventory = new Map([
	["app01", { name: "app01", environment: "PROD", role: "middleware", site: "dc1" }],
	["app02", { name: "app02", environment: "PROD", role: "middleware", site: "dc2" }],
	["test01", { name: "test01", environment: "TEST", role: "middleware", site: "lab" }],
	["unknown01", { name: "unknown01", environment: "UNKNOWN", role: "middleware", site: "lab" }],
]);
const params = {
	targets: ["app01", "app02"],
	username: "bencsokb",
	shell: "/bin/bash",
	create_home: true,
	force_password_change: true,
};

test("account plans are direct, ticket-optional, normal-user-only, and inventory bounded", () => {
	const plan = createAccountPlan(params, {
		inventory,
		now: () => new Date("2026-07-18T12:00:00Z"),
		makeId: () => "plan-1",
	});
	assert.equal(plan.plan_id, "plan-1");
	assert.equal(plan.external_reference, null);
	assert.deepEqual(plan.targets, ["app01", "app02"]);
	assert.deepEqual(plan.action.supplementary_groups, []);
	assert.equal(plan.action.credential_ref, "secret://protocol-ops/plan-1");
	assert.throws(
		() => createAccountPlan({ ...params, username: "root;id" }, { inventory }),
		/portable normal-account/,
	);
	assert.throws(
		() => createAccountPlan({ ...params, force_password_change: false }, { inventory }),
		/requires a forced password change/,
	);
	assert.throws(
		() => createAccountPlan({ ...params, groups: ["sudo"] }, { inventory }),
		/unsupported field.*groups/,
	);
	assert.equal(
		createAccountPlan({ ...params, reference: "KITREQ-17110" }, { inventory }).external_reference,
		"KITREQ-17110",
	);
	assert.throws(() => createAccountPlan({ ...params, targets: ["missing"] }, { inventory }), /outside the inventory/);
});

test("operator confirmation policy is risk-based and machine-overridable", () => {
	const prodPlan = createAccountPlan({ ...params, targets: ["app01"] }, { inventory });
	const testPlan = createAccountPlan({ ...params, targets: ["test01"] }, { inventory });
	const unknownPlan = createAccountPlan({ ...params, targets: ["unknown01"] }, { inventory });
	const multiPlan = createAccountPlan(params, { inventory });
	assert.equal(accountConfirmationDecision(prodPlan, inventory, {}).required, true);
	assert.equal(accountConfirmationDecision(testPlan, inventory, {}).required, false);
	assert.equal(accountConfirmationDecision(unknownPlan, inventory, {}).required, true);
	assert.equal(accountConfirmationDecision(multiPlan, inventory, {}).required, true);
	assert.equal(accountConfirmationDecision(prodPlan, inventory, { PROTOCOL_OPS_ACCOUNT_CONFIRM: "operator" }).required, false);
	assert.equal(accountConfirmationDecision(testPlan, inventory, { PROTOCOL_OPS_ACCOUNT_CONFIRM: "always" }).required, true);
	assert.throws(
		() => accountConfirmationDecision(testPlan, inventory, { PROTOCOL_OPS_ACCOUNT_CONFIRM: "maybe" }),
		/must be always, risk, or operator/,
	);
	assert.equal(
		accountConfirmationDecision(prodPlan, inventory, {
			PROTOCOL_OPS_NON_PRODUCTION_ENVIRONMENTS: "PROD,TEST",
		}).required,
		false,
	);
});

test("account preflight is complete, ordered, and pinned", async () => {
	const plan = createAccountPlan(params, { inventory, makeId: () => "plan-1" });
	const calls = [];
	const runner = async (host, argv, options) => {
		calls.push({ host, argv, stdin: options.stdin });
		return { host, ok: true, exitCode: 0, failure: null, stdout: "ready", stderr: "" };
	};
	const results = await collectAccountPreflight(plan, { runner });
	assert.deepEqual(calls.map((call) => call.host), ["app01", "app02"]);
	assert.ok(calls.every((call) => call.argv.join(" ") === "/bin/sh -s"));
	assert.ok(calls.every((call) => call.stdin.includes("passwordless_root_unavailable")));
	assert.ok(calls.every((call) => call.stdin.includes("missing_login_shell")));
	const digest = assertAccountPreflight(plan, results);
	assert.match(digest, /^[a-f0-9]{64}$/);
	assert.throws(
		() => assertAccountPreflight(plan, [{ ...results[0], stdout: "account_present", ok: false }, results[1]]),
		/account preflight failed on app01: account_present/,
	);
});

test("temporary passwords are local, private, and never returned in a path", () => {
	const plan = createAccountPlan(params, { inventory, makeId: () => "plan-secret-1" });
	const password = generateTemporaryPassword({ random: () => Buffer.alloc(18, 7) });
	assert.match(password, /^Aa1![A-Za-z0-9_-]+$/);
	const directory = join(mkdtempSync(join(tmpdir(), "protocol-ops-account-")), "secrets");
	const path = persistTemporaryPassword(plan, password, { directory });
	assert.equal(statSync(directory).mode & 0o077, 0);
	assert.equal(statSync(path).mode & 0o077, 0);
	assert.ok(!path.includes(password));
	assert.match(path, /adhoc-bencsokb-plan-sec\.txt$/);
	assert.match(readFileSync(path, "utf8"), /operation_id=plan-secret-1/);
	assert.match(readFileSync(path, "utf8"), new RegExp(`temporary_password=${password}`));
	assert.throws(() => persistTemporaryPassword(plan, password, { directory }), /EEXIST/);
});

test("account apply uses fixed argv, keeps the password out of argv, and verifies every host", async () => {
	const plan = createAccountPlan(params, { inventory, makeId: () => "plan-1" });
	const password = "Aa1!temporary-secret";
	const calls = [];
	const runner = async (host, argv, options = {}) => {
		calls.push({ host, argv, stdin: options.stdin || "" });
		if (argv[0] === "/usr/bin/getent") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: "bencsokb:x:1001:1001::/home/bencsokb:/bin/bash", stderr: "" };
		}
		if (argv[0] === "/bin/sh") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: `verified:bencsokb:x:1001:1001::/home/bencsokb:/bin/bash`, stderr: "" };
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const result = await executeAccountPlan(plan, password, { runner });
	assert.equal(result.ok, true);
	assert.deepEqual(result.knownCreatedHosts, ["app01", "app02"]);
	assert.equal(result.verification.length, 2);
	assert.equal(calls.length, 10);
	assert.ok(calls.every((call) => !call.argv.join(" ").includes(password)));
	assert.equal(calls.filter((call) => call.stdin.includes(password)).length, 2);
	assert.ok(calls.filter((call) => call.argv[0] === "/bin/sh").every((call) => call.stdin.includes("home_not_directory")));
	assert.ok(calls.filter((call) => call.argv[0] === "/bin/sh").every((call) => call.stdin.includes("password_locked")));
	assert.ok(
		calls
			.filter((call) => call.argv.some((arg) => arg.endsWith("/useradd")))
			.every((call) => call.argv.includes("--create-home")),
	);
	const receipt = summarizeAccountOutcome(result);
	assert.equal(receipt.completed, true);
	assert.equal(receipt.failure, null);
	assert.deepEqual(receipt.knownCreatedHosts, ["app01", "app02"]);
	assert.equal(receipt.rollback.attempted, false);
	assert.equal(receipt.rollback.complete, null);
});

test("command-scoped sudo denial leaves an actionable incomplete-rollback receipt", async () => {
	const plan = createAccountPlan({ ...params, targets: ["app01"] }, { inventory, makeId: () => "plan-sudo" });
	const runner = async (host, argv, options = {}) => {
		if (argv[0] === "/usr/bin/getent") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: "bencsokb:x:1001:1001::/home/bencsokb:/bin/bash", stderr: "" };
		}
		if (argv.some((arg) => arg.endsWith("/chpasswd"))) {
			return { host, ok: false, exitCode: 1, failure: null, stdout: "", stderr: "sudo denied chpasswd" };
		}
		if (options.stdin?.includes("/usr/sbin/userdel")) {
			return { host, ok: false, exitCode: 1, failure: null, stdout: "", stderr: "sudo denied userdel" };
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const outcome = await executeAccountPlan(plan, "Aa1!secret", { runner });
	const receipt = summarizeAccountOutcome(outcome);
	assert.equal(outcome.rollbackComplete, false);
	assert.deepEqual(outcome.knownCreatedHosts, ["app01"]);
	assert.equal(receipt.completed, false);
	assert.deepEqual(receipt.failure, { host: "app01", stage: "chpasswd", exitCode: 1, failure: null });
	assert.deepEqual(receipt.knownCreatedHosts, ["app01"]);
	assert.deepEqual(receipt.rollback, {
		attempted: true,
		complete: false,
		steps: [{ host: "app01", stage: "rollback", ok: false, exitCode: 1, failure: null }],
	});
	assert.equal(JSON.stringify(receipt).includes("Aa1!secret"), false);
});

test("account apply rolls back only hosts it knows it created", async () => {
	const plan = createAccountPlan(params, { inventory, makeId: () => "plan-1" });
	const calls = [];
	const runner = async (host, argv, options = {}) => {
		calls.push({ host, argv, stdin: options.stdin || "" });
		if (argv[0] === "/usr/bin/getent") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: "bencsokb:x:1001:1001::/home/bencsokb:/bin/bash", stderr: "" };
		}
		if (host === "app02" && argv.some((arg) => arg.endsWith("/chpasswd"))) {
			return { host, ok: false, exitCode: 1, failure: null, stdout: "", stderr: "failed" };
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const result = await executeAccountPlan(plan, "Aa1!secret", { runner });
	assert.equal(result.ok, false);
	assert.equal(result.failure.host, "app02");
	assert.equal(result.failure.stage, "chpasswd");
	assert.equal(result.rollbackComplete, true);
	assert.deepEqual(
		calls.filter((call) => call.stdin.includes("/usr/sbin/userdel")).map((call) => call.host),
		["app02", "app01"],
	);
	assert.ok(
		calls
			.filter((call) => call.stdin.includes("/usr/sbin/userdel"))
			.every((call) => call.stdin.includes("rollback_identity_changed") && call.stdin.includes("expected_gid")),
	);
	const receipt = summarizeAccountOutcome(result);
	assert.equal(receipt.completed, false);
	assert.deepEqual(receipt.failure, {
		host: "app02",
		stage: "chpasswd",
		exitCode: 1,
		failure: null,
	});
	assert.deepEqual(receipt.knownCreatedHosts, ["app01", "app02"]);
	assert.equal(receipt.rollback.attempted, true);
	assert.equal(receipt.rollback.complete, true);
});

test("account SSH redacts secrets echoed by a remote process", async () => {
	const directory = mkdtempSync(join(tmpdir(), "protocol-ops-ssh-"));
	const fakeSsh = join(directory, "fake-ssh.sh");
	writeFileSync(fakeSsh, [
		"#!/bin/sh",
		"IFS= read -r value",
		"printf '%s\\n' \"$value\"",
		"printf '%s\\n' \"$value\" >&2",
		"",
	].join("\n"));
	chmodSync(fakeSsh, 0o700);
	const secret = "Aa1!must-not-escape";
	const result = await runAccountSsh("app01", ["/usr/bin/sudo", "-n", "/usr/sbin/chpasswd"], {
		stdin: `${secret}\n`,
		secrets: [secret],
		sshBin: fakeSsh,
		// The lab mounts /tmp noexec. Invoking the fixture through /bin/sh keeps
		// this test portable without weakening the container mount.
		spawnProcess: (command, args, options) => spawn("/bin/sh", [command, ...args], options),
	});
	assert.equal(result.ok, true);
	assert.equal(result.stdout, "[REDACTED]");
	assert.equal(result.stderr, "[REDACTED]");
	assert.ok(!JSON.stringify(result).includes(secret));
});

test("verification failure rolls back every account created by the plan", async () => {
	const plan = createAccountPlan(params, { inventory, makeId: () => "plan-verify" });
	const calls = [];
	const runner = async (host, argv, options = {}) => {
		calls.push({ host, argv, stdin: options.stdin || "" });
		if (argv[0] === "/usr/bin/getent") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: "bencsokb:x:1001:1001::/home/bencsokb:/bin/bash", stderr: "" };
		}
		if (argv[0] === "/bin/sh" && options.stdin?.includes("password_change_not_forced") && host === "app02") {
			return { host, ok: false, exitCode: 32, failure: null, stdout: "password_change_not_forced", stderr: "" };
		}
		if (argv[0] === "/bin/sh") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: "verified:bencsokb:x:1001:1001::/home/bencsokb:/bin/bash", stderr: "" };
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const result = await executeAccountPlan(plan, "Aa1!secret", { runner });
	assert.equal(result.ok, false);
	assert.equal(result.failure.host, "app02");
	assert.equal(result.failure.stage, "verify");
	assert.equal(result.rollbackComplete, true);
	assert.deepEqual(
		calls.filter((call) => call.stdin.includes("/usr/sbin/userdel")).map((call) => call.host),
		["app02", "app01"],
	);
});

test("uncertain useradd never triggers an unsafe delete on that host", async () => {
	const plan = createAccountPlan(params, { inventory, makeId: () => "plan-uncertain" });
	const calls = [];
	const runner = async (host, argv, options = {}) => {
		calls.push({ host, argv, stdin: options.stdin || "" });
		if (host === "app02" && argv.some((arg) => arg.endsWith("/useradd"))) {
			return { host, ok: false, exitCode: null, failure: "timeout", stdout: "", stderr: "" };
		}
		if (argv[0] === "/usr/bin/getent") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: "bencsokb:x:1001:1001::/home/bencsokb:/bin/bash", stderr: "" };
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const result = await executeAccountPlan(plan, "Aa1!secret", { runner });
	assert.equal(result.ok, false);
	assert.deepEqual(result.uncertainHosts, ["app02"]);
	assert.equal(result.rollbackComplete, false);
	assert.deepEqual(
		calls.filter((call) => call.stdin.includes("/usr/sbin/userdel")).map((call) => call.host),
		["app01"],
	);
});

test("unverified post-useradd identity is a hard stop and is never auto-deleted", async () => {
	const singleParams = { ...params, targets: ["app01"] };
	const plan = createAccountPlan(singleParams, { inventory, makeId: () => "plan-identity" });
	const calls = [];
	const runner = async (host, argv, options = {}) => {
		calls.push({ host, argv, stdin: options.stdin || "" });
		if (argv[0] === "/usr/bin/getent") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: "changed:x:1001:1001::/srv/changed:/bin/sh", stderr: "" };
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const result = await executeAccountPlan(plan, "Aa1!secret", { runner });
	assert.equal(result.ok, false);
	assert.equal(result.failure.stage, "identity");
	assert.equal(result.failure.failure, "identity_unverified");
	assert.deepEqual(result.uncertainHosts, ["app01"]);
	assert.equal(result.rollbackComplete, false);
	assert.equal(calls.some((call) => call.stdin.includes("/usr/sbin/userdel")), false);
	assert.equal(calls.some((call) => call.argv.some((arg) => arg.endsWith("/chpasswd"))), false);
});

test("an aborted apply still cleans up a known-created account", async () => {
	const singleParams = { ...params, targets: ["app01"] };
	const plan = createAccountPlan(singleParams, { inventory, makeId: () => "plan-abort" });
	const calls = [];
	const runner = async (host, argv, options = {}) => {
		calls.push({ host, argv, signal: options.signal, stdin: options.stdin || "" });
		if (argv[0] === "/usr/bin/getent") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: "bencsokb:x:1001:1001::/home/bencsokb:/bin/bash", stderr: "" };
		}
		if (argv.some((arg) => arg.endsWith("/chpasswd"))) {
			const error = new Error("interrupted");
			error.name = "AbortError";
			throw error;
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const controller = new AbortController();
	const result = await executeAccountPlan(plan, "Aa1!secret", { runner, signal: controller.signal });
	assert.equal(result.ok, false);
	assert.equal(result.failure.failure, "aborted");
	assert.equal(result.rollbackComplete, true);
	const rollback = calls.find((call) => call.stdin.includes("/usr/sbin/userdel"));
	assert.ok(rollback);
	assert.equal(rollback.signal, undefined);
});
