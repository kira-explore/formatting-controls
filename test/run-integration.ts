import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runTests } from "@vscode/test-electron";
import { reviewDashboard } from "./dashboard";

(async () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "formatting-controls-test-"),
  );
  fs.mkdirSync(path.join(temp, "first"));
  fs.mkdirSync(path.join(temp, "second"));
  const workspace = path.join(temp, "test.code-workspace");
  fs.writeFileSync(
    workspace,
    JSON.stringify({ folders: [{ path: "first" }, { path: "second" }] }),
  );
  const statusUi = process.argv.includes("--status-ui");
  const ui = process.argv.includes("--ui") || statusUi;
  const empty = process.argv.includes("--empty");
  const ready = path.join(temp, "ui-ready"),
    done = path.join(temp, "ui-done");
  const report = path.resolve(
    "test-results",
    `${process.platform}-${process.env.VSCODE_VERSION ?? "stable"}-${(process.env.FORMATTING_CONTROLS_UI_THEME ?? "Dark Modern").replaceAll(" ", "-")}${statusUi ? "-status" : ""}`,
  );
  let hostFinished = false;
  try {
    const host = runTests({
      version: process.env.VSCODE_VERSION ?? "stable",
      extensionDevelopmentPath: path.resolve("."),
      extensionTestsPath: path.resolve(
        `dist/test/integration/${empty ? "empty" : "suite"}.js`,
      ),
      extensionTestsEnv: {
        FORMATTING_CONTROLS_STATUS_UI: statusUi ? "1" : "",
        FORMATTING_CONTROLS_UI_THEME:
          process.env.FORMATTING_CONTROLS_UI_THEME ?? (ui ? "Dark Modern" : ""),
        FORMATTING_CONTROLS_REPORT_DIR: report,
        FORMATTING_CONTROLS_UI_READY: ui ? ready : "",
        FORMATTING_CONTROLS_UI_DONE: ui ? done : "",
        FORMATTING_CONTROLS_UI_DURATION:
          process.env.FORMATTING_CONTROLS_UI_DURATION ?? "180000",
        FORMATTING_CONTROLS_UI_REVIEW:
          process.env.FORMATTING_CONTROLS_UI_REVIEW ?? "",
      },
      launchArgs: [
        ...(ui || process.env.FORMATTING_CONTROLS_UI_REVIEW
          ? ["--remote-debugging-port=9333"]
          : []),
        ...(empty ? ["--new-window"] : [workspace]),
        "--user-data-dir",
        path.join(temp, "user"),
        "--extensions-dir",
        path.join(temp, "extensions"),
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
      ],
    }).finally(() => {
      hostFinished = true;
    });
    const browser = ui
      ? (async () => {
          try {
            const deadline = Date.now() + 120000;
            while (!fs.existsSync(ready)) {
              if (hostFinished)
                throw new Error(
                  "Extension host exited before dashboard verification",
                );
              if (Date.now() > deadline)
                throw new Error(
                  "Extension host did not become ready for dashboard tests",
                );
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
            await reviewDashboard(report, statusUi);
          } finally {
            fs.writeFileSync(done, "done");
          }
        })()
      : Promise.resolve();
    const results = await Promise.allSettled([host, browser]);
    for (const result of results)
      if (result.status === "rejected") throw result.reason;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
