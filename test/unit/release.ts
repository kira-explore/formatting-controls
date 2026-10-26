import assert from "node:assert/strict";
import { test } from "node:test";
import { validateArtifact } from "../../scripts/lib/artifact";
import { verifyReleaseTag } from "../../scripts/lib/tag";

const identity = {
  name: "formatting-controls",
  publisher: "rajudhami",
  version: "0.4.0",
};
function artifact() {
  const icon = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(icon);
  icon.writeUInt32BE(256, 16);
  icon.writeUInt32BE(256, 20);
  return new Map<string, Buffer>([
    [
      "extension.vsixmanifest",
      Buffer.from(
        '<Identity Id="formatting-controls" Version="0.4.0" Publisher="rajudhami">',
      ),
    ],
    ["[Content_Types].xml", Buffer.from("xml")],
    [
      "extension/package.json",
      Buffer.from(JSON.stringify({ ...identity, main: "./dist/extension.js" })),
    ],
    ["extension/LICENSE.txt", Buffer.from("MIT")],
    ["extension/readme.md", Buffer.from("readme")],
    ["extension/changelog.md", Buffer.from("changes")],
    ["extension/THIRD_PARTY_NOTICES.md", Buffer.from("notices")],
    ["extension/dist/package.json", Buffer.from('{"type":"commonjs"}')],
    ["extension/dist/extension.js", Buffer.from("host")],
    ["extension/dist/webview/dashboard.js", Buffer.from("ui")],
    ["extension/dist/webview/dashboard.css", Buffer.from("css")],
    ["extension/assets/icon.png", icon],
    ["extension/assets/sidebar.svg", Buffer.from("<svg/>")],
  ]);
}
test("final VSIX rejects unexpected files and traversal paths", () => {
  for (const name of [
    "extension/.env",
    "extension/scripts/leak.ts",
    "extension/dist/extension.js.map",
    "extension/node_modules/tool/index.js",
    "extension/docs/../secret.md",
    "extension/private-key.pem",
  ]) {
    const files = artifact();
    files.set(name, Buffer.from("unexpected"));
    assert.throws(
      () => validateArtifact(files, identity),
      /Unsafe archive path|Unexpected package file/,
    );
  }
});
test("final VSIX validates embedded metadata and the host entry point", () => {
  const files = artifact();
  validateArtifact(files, identity);
  files.set(
    "extension/package.json",
    Buffer.from(
      JSON.stringify({
        ...identity,
        version: "0.3.0",
        main: "./dist/extension.js",
      }),
    ),
  );
  assert.throws(() => validateArtifact(files, identity), /Packaged version/);
  files.set(
    "extension/package.json",
    Buffer.from(JSON.stringify({ ...identity, main: "./scripts/private.ts" })),
  );
  assert.throws(() => validateArtifact(files, identity));
});
test("final VSIX requires runtime files and enforces their archived sizes", () => {
  const files = artifact();
  files.delete("extension/dist/webview/dashboard.css");
  assert.throws(() => validateArtifact(files, identity), /missing/);
  const large = artifact();
  large.set("extension/dist/webview/dashboard.js", Buffer.alloc(393217));
  assert.throws(() => validateArtifact(large, identity), /byte budget/);
});
test("final VSIX rejects malformed icons and incompatible host package markers", () => {
  const files = artifact();
  files.set("extension/assets/icon.png", Buffer.from("not a PNG"));
  assert.throws(() => validateArtifact(files, identity), /PNG/);
  const esm = artifact();
  esm.set("extension/dist/package.json", Buffer.from('{"type":"module"}'));
  assert.throws(() => validateArtifact(esm, identity));
});
test("final VSIX installer identity must match the package manifest", () => {
  const files = artifact();
  files.set(
    "extension.vsixmanifest",
    Buffer.from(
      '<Identity Id="formatting-controls" Version="0.3.0" Publisher="rajudhami">',
    ),
  );
  assert.throws(() => validateArtifact(files, identity), /VSIX Version/);
});
const revision = "a".repeat(40),
  other = "b".repeat(40),
  tagObject = "c".repeat(40);
test("release permits absent tags and matching lightweight or annotated tags", () => {
  verifyReleaseTag("0.4.0", revision, "");
  verifyReleaseTag("0.4.0", revision, `${revision}\trefs/tags/v0.4.0\n`);
  verifyReleaseTag(
    "0.4.0",
    revision,
    `${tagObject}\trefs/tags/v0.4.0\n${revision}\trefs/tags/v0.4.0^{}\n`,
  );
});
test("release rejects existing tags pointing to unvalidated commits", () => {
  assert.throws(
    () => verifyReleaseTag("0.4.0", revision, `${other}\trefs/tags/v0.4.0\n`),
    /different commit/,
  );
  assert.throws(
    () =>
      verifyReleaseTag(
        "0.4.0",
        revision,
        `${revision}\trefs/tags/v0.4.0\n${other}\trefs/tags/v0.4.0^{}\n`,
      ),
    /different commit/,
  );
});
test("release rejects malformed remote tag responses", () => {
  for (const value of [
    "not-a-sha\trefs/tags/v0.4.0",
    `${revision}\trefs/heads/main`,
    `${revision}\trefs/tags/v0.4.0\n${other}\trefs/tags/v0.4.0`,
  ])
    assert.throws(
      () => verifyReleaseTag("0.4.0", revision, value),
      /Invalid remote tag/,
    );
});
