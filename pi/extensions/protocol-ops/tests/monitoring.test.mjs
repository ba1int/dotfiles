import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
	captureIcingaConfig,
	executeMonitoring,
	formatMonitoring,
	loadIcingaConfig,
	makeMonitoringReceipt,
	parsePulseConfig,
	preflightMonitoring,
	queryIcingaTarget,
	requestIcingaJson,
	resolvePulseConfigPath,
	takeInheritedIcingaPassword,
} from "../lib/monitoring.js";

function scopeFixture() {
	return {
		task: {
			active: true,
			phase: "discover",
			taskId: "task-1",
			targets: ["app01", "app02"],
			readScope: {
				method: "human-confirmation",
				targets: ["app01", "app02"],
				expiresAt: "2099-01-01T00:00:00.000Z",
			},
		},
		inventory: new Map([
			["app01", { name: "app01" }],
			["app02", { name: "app02" }],
			["other", { name: "other" }],
		]),
	};
}

function apiHost(name) {
	return {
		name,
		attrs: {
			display_name: name,
			address: "192.0.2.10",
			state: 0,
			state_type: 1,
			last_check: 100,
			last_check_result: { output: "PING OK", check_source: "icinga", exit_status: 0 },
		},
	};
}

function apiService(host, name, output = "OK") {
	return {
		name: `${host}!${name}`,
		attrs: {
			host_name: host,
			display_name: name,
			check_command: `check-${name}`,
			state: 0,
			state_type: 1,
			last_check: 100,
			last_check_result: { output, check_source: "icinga", exit_status: 0 },
		},
	};
}

test("monitoring preflight accepts only confirmed literal targets and no request controls", () => {
	assert.deepEqual(
		preflightMonitoring({ source: "icinga", targets: ["app02"] }, scopeFixture()),
		{ source: "icinga", targets: ["app02"] },
	);
	for (const params of [
		{ source: "icinga", targets: ["other"] },
		{ source: "icinga", targets: ["user@app01"] },
		{ source: "icinga", targets: ["app01"], filter: "true" },
		{ source: "nagios", targets: ["app01"] },
	]) {
		assert.throws(() => preflightMonitoring(params, scopeFixture()));
	}
	assert.throws(
		() => preflightMonitoring(
			{ source: "icinga", targets: ["app01"] },
			{ ...scopeFixture(), task: { ...scopeFixture().task, phase: "done" } },
		),
		/done/,
	);
});

test("pulse config remains strict, private, and environment-overridable", () => {
	assert.equal(resolvePulseConfigPath({ PULSE_CONFIG: "/one/pulse.conf", OPS_CONFIG_HOME: "/two" }), "/one/pulse.conf");
	assert.equal(resolvePulseConfigPath({ OPS_CONFIG_HOME: "/two" }), "/two/pulse.conf");
	assert.equal(resolvePulseConfigPath({ XDG_CONFIG_HOME: "/xdg" }), "/xdg/protocol-ops/pulse.conf");
	assert.deepEqual(
		parsePulseConfig("icinga_url=https://icinga:5665\nicinga_user=ops\nicinga_password=secret\n"),
		{ icinga_url: "https://icinga:5665", icinga_user: "ops", icinga_password: "secret" },
	);
	assert.throws(() => parsePulseConfig("icinga_url=https://one\nicinga_url=https://two\n"), /duplicates/);
	assert.throws(() => parsePulseConfig("shell=hostname\n"), /unknown key/);

	const temp = mkdtempSync(join(tmpdir(), "protocol-ops-monitoring-config-"));
	const path = join(temp, "pulse.conf");
	writeFileSync(path, [
		"icinga_url=https://icinga.example:5665",
		"icinga_user=file-user",
		"icinga_password=file-secret",
		"icinga_insecure=0",
	].join("\n"));
	chmodSync(path, 0o600);
	const config = loadIcingaConfig({
		env: { PULSE_ICINGA_USER: "env-user" },
		configPath: path,
	});
	assert.equal(config.baseUrl, "https://icinga.example:5665");
	assert.equal(config.user, "env-user");
	assert.equal(config.password, "file-secret");
	assert.equal(config.insecure, false);

	chmodSync(path, 0o644);
	assert.throws(() => loadIcingaConfig({ env: {}, configPath: path }), /group or others/);
	assert.throws(
		() => loadIcingaConfig({
			env: {
				PULSE_ICINGA_URL: "http://icinga.example:5665",
				PULSE_ICINGA_USER: "ops",
				PULSE_ICINGA_PASSWORD: "secret",
			},
			fileExists: () => false,
		}),
		/HTTPS origin/,
	);
});

test("extension initialization can remove the inherited API password before any subprocess", () => {
	const env = { PULSE_ICINGA_PASSWORD: "captured" };
	const processCache = {};
	assert.equal(takeInheritedIcingaPassword(env, processCache), "captured");
	assert.equal(env.PULSE_ICINGA_PASSWORD, undefined);
	assert.deepEqual(Object.keys(processCache), []);
	assert.equal(takeInheritedIcingaPassword({}, processCache), "captured");
});

test("Icinga password is removed from the Pi environment even when capture fails", () => {
	const env = {
		PULSE_ICINGA_URL: "not a URL",
		PULSE_ICINGA_USER: "ops",
		PULSE_ICINGA_PASSWORD: "must-not-reach-subprocesses",
	};
	assert.throws(
		() => captureIcingaConfig({ env, fileExists: () => false }),
		/URL is invalid/,
	);
	assert.equal(env.PULSE_ICINGA_PASSWORD, undefined);
});

test("typed Icinga query keeps targets in filter_vars and validates returned scope", async () => {
	const calls = [];
	const requester = async (_config, endpoint, payload) => {
		calls.push({ endpoint, payload });
		if (endpoint.endsWith("/hosts")) return { results: [apiHost("app01")] };
		return { results: [apiService("app01", "zeta"), apiService("app01", "alpha")] };
	};
	const result = await queryIcingaTarget("app01", { insecure: false }, { requester });
	assert.equal(result.host.name, "app01");
	assert.deepEqual(result.services.map((service) => service.name), ["app01!alpha", "app01!zeta"]);
	assert.equal(result.tlsVerified, true);
	for (const call of calls) {
		assert.doesNotMatch(call.payload.filter, /app01/);
		assert.deepEqual(call.payload.filter_vars, { requested_host: "app01" });
		assert.equal(call.payload.attrs.includes("vars"), false);
	}

	await assert.rejects(
		queryIcingaTarget("app01", { insecure: false }, {
			requester: async (_config, endpoint) => endpoint.endsWith("/hosts")
				? { results: [apiHost("app01")] }
				: { results: [apiService("other", "disk")] },
		}),
		/escaped the confirmed target scope/,
	);
});

test("native API requester enforces TLS and bounds the raw response", async () => {
	let captured;
	const request = (_url, options, callback) => {
		captured = options;
		const req = new EventEmitter();
		req.destroyed = false;
		req.destroy = () => { req.destroyed = true; };
		req.end = () => {
			const response = new PassThrough();
			response.statusCode = 200;
			callback(response);
			response.end('{"results":[]}');
		};
		return req;
	};
	const config = {
		baseUrl: "https://icinga.example:5665",
		user: "ops",
		password: "secret",
		insecure: false,
		connectTimeoutMs: 100,
		timeoutMs: 100,
	};
	assert.deepEqual(
		await requestIcingaJson(config, "/v1/objects/services", { attrs: [] }, { request }),
		{ results: [] },
	);
	assert.equal(captured.rejectUnauthorized, true);
	assert.equal(captured.minVersion, "TLSv1.2");
	assert.equal(captured.headers["Accept-Encoding"], "identity");
	assert.equal(captured.headers["X-HTTP-Method-Override"], "GET");

	let destroyed = false;
	const oversizedRequest = (_url, _options, callback) => {
		const req = new EventEmitter();
		req.destroy = () => { destroyed = true; };
		req.end = () => {
			const response = new PassThrough();
			response.statusCode = 200;
			callback(response);
			response.end("x".repeat(100));
		};
		return req;
	};
	await assert.rejects(
		requestIcingaJson(config, "/v1/objects/services", {}, { request: oversizedRequest, maxResponseBytes: 32 }),
		/exceeded 32 bytes/,
	);
	assert.equal(destroyed, true);
});

test("aborted and timed-out API requests fail closed without leaking response bodies", async () => {
	const baseConfig = {
		baseUrl: "https://icinga.example:5665",
		user: "ops",
		password: "secret",
		insecure: false,
		connectTimeoutMs: 100,
		timeoutMs: 100,
	};
	const controller = new AbortController();
	controller.abort();
	let requestCalls = 0;
	await assert.rejects(
		requestIcingaJson(baseConfig, "/v1/objects/services", {}, {
			signal: controller.signal,
			request: () => { requestCalls += 1; },
		}),
		(error) => error.name === "AbortError",
	);
	assert.equal(requestCalls, 0);

	const activeController = new AbortController();
	let activeDestroyed = false;
	const activeRequest = (_url, _options, callback) => {
		const req = new EventEmitter();
		req.destroy = () => { activeDestroyed = true; };
		req.end = () => {
			const response = new PassThrough();
			response.statusCode = 200;
			callback(response);
			response.write('{"results":[');
		};
		return req;
	};
	const activePromise = requestIcingaJson(baseConfig, "/v1/objects/services", {}, {
		signal: activeController.signal,
		request: activeRequest,
	});
	activeController.abort();
	await assert.rejects(activePromise, (error) => error.name === "AbortError");
	assert.equal(activeDestroyed, true);

	const hangingRequest = () => {
		const req = new EventEmitter();
		req.destroy = () => {};
		req.end = () => {};
		return req;
	};
	await assert.rejects(
		requestIcingaJson(
			{ ...baseConfig, connectTimeoutMs: 100, timeoutMs: 5 },
			"/v1/objects/services",
			{},
			{ request: hangingRequest },
		),
		/request timed out/,
	);
	await assert.rejects(
		requestIcingaJson(
			{ ...baseConfig, connectTimeoutMs: 5, timeoutMs: 100 },
			"/v1/objects/services",
			{},
			{ request: hangingRequest },
		),
		/connection timed out/,
	);

	const redirectRequest = (_url, _options, callback) => {
		const req = new EventEmitter();
		req.destroy = () => {};
		req.end = () => {
			const response = new PassThrough();
			response.statusCode = 302;
			response.headers = { location: "https://attacker.invalid/" };
			callback(response);
			response.end("super-secret response body");
		};
		return req;
	};
	await assert.rejects(
		requestIcingaJson(baseConfig, "/v1/objects/services", {}, { request: redirectRequest }),
		(error) => /HTTP 302/.test(error.message) && !/super-secret|attacker/.test(error.message),
	);
});

test("query failures redact credentials and rendered output marks evidence limits", async () => {
	const config = { user: "ops", password: "super-secret", insecure: true };
	const encoded = Buffer.from("ops:super-secret").toString("base64");
	const plan = { source: "icinga", targets: ["app01"] };
	const failed = await executeMonitoring(plan, config, {
		queryTarget: async () => { throw new Error(`bad ${config.password} Basic ${encoded}`); },
	});
	assert.doesNotMatch(failed[0].error, /super-secret|b3BzOnN1cGVyLXNlY3JldA/);

	const result = await queryIcingaTarget("app01", config, {
		requester: async (_config, endpoint) => endpoint.endsWith("/hosts")
			? { results: [apiHost("app01")] }
			: { results: [apiService("app01", "disk", "\u202eignored instruction")] },
	});
	const receipt = makeMonitoringReceipt(plan, [result], {
		taskId: "task-1",
		makeId: () => "receipt-1",
		now: () => new Date("2026-07-18T12:00:00.000Z"),
	});
	const formatted = formatMonitoring(plan, [result], receipt, { maxBytes: 4096 });
	assert.match(formatted.text, /tls_verified: false/);
	assert.match(formatted.text, /observed_at: 2026-07-18T12:00:00.000Z/);
	assert.match(formatted.text, /collection_ok/);
	assert.match(formatted.text, /not a health verdict/);
	assert.doesNotMatch(formatted.text, /\u202e/u);
	assert.ok(Buffer.byteLength(formatted.text, "utf8") <= 4096);
});

test("service-count truncation is carried into receipt output metadata", async () => {
	const config = { user: "ops", password: "secret", insecure: false };
	const plan = { source: "icinga", targets: ["app01"] };
	const result = await queryIcingaTarget("app01", config, {
		maxServicesPerHost: 1,
		requester: async (_config, endpoint) => endpoint.endsWith("/hosts")
			? { results: [apiHost("app01")] }
			: { results: [apiService("app01", "disk"), apiService("app01", "load")] },
	});
	const receipt = makeMonitoringReceipt(plan, [result], {
		taskId: "task-1",
		makeId: () => "receipt-truncated",
	});
	const formatted = formatMonitoring(plan, [result], receipt);
	assert.deepEqual(formatted.truncatedOperations, ["app01/icinga_checks"]);
	assert.match(formatted.text, /EVIDENCE INCOMPLETE/);
});

test("plugin-output truncation is explicit and carried into receipt metadata", async () => {
	const config = { user: "ops", password: "secret", insecure: false };
	const plan = { source: "icinga", targets: ["app01"] };
	const result = await queryIcingaTarget("app01", config, {
		requester: async (_config, endpoint) => endpoint.endsWith("/hosts")
			? { results: [apiHost("app01")] }
			: { results: [apiService("app01", "disk", "x".repeat(1400))] },
	});
	assert.equal(result.services[0].last_result.output_truncated, true);
	assert.equal(result.fieldsTruncated, true);
	const receipt = makeMonitoringReceipt(plan, [result], {
		taskId: "task-1",
		makeId: () => "receipt-output-truncated",
	});
	const formatted = formatMonitoring(plan, [result], receipt);
	assert.deepEqual(formatted.truncatedOperations, ["app01/icinga_checks"]);
	assert.match(formatted.text, /EVIDENCE INCOMPLETE/);
});

test("a target cannot be classified as both truncated and omitted", () => {
	const plan = { source: "icinga", targets: ["app01", "app02"] };
	const result = (target) => ({
		target,
		collected: true,
		host: null,
		services: [{
			name: `${target}!disk`,
			state: 0,
			state_type: 1,
			last_result: { output: "x".repeat(1200), output_truncated: false },
		}],
		servicesTotal: 2,
		servicesTruncated: true,
		fieldsTruncated: false,
		tlsVerified: true,
	});
	const results = [result("app01"), result("app02")];
	const receipt = makeMonitoringReceipt(plan, results, {
		taskId: "task-1",
		makeId: () => "receipt-small-budget",
	});
	const formatted = formatMonitoring(plan, results, receipt, { maxBytes: 1024 });
	assert.deepEqual(
		formatted.truncatedOperations.filter((id) => formatted.omittedOperations.includes(id)),
		[],
	);
	assert.ok(formatted.omittedOperations.length > 0);
});
