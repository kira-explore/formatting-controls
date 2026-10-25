import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createVSIX, listFiles, PackageManager } from "@vscode/vsce";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const files = await listFiles({ packageManager: PackageManager.None });
const required = [
  "dist/extension.js",
  "dist/package.json",
  "dist/webview/dashboard.js",
  "dist/webview/dashboard.css",
  "assets/icon.png",
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
  "THIRD_PARTY_NOTICES.md",
];
for (const file of required)
  assert.ok(files.includes(file), `Package is missing ${file}`);
for (const file of files) {
  assert.ok(
    !/(^|\/)(src|shared|test|scripts|node_modules|test-results|\.git|\.github|\.vscode)(\/|$)/.test(
      file,
    ),
    `Unexpected package file: ${file}`,
  );
  assert.ok(
    !/\.(map|ts|cjs|mjs)$/.test(file),
    `Development source included: ${file}`,
  );
  assert.ok(
    !/(^|\/)\.env(?:\.|$)/.test(file),
    `Environment file included: ${file}`,
  );
}
for (const [file, limit] of [
  ["dist/extension.js", 131072],
  ["dist/webview/dashboard.js", 393216],
  ["dist/webview/dashboard.css", 20480],
] as const) {
  const size = statSync(file).size;
  assert.ok(size <= limit, `${file} exceeds its ${limit}-byte budget: ${size}`);
  console.log(`${file}: ${size} / ${limit} bytes`);
}
const icon = readFileSync("assets/icon.png");
assert.equal(icon.subarray(1, 4).toString(), "PNG");
assert.ok(icon.readUInt32BE(16) >= 128 && icon.readUInt32BE(20) >= 128);
const filename = `${manifest.name}-${manifest.version}.vsix`;
await createVSIX({
  dependencies: false,
  packagePath: filename,
  githubBranch: "main",
});
const size = statSync(filename).size;
assert.ok(size < 2097152, `VSIX exceeds 2 MiB: ${size}`);
writeFileSync(
  `${filename}.sha256`,
  `${createHash("sha256").update(readFileSync(filename)).digest("hex")}  ${filename}\n`,
);
console.log(
  `Verified ${files.length} package inputs; SHA-256 written to ${filename}.sha256`,
);
