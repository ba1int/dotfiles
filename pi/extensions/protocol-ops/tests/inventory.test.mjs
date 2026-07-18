import assert from "node:assert/strict";
import test from "node:test";
import {
	materializeTaskInput,
	parseInventory,
	resolveInventoryFilter,
} from "../lib/inventory.js";

const valid = [
	"name\tenvironment\trole\tsite",
	"app01\tPROD\tmiddleware\tdc1",
	"mon01.example.net\tMON\ticinga\tdc2",
	"",
].join("\n");

test("inventory accepts literal unique aliases", () => {
	const records = parseInventory(valid, "fixture");
	assert.equal(records.size, 2);
	assert.equal(records.get("app01").role, "middleware");
});

test("inventory rejects selectors and duplicates", () => {
	assert.throws(
		() => parseInventory("name\tenvironment\trole\tsite\napp*\tP\tr\ts\n", "fixture"),
		/literal inventory alias/,
	);
	assert.throws(
		() => parseInventory(`${valid.trimEnd()}\napp01\tDEV\tr\ts\n`, "fixture"),
		/duplicates host app01/,
	);
});

test("inventory filters use exact AND matching and retain file order", () => {
	const records = parseInventory([
		"name\tenvironment\trole\tsite",
		"app02\tPROD\tmiddleware\tdc2",
		"app01\tPROD\tmiddleware\tdc1",
		"db01\tPROD\tdatabase\tdc1",
		"dev01\tDEV\tmiddleware\tdc1",
	].join("\n"), "fixture");
	assert.deepEqual(resolveInventoryFilter(records, { environment: "PROD" }).targets, ["app02", "app01", "db01"]);
	assert.deepEqual(
		resolveInventoryFilter(records, { environment: "PROD", role: "middleware" }).targets,
		["app02", "app01"],
	);
	assert.deepEqual(resolveInventoryFilter(records, { site: "dc1", role: "database" }).targets, ["db01"]);
	assert.throws(() => resolveInventoryFilter(records, { environment: "prod" }), /matched no hosts/);
});

test("inventory filters reject ambiguous, unsafe, empty, and over-cap requests", () => {
	const records = parseInventory(valid, "fixture");
	assert.throws(() => resolveInventoryFilter(records, {}), /needs environment, role, or site/);
	assert.throws(() => resolveInventoryFilter(records, { name: "app01" }), /unsupported field/);
	assert.throws(() => resolveInventoryFilter(records, { environment: "PROD\nsite=dc1" }), /single-line/);
	assert.throws(() => resolveInventoryFilter(records, { environment: "PROD" }, { maxTargets: 0 }), /positive integer/);

	const many = new Map(Array.from({ length: 9 }, (_, index) => [
		`app${index}`,
		{ name: `app${index}`, environment: "PROD", role: "app", site: "dc1" },
	]));
	assert.throws(
		() => resolveInventoryFilter(many, { environment: "PROD" }),
		/matched 9 hosts.*at most 8.*no hosts were selected/,
	);
});

test("task target materialization requires exactly one source and returns literals only", () => {
	const records = parseInventory(valid, "fixture");
	const base = { task_type: "general", objective: "Inspect" };
	assert.deepEqual(
		materializeTaskInput({ ...base, inventory_filter: { role: "middleware" } }, records),
		{
			params: { ...base, targets: ["app01"] },
			filter: { role: "middleware" },
		},
	);
	assert.deepEqual(
		materializeTaskInput({ ...base, targets: ["app01"] }, records),
		{ params: { ...base, targets: ["app01"] }, filter: null },
	);
	assert.throws(() => materializeTaskInput(base, records), /exactly one/);
	assert.throws(
		() => materializeTaskInput({ ...base, targets: ["app01"], inventory_filter: { role: "middleware" } }, records),
		/exactly one/,
	);
	assert.throws(
		() => materializeTaskInput({ ...base, targets: ["app01"], command: "hostname" }, records),
		/unsupported field.*command/,
	);
});
