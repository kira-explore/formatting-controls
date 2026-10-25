import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { verifyReleaseTag } from "./lib/tag";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const version = process.env.RELEASE_VERSION;
assert.ok(
  version && /^\d+\.\d+\.\d+$/.test(version),
  "RELEASE_VERSION must be an explicit stable version",
);
assert.equal(
  version,
  manifest.version,
  "Release version must match package.json",
);
if (process.env.GITHUB_REF)
  assert.equal(
    process.env.GITHUB_REF,
    "refs/heads/main",
    "Release preparation runs only on main",
  );
if (process.env.GITHUB_SHA) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.equal(
    revision,
    process.env.GITHUB_SHA,
    "Checkout differs from the workflow revision",
  );
  const ref = `refs/tags/v${version}`;
  const tags = execFileSync("git", ["ls-remote", "origin", ref, `${ref}^{}`], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 65536,
  });
  verifyReleaseTag(version, revision, tags);
}
const changelog = readFileSync("CHANGELOG.md", "utf8");
const entry = changelog.split(`## ${version} — `)[1]?.split(/\n## /)[0];
assert.ok(entry, "Changelog entry is missing");
assert.ok(entry.trim(), "Changelog entry is empty");
writeFileSync(
  "release-notes.md",
  `# Formatting Controls ${version}\n\n${entry.split("\n").slice(1).join("\n").trim()}\n\nReview the security and compatibility gates in docs/releasing.md before publication.\n`,
);
console.log(
  `Release metadata verified: ${manifest.publisher}.${manifest.name} ${version}`,
);
