import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const extensionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const policyPath = join(extensionRoot, "..", "..", "pi-permissions.jsonc");

test("Protocol Ops exact tools are allowed while generic remote mutation remains gated", () => {
	const policy = JSON.parse(readFileSync(policyPath, "utf8"));
	assert.equal(policy.tools.ops_inventory, "allow");
	assert.equal(policy.tools.ops_task, "allow");
	assert.equal(policy.tools.ops_observe, "allow");
	assert.equal(policy.tools.ops_monitoring, "allow");
	assert.equal(policy.tools.ops_account, "allow");
	assert.equal(policy.tools.ops_checkpoint, "allow");
	assert.equal(policy.tools.ssh_bash, "ask");
	assert.equal(policy.tools.ssh_write, "deny");
	assert.equal(policy.tools.ssh_edit, "deny");
});
