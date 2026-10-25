import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createVSIX } from "@vscode/vsce";
import { readArtifact, validateArtifact } from "./lib/artifact";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const filename = `${manifest.name}-${manifest.version}.vsix`;
rmSync(`${filename}.sha256`, { force: true });
try {
  // vsce runs vscode:prepublish first; validate the resulting archive afterwards.
  await createVSIX({
    dependencies: false,
    packagePath: filename,
    githubBranch: "main",
  });
  assert.ok(statSync(filename).size < 2097152, "VSIX exceeds 2 MiB");
  const files = await readArtifact(filename);
  validateArtifact(files, manifest);
  writeFileSync(
    `${filename}.sha256`,
    `${createHash("sha256").update(readFileSync(filename)).digest("hex")}  ${filename}\n`,
  );
  console.log(
    `Verified ${files.size} final VSIX entries, metadata and bundle budgets; SHA-256 written to ${filename}.sha256`,
  );
} catch (error) {
  rmSync(filename, { force: true });
  throw error;
}
