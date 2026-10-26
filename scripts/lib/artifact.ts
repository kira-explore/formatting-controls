import assert from "node:assert/strict";
import { type Entry, open } from "yauzl";
export type ReleaseIdentity = {
  name: string;
  publisher: string;
  version: string;
};
const required = [
  "extension.vsixmanifest",
  "[Content_Types].xml",
  "extension/package.json",
  "extension/LICENSE.txt",
  "extension/readme.md",
  "extension/changelog.md",
  "extension/THIRD_PARTY_NOTICES.md",
  "extension/dist/package.json",
  "extension/dist/extension.js",
  "extension/dist/webview/dashboard.js",
  "extension/dist/webview/dashboard.css",
  "extension/assets/icon.png",
];
const rootFiles = new Set([
  "extension.vsixmanifest",
  "[Content_Types].xml",
  "extension/package.json",
  "extension/LICENSE.txt",
  "extension/readme.md",
  "extension/changelog.md",
  "extension/THIRD_PARTY_NOTICES.md",
  "extension/SECURITY.md",
  "extension/SUPPORT.md",
  "extension/CODE_OF_CONDUCT.md",
  "extension/dist/package.json",
  "extension/dist/extension.js",
  "extension/dist/webview/dashboard.js",
  "extension/dist/webview/dashboard.css",
  "extension/assets/icon.png",
]);
export function validateArtifact(
  files: ReadonlyMap<string, Buffer>,
  expected: ReleaseIdentity,
): void {
  for (const name of required)
    assert.ok(files.get(name)?.length, `Package is missing ${name}`);
  for (const name of files.keys()) {
    assert.ok(
      !name.split("/").includes("..") && !name.includes("\\"),
      `Unsafe archive path: ${name}`,
    );
    assert.ok(
      rootFiles.has(name) ||
        /^extension\/docs\/(?:[\w-]+\.md|assets\/[\w-]+\.png)$/.test(name),
      `Unexpected package file: ${name}`,
    );
  }
  const manifest = JSON.parse(
    files.get("extension/package.json")?.toString() ?? "null",
  );
  for (const key of ["name", "publisher", "version"] as const)
    assert.equal(
      manifest?.[key],
      expected[key],
      `Packaged ${key} differs from the release candidate`,
    );
  assert.equal(manifest.main, "./dist/extension.js");
  assert.equal(
    JSON.parse(files.get("extension/dist/package.json")?.toString() ?? "null")
      ?.type,
    "commonjs",
  );
  for (const [name, limit] of [
    ["extension/dist/extension.js", 131072],
    ["extension/dist/webview/dashboard.js", 393216],
    ["extension/dist/webview/dashboard.css", 20480],
  ] as const)
    assert.ok(
      (files.get(name)?.length ?? Infinity) <= limit,
      `${name} exceeds its ${limit}-byte budget`,
    );
  const xmlIdentity = files
    .get("extension.vsixmanifest")
    ?.toString()
    .match(/<Identity\b([^>]+)>/);
  assert.ok(xmlIdentity, "VSIX Identity metadata is missing");
  for (const [attribute, expectedValue] of [
    ["Id", expected.name],
    ["Publisher", expected.publisher],
    ["Version", expected.version],
  ]) {
    const actual: string | undefined = xmlIdentity[1]?.match(
      new RegExp(`\\b${attribute}="([^"]+)"`),
    )?.[1];
    assert.equal(
      actual,
      expectedValue,
      `VSIX ${attribute} differs from the release candidate`,
    );
  }
  const icon = files.get("extension/assets/icon.png");
  assert.ok(
    icon &&
      icon.length >= 24 &&
      icon
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "Invalid PNG icon",
  );
  assert.ok(
    icon.readUInt32BE(16) >= 128 && icon.readUInt32BE(20) >= 128,
    "Icon must be at least 128px",
  );
}
export function readArtifact(path: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    open(path, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error("Could not open VSIX"));
        return;
      }
      const files = new Map<string, Buffer>();
      let total = 0;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(error);
      };
      zip.on("error", fail);
      zip.on("entry", (entry: Entry) => {
        try {
          assert.ok(
            files.size < 128 &&
              entry.uncompressedSize <= 1048576 &&
              total + entry.uncompressedSize <= 8388608,
            "VSIX exceeds expanded content limits",
          );
          assert.ok(
            !files.has(entry.fileName),
            `Duplicate archive entry: ${entry.fileName}`,
          );
          assert.ok(
            ((entry.externalFileAttributes >>> 16) & 0xf000) !== 0xa000,
            "VSIX must not contain symbolic links",
          );
          total += entry.uncompressedSize;
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) {
              fail(error ?? new Error("Could not read VSIX entry"));
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > entry.uncompressedSize) {
                stream.destroy(new Error("VSIX entry exceeds declared size"));
                return;
              }
              chunks.push(chunk);
            });
            stream.on("error", fail);
            stream.on("end", () => {
              if (settled) return;
              files.set(entry.fileName, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        } catch (error) {
          fail(error);
        }
      });
      zip.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(files);
      });
      zip.readEntry();
    });
  });
}
