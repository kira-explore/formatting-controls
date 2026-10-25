import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

assert.equal(
  Object.keys(
    JSON.parse(readFileSync("package.json", "utf8")).dependencies ?? {},
  ).length,
  0,
  "Review the audit baseline before adding production dependencies",
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
for (const [name, findings] of Object.entries(report)) {
  assert.ok(Array.isArray(findings), "Unexpected audit response");
  for (const finding of findings) {
    assert.ok(
      name === "@azure/msal-node" &&
        finding.url === "https://github.com/advisories/GHSA-xcx6-jx8p-x3h5",
      `New dependency advisory: ${name} ${finding.url}`,
    );
    console.warn(
      "Known development packaging advisory GHSA-xcx6-jx8p-x3h5 remains. Strict release audit blocks release preparation. See SECURITY.md.",
    );
  }
}
assert.ok(
  audit.status === 0 || Object.keys(report).length > 0,
  "Audit failed without a report",
);
