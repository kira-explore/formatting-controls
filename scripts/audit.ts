import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

assert.equal(
  Object.keys(
    JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {},
  ).length,
  0,
  "Review the packaging policy before adding production dependencies",
);
const audit = spawnSync("bun", ["audit", "--json"], { encoding: "utf8" });
assert.ok(!audit.error, String(audit.error));
assert.ok(audit.status === 0 || audit.status === 1, audit.stderr);
const report: Record<string, { url: string }[]> = JSON.parse(audit.stdout);
mkdirSync("test-results", { recursive: true });
writeFileSync(
  "test-results/audit.json",
  `${JSON.stringify(report, null, 2)}\n`,
);
assert.equal(
  audit.status,
  0,
  `Dependency audit failed: ${audit.stdout || audit.stderr}`,
);
assert.deepEqual(
  report,
  {},
  "Dependency advisories must be resolved before merging or release",
);
console.log(
  "Dependency audit passed: no vulnerabilities, no advisory exceptions.",
);
