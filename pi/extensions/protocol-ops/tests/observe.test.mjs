import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import {
	executeObservation,
	formatObservation,
	observe,
	preflightObservation,
	runBounded,
	runSshCheck,
} from "../lib/observe.js";

function fixture() {
	const checks = new Map([
		["host", { id: "host", label: "Host", command: "hostname", timeoutSeconds: 5, acceptedExitCodes: [0] }],
		["proc", { id: "proc", label: "Process", command: "pgrep foo", timeoutSeconds: 5, acceptedExitCodes: [0, 1] }],
	]);
	return {
		task: {
			active: true,
			phase: "discover",
			targets: ["app01", "app02"],
			readScope: {
				method: "human-confirmation",
				targets: ["app01", "app02"],
				expiresAt: "2099-01-01T00:00:00.000Z",
			},
		},
		taskRunbook: { profiles: ["base"] },
		inventory: new Map([
			["app01", { name: "app01" }],
			["app02", { name: "app02" }],
			["other", { name: "other" }],
		]),
		catalog: { checks, profiles: new Map([["base", ["host", "proc"]]]) },
	};
}

test("observation preflight expands defaults deterministically", () => {
	const plan = preflightObservation({ targets: ["app02", "app01"] }, fixture());
	assert.deepEqual(
		plan.operations.map(({ host, check }) => `${host}/${check.id}`),
		["app02/host", "app02/proc", "app01/host", "app01/proc"],
	);
});

test("any invalid envelope produces zero executor calls", async () => {
	for (const params of [
		{ targets: ["app01"], checks: ["missing"] },
		{ targets: ["other"], checks: ["host"] },
		{ targets: ["user@app01"], checks: ["host"] },
		{ targets: ["app01"], checks: ["host"], command: "rm -rf /" },
	]) {
		let calls = 0;
		await assert.rejects(
			observe(params, fixture(), {
				runner: async () => {
					calls += 1;
					return {};
				},
			}),
		);
		assert.equal(calls, 0, `executor called for ${JSON.stringify(params)}`);
	}
});

test("valid reads are bounded and results retain request order", async () => {
	const plan = preflightObservation({ targets: ["app01", "app02"] }, fixture());
	let active = 0;
	let highWater = 0;
	const completionOrder = [];
	const results = await runBounded(
		plan.operations,
		2,
		async (operation, index) => {
			active += 1;
			highWater = Math.max(highWater, active);
			await new Promise((resolve) => setTimeout(resolve, (plan.operations.length - index) * 2));
			completionOrder.push(index);
			active -= 1;
			return `${operation.host}/${operation.check.id}`;
		},
	);
	assert.equal(highWater, 2);
	assert.notDeepEqual(completionOrder, [0, 1, 2, 3]);
	assert.deepEqual(results, ["app01/host", "app01/proc", "app02/host", "app02/proc"]);
});

test("execution is parallel across hosts but sequential within each host", async () => {
	const plan = preflightObservation({ targets: ["app01", "app02"] }, fixture());
	const activeByHost = new Map();
	let globalActive = 0;
	let globalHighWater = 0;
	const results = await executeObservation(plan, {
		concurrency: 2,
		runner: async ({ host, check }) => {
			const hostActive = (activeByHost.get(host) ?? 0) + 1;
			activeByHost.set(host, hostActive);
			assert.equal(hostActive, 1, `concurrent SSH reads opened on ${host}`);
			globalActive += 1;
			globalHighWater = Math.max(globalHighWater, globalActive);
			await new Promise((resolve) => setTimeout(resolve, 3));
			activeByHost.set(host, hostActive - 1);
			globalActive -= 1;
			return { host, checkId: check.id, collected: true };
		},
	});
	assert.equal(globalHighWater, 2);
	assert.deepEqual(results.map((result) => `${result.host}/${result.checkId}`), [
		"app01/host",
		"app01/proc",
		"app02/host",
		"app02/proc",
	]);
});

test("profiles and explicit checks deduplicate without changing catalog order", () => {
	const plan = preflightObservation(
		{ targets: ["app01"], profiles: ["base"], checks: ["host"] },
		fixture(),
	);
	assert.deepEqual(plan.checks.map((check) => check.id), ["host", "proc"]);
});

test("terminal and expired task scopes fail before execution", async () => {
	for (const context of [
		{ ...fixture(), task: { ...fixture().task, phase: "done" } },
		{
			...fixture(),
			task: {
				...fixture().task,
				readScope: { ...fixture().task.readScope, expiresAt: "2020-01-01T00:00:00.000Z" },
			},
		},
	]) {
		let calls = 0;
		await assert.rejects(
			observe({ targets: ["app01"], checks: ["host"] }, context, {
				runner: async () => {
					calls += 1;
				},
			}),
			/done|expired/,
		);
		assert.equal(calls, 0);
	}
});

test("an explicit check does not silently include runbook defaults", () => {
	const plan = preflightObservation({ targets: ["app01"], checks: ["host"] }, fixture());
	assert.deepEqual(plan.checks.map((check) => check.id), ["host"]);
});

test("SSH runner passes one literal host and the audited command only over stdin", async () => {
	const temp = mkdtempSync(join(tmpdir(), "protocol-ops-ssh-"));
	const fakeSsh = join(temp, "ssh");
	const argsPath = join(temp, "args");
	writeFileSync(
		fakeSsh,
		"#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$PROTOCOL_OPS_TEST_ARGS\"\nexec sh -s\n",
	);
	chmodSync(fakeSsh, 0o700);
	const previous = process.env.PROTOCOL_OPS_TEST_ARGS;
	process.env.PROTOCOL_OPS_TEST_ARGS = argsPath;
	try {
		const result = await runSshCheck(
			{
				host: "app01",
				check: {
					id: "fixture",
					label: "Fixture",
					command: "printf 'fixture output\\n'",
					timeoutSeconds: 2,
					acceptedExitCodes: [0],
				},
			},
			{ sshBin: fakeSsh },
		);
		assert.equal(result.collected, true);
		assert.equal(result.stdout, "fixture output");
		assert.equal(
			readFileSync(argsPath, "utf8"),
			[
				"-T",
				"-o", "BatchMode=yes",
				"-o", "ForwardAgent=no",
				"-o", "ForwardX11=no",
				"-o", "ClearAllForwardings=yes",
				"-o", "PermitLocalCommand=no",
				"-o", "UpdateHostKeys=no",
				"-o", "StrictHostKeyChecking=yes",
				"--", "app01", "sh", "-s", "",
			].join("\n"),
		);
	} finally {
		if (previous === undefined) delete process.env.PROTOCOL_OPS_TEST_ARGS;
		else process.env.PROTOCOL_OPS_TEST_ARGS = previous;
	}
});

test("SSH output neutralizes Unicode direction controls", async () => {
	const temp = mkdtempSync(join(tmpdir(), "protocol-ops-bidi-"));
	const fakeSsh = join(temp, "ssh");
	writeFileSync(fakeSsh, "#!/bin/sh\nexec sh -s\n");
	chmodSync(fakeSsh, 0o700);
	const result = await runSshCheck(
		{
			host: "app01",
			check: {
				id: "fixture",
				label: "Fixture",
				command: "printf '\\342\\200\\256spoof\\n'",
				timeoutSeconds: 2,
				acceptedExitCodes: [0],
			},
		},
		{ sshBin: fakeSsh },
	);
	assert.doesNotMatch(result.stdout, /[\u202a-\u202e]/u);
	assert.match(result.stdout, /�spoof/);
});

test("SSH runner bounds output and reports spawn failures as data", async () => {
	const missing = await runSshCheck(
		{
			host: "app01",
			check: { id: "fixture", label: "Fixture", command: "hostname", timeoutSeconds: 1, acceptedExitCodes: [0] },
		},
		{ sshBin: "/definitely/missing/protocol-ops-ssh" },
	);
	assert.equal(missing.collected, false);
	assert.equal(missing.failure, "spawn");

	const temp = mkdtempSync(join(tmpdir(), "protocol-ops-output-"));
	const fakeSsh = join(temp, "ssh");
	writeFileSync(fakeSsh, "#!/bin/sh\nexec sh -s\n");
	chmodSync(fakeSsh, 0o700);
	const bounded = await runSshCheck(
		{
			host: "app01",
			check: {
				id: "fixture",
				label: "Fixture",
				command: "while :; do printf '0123456789'; done",
				timeoutSeconds: 2,
				acceptedExitCodes: [0],
			},
		},
		{ sshBin: fakeSsh, maxOutputBytes: 128 },
	);
	assert.equal(bounded.collected, false);
	assert.equal(bounded.failure, "output_limit");
});

test("SSH runner escalates TERM to KILL and has a hard settlement deadline", async () => {
	const signals = [];
	const fakeChild = new EventEmitter();
	fakeChild.stdout = new PassThrough();
	fakeChild.stderr = new PassThrough();
	fakeChild.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
	fakeChild.kill = (signal) => {
		signals.push(signal);
		return true;
	};
	const started = Date.now();
	const result = await runSshCheck(
		{
			host: "app01",
			check: {
				id: "fixture",
				label: "Fixture",
				command: "hostname",
				timeoutSeconds: 0.01,
				acceptedExitCodes: [0],
			},
		},
		{
			spawnProcess: () => fakeChild,
			killGraceMs: 10,
			settleGraceMs: 20,
		},
	);
	assert.equal(result.collected, false);
	assert.equal(result.failure, "timeout");
	assert.deepEqual(signals, ["SIGTERM", "SIGKILL", "SIGKILL"]);
	assert.ok(Date.now() - started < 500, "runner waited for a close event that never arrived");

	const temp = mkdtempSync(join(tmpdir(), "protocol-ops-term-trap-"));
	const fakeSsh = join(temp, "ssh");
	writeFileSync(fakeSsh, "#!/bin/sh\ntrap '' TERM\nwhile :; do :; done\n");
	chmodSync(fakeSsh, 0o700);
	const trapped = await runSshCheck(
		{
			host: "app01",
			check: {
				id: "fixture",
				label: "Fixture",
				command: "hostname",
				timeoutSeconds: 0.2,
				acceptedExitCodes: [0],
			},
		},
		{ sshBin: fakeSsh, killGraceMs: 20, settleGraceMs: 200 },
	);
	assert.equal(trapped.failure, "timeout");
	assert.equal(trapped.signal, "SIGKILL");
});

test("formatted batch output has one deterministic global byte budget", () => {
	const plan = preflightObservation({ targets: ["app01", "app02"] }, fixture());
	const results = plan.operations.map(({ host, check }) => ({
		host,
		checkId: check.id,
		label: check.label,
		collected: true,
		exitCode: 0,
		failure: null,
		stdout: "x".repeat(1500),
		stderr: "",
		durationMs: 1,
	}));
	const receipt = { id: "receipt-1", collected: 4, collectionFailed: 0 };
	const formatted = formatObservation(plan, results, receipt, { maxBytes: 2048 });
	assert.ok(Buffer.byteLength(formatted.text, "utf8") <= 2048);
	assert.ok(formatted.truncatedOperations.length + formatted.omittedOperations.length > 0);
	assert.match(formatted.text, /OUTPUT BUDGET|…/);
});
