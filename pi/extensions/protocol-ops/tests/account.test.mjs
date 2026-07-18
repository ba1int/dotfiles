import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	accountPlanDigest,
	assertAccountPreflight,
	collectAccountPreflight,
	createAccountPlan,
	executeAccountPlan,
	generateTemporaryPassword,
	persistTemporaryPassword,
	runAccountSsh,
} from "../lib/account.js";
import { reviewAccountPlan } from "../lib/review.js";

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();
const inventory = new Map([
	["app01", { name: "app01", environment: "PROD", role: "middleware", site: "dc1" }],
	["app02", { name: "app02", environment: "PROD", role: "middleware", site: "dc2" }],
]);
const task = {
	active: true,
	taskId: "task-1",
	taskType: "account-provision",
	ticket: "KITREQ-17110",
	targets: ["app01", "app02"],
	phase: "plan",
	readScope: {
		method: "human-confirmation",
		approvedAt: past,
		expiresAt: future,
		targets: ["app01", "app02"],
	},
};
const params = {
	targets: ["app01", "app02"],
	username: "bencsokb",
	shell: "/bin/bash",
	create_home: true,
	force_password_change: true,
};

test("account plans are exact, normal-user-only, ticketed, and inventory bounded", () => {
	const plan = createAccountPlan(params, {
		task,
		inventory,
		now: () => new Date("2026-07-18T12:00:00Z"),
		makeId: () => "plan-1",
	});
	assert.equal(plan.plan_id, "plan-1");
	assert.deepEqual(plan.approved_targets, ["app01", "app02"]);
	assert.deepEqual(plan.action.supplementary_groups, []);
	assert.equal(plan.action.credential_ref, "secret://protocol-ops/plan-1");
	assert.throws(
		() => createAccountPlan({ ...params, username: "root;id" }, { task, inventory }),
		/portable normal-account/,
	);
	assert.throws(
		() => createAccountPlan({ ...params, force_password_change: false }, { task, inventory }),
		/requires a forced password change/,
	);
	assert.throws(
		() => createAccountPlan({ ...params, groups: ["sudo"] }, { task, inventory }),
		/unsupported field.*groups/,
	);
	assert.throws(
		() => createAccountPlan(params, { task: { ...task, taskType: "middleware" }, inventory }),
		/requires an active account-provision task/,
	);
	assert.throws(
		() => createAccountPlan(params, { task: { ...task, ticket: undefined }, inventory }),
		/requires a ticket/,
	);
});

test("account preflight is complete, ordered, and pinned", async () => {
	const plan = createAccountPlan(params, { task, inventory, makeId: () => "plan-1" });
	const calls = [];
	const runner = async (host, argv, options) => {
		calls.push({ host, argv, stdin: options.stdin });
		return { host, ok: true, exitCode: 0, failure: null, stdout: "ready", stderr: "" };
	};
	const results = await collectAccountPreflight(plan, { runner });
	assert.deepEqual(calls.map((call) => call.host), ["app01", "app02"]);
	assert.ok(calls.every((call) => call.argv.join(" ") === "sh -s"));
	assert.ok(calls.every((call) => call.stdin.includes("passwordless_root_unavailable")));
	const digest = assertAccountPreflight(plan, results);
	assert.match(digest, /^[a-f0-9]{64}$/);
	assert.equal(accountPlanDigest({ ...plan, preflight_sha256: digest }).length, 64);
	assert.throws(
		() => assertAccountPreflight(plan, [{ ...results[0], stdout: "account_present", ok: false }, results[1]]),
		/account preflight failed on app01: account_present/,
	);
});

test("temporary passwords are local, private, and never returned in a path", () => {
	const plan = createAccountPlan(params, { task, inventory, makeId: () => "plan-secret-1" });
	const password = generateTemporaryPassword({ random: () => Buffer.alloc(18, 7) });
	assert.match(password, /^Aa1![A-Za-z0-9_-]+$/);
	const directory = join(mkdtempSync(join(tmpdir(), "protocol-ops-account-")), "secrets");
	const path = persistTemporaryPassword(plan, password, { directory });
	assert.equal(statSync(directory).mode & 0o077, 0);
	assert.equal(statSync(path).mode & 0o077, 0);
	assert.ok(!path.includes(password));
	assert.match(readFileSync(path, "utf8"), new RegExp(`temporary_password=${password}`));
	assert.throws(() => persistTemporaryPassword(plan, password, { directory }), /EEXIST/);
});

test("account apply uses fixed argv, keeps the password out of argv, and verifies every host", async () => {
	const plan = createAccountPlan(params, { task, inventory, makeId: () => "plan-1" });
	const password = "Aa1!temporary-secret";
	const calls = [];
	const runner = async (host, argv, options = {}) => {
		calls.push({ host, argv, stdin: options.stdin || "" });
		if (argv[0] === "sh") {
			return { host, ok: true, exitCode: 0, failure: null, stdout: `verified:bencsokb:x:1001:1001::/home/bencsokb:/bin/bash`, stderr: "" };
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const result = await executeAccountPlan(plan, password, { runner });
	assert.equal(result.ok, true);
	assert.equal(result.verification.length, 2);
	assert.equal(calls.length, 8);
	assert.ok(calls.every((call) => !call.argv.join(" ").includes(password)));
	assert.equal(calls.filter((call) => call.stdin.includes(password)).length, 2);
	assert.ok(
		calls
			.filter((call) => call.argv.some((arg) => arg.endsWith("/useradd")))
			.every((call) => call.argv.includes("--create-home")),
	);
});

test("account apply rolls back only hosts it knows it created", async () => {
	const plan = createAccountPlan(params, { task, inventory, makeId: () => "plan-1" });
	const calls = [];
	const runner = async (host, argv) => {
		calls.push({ host, argv });
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
		calls.filter((call) => call.argv.some((arg) => arg.endsWith("/userdel"))).map((call) => call.host),
		["app02", "app01"],
	);
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
	const plan = createAccountPlan(params, { task, inventory, makeId: () => "plan-verify" });
	const calls = [];
	const runner = async (host, argv) => {
		calls.push({ host, argv });
		if (argv[0] === "sh" && host === "app02") {
			return { host, ok: false, exitCode: 32, failure: null, stdout: "password_change_not_forced", stderr: "" };
		}
		if (argv[0] === "sh") {
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
		calls.filter((call) => call.argv.some((arg) => arg.endsWith("/userdel"))).map((call) => call.host),
		["app02", "app01"],
	);
});

test("uncertain useradd never triggers an unsafe delete on that host", async () => {
	const plan = createAccountPlan(params, { task, inventory, makeId: () => "plan-uncertain" });
	const calls = [];
	const runner = async (host, argv) => {
		calls.push({ host, argv });
		if (host === "app02" && argv.some((arg) => arg.endsWith("/useradd"))) {
			return { host, ok: false, exitCode: null, failure: "timeout", stdout: "", stderr: "" };
		}
		return { host, ok: true, exitCode: 0, failure: null, stdout: "", stderr: "" };
	};
	const result = await executeAccountPlan(plan, "Aa1!secret", { runner });
	assert.equal(result.ok, false);
	assert.deepEqual(result.uncertainHosts, ["app02"]);
	assert.equal(result.rollbackComplete, false);
	assert.deepEqual(
		calls.filter((call) => call.argv.some((arg) => arg.endsWith("/userdel"))).map((call) => call.host),
		["app01"],
	);
});

test("an aborted apply still cleans up a known-created account", async () => {
	const singleTask = {
		...task,
		targets: ["app01"],
		readScope: { ...task.readScope, targets: ["app01"] },
	};
	const singleParams = { ...params, targets: ["app01"] };
	const plan = createAccountPlan(singleParams, { task: singleTask, inventory, makeId: () => "plan-abort" });
	const calls = [];
	const runner = async (host, argv, options = {}) => {
		calls.push({ host, argv, signal: options.signal });
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
	const rollback = calls.find((call) => call.argv.some((arg) => arg.endsWith("/userdel")));
	assert.ok(rollback);
	assert.equal(rollback.signal, undefined);
});

test("Luna review is sealed, digest-bound, and advisory", async () => {
	const plan = createAccountPlan(params, { task, inventory, makeId: () => "plan-1" });
	const digest = "a".repeat(64);
	const model = { provider: "openai-codex", id: "gpt-5.6-luna" };
	const ctx = {
		modelRegistry: {
			find: () => model,
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "test-key", headers: {}, env: {} }),
		},
	};
	let invocation;
	const completeFn = async (_model, prompt, options) => {
		invocation = { prompt, options };
		return {
			stopReason: "stop",
			content: [{
				type: "text",
				text: JSON.stringify({
					schema_version: "protocol-ops-review/1",
					reviewed_plan_sha256: digest,
					verdict: "approve",
					findings: [],
				}),
			}],
			usage: { input: 10, output: 5, totalTokens: 15 },
		};
	};
	const review = await reviewAccountPlan(plan, digest, ctx, { completeFn });
	assert.equal(review.status, "complete");
	assert.equal(review.verdict, "approve");
	assert.equal(invocation.options.reasoningEffort, "xhigh");
	assert.equal(invocation.prompt.messages.length, 1);
	assert.ok(!invocation.prompt.systemPrompt.includes("test-key"));

	const invalid = await reviewAccountPlan(plan, digest, ctx, {
		completeFn: async () => ({
			stopReason: "stop",
			content: [{ type: "text", text: JSON.stringify({
				schema_version: "protocol-ops-review/1",
				reviewed_plan_sha256: "b".repeat(64),
				verdict: "approve",
				findings: [],
			}) }],
		}),
	});
	assert.equal(invalid.status, "unavailable");
	assert.match(invalid.reason, /digest does not match/);
});
