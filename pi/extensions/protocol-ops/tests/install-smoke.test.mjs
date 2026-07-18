import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const extensionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = resolve(extensionRoot, "..", "..", "..");

test("config-only install links the extension idempotently without touching auth or unrelated settings", () => {
	const home = mkdtempSync(join(tmpdir(), "protocol-ops-install-"));
	const agentDir = join(home, ".pi", "agent");
	const prefix = join(home, ".local");
	mkdirSync(agentDir, { recursive: true });
	const authPath = join(agentDir, "auth.json");
	const settingsPath = join(agentDir, "settings.json");
	writeFileSync(authPath, "auth-sentinel\n", { mode: 0o600 });
	writeFileSync(settingsPath, `${JSON.stringify({ model: "sentinel-model" }, null, 2)}\n`, { mode: 0o600 });

	const run = () =>
		spawnSync("sh", [join(repoRoot, "install-pi.sh"), "--config-only", "--no-codex-skills"], {
			cwd: repoRoot,
			encoding: "utf8",
			env: {
				...process.env,
				HOME: home,
				PI_CODING_AGENT_DIR: agentDir,
				PI_NPM_PREFIX: prefix,
			},
		});

	for (let attempt = 0; attempt < 2; attempt += 1) {
		const result = run();
		assert.equal(result.status, 0, result.stderr || result.stdout);
	}
	assert.equal(readFileSync(authPath, "utf8"), "auth-sentinel\n");
	const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
	assert.equal(settings.model, "sentinel-model");
	assert.equal(settings.theme, "protocol-ink");
	const extensionLink = join(agentDir, "extensions", "protocol-ops");
	assert.equal(lstatSync(extensionLink).isSymbolicLink(), true);
	assert.equal(readlinkSync(extensionLink), join(repoRoot, "pi", "extensions", "protocol-ops"));
	assert.equal(readlinkSync(join(agentDir, "pi-permissions.jsonc")), join(repoRoot, "pi", "pi-permissions.jsonc"));
});
