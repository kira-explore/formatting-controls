const { runTests } = require("@vscode/test-electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
(async () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "formatting-controls-test-"),
  );
  fs.mkdirSync(path.join(temp, "workspace"));
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve("."),
      extensionTestsPath: path.resolve("dist/test/integration/suite.cjs"),
      launchArgs: [
        path.join(temp, "workspace"),
        "--user-data-dir",
        path.join(temp, "user"),
        "--extensions-dir",
        path.join(temp, "extensions"),
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
      ],
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
