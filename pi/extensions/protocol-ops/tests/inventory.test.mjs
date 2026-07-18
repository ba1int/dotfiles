import assert from "node:assert/strict";
import test from "node:test";
import { parseInventory } from "../lib/inventory.js";

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
