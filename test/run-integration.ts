import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

(async () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "formatting-controls-test-"),
  );
  fs.mkdirSync(path.join(temp, "workspace"));
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve("."),
      extensionTestsPath: path.resolve("dist/test/integration/suite.js"),
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
