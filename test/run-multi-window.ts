import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { downloadAndUnzipVSCode, runTests } from "@vscode/test-electron";

const root = mkdtempSync(join(tmpdir(), "fcw-"));
const report = resolve("test-results", "multi-window");
mkdirSync(report, { recursive: true });
for (const file of ["failure.json", "results.json"])
  rmSync(join(report, file), { force: true });
const wait = async (check: () => boolean, label: string) => {
  const deadline = Date.now() + 90000;
  while (!check()) {
    if (existsSync(join(root, "startup-error.json")))
      throw new Error(readFileSync(join(root, "startup-error.json"), "utf8"));
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise((r) => setTimeout(r, 100));
  }
};
try {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  manifest.main = "./dist/test/integration/windows/fixture.js";
  for (const role of ["a", "b"]) {
    const fixture = join(root, `ext-${role}`);
    mkdirSync(fixture);
    cpSync("dist", join(fixture, "dist"), { recursive: true });
    writeFileSync(join(fixture, "package.json"), JSON.stringify(manifest));
  }
  mkdirSync(join(root, "shared"));
  for (const role of ["a", "b"])
    writeFileSync(
      join(root, `${role}.code-workspace`),
      JSON.stringify({ folders: [{ path: "shared" }] }),
    );
  const executable = await downloadAndUnzipVSCode({
    version: process.env.VSCODE_VERSION ?? "stable",
  });
  const args = (role: "a" | "b") => [
    join(root, `${role}.code-workspace`),
    "--new-window",
    "--user-data-dir",
    join(root, "u"),
    "--extensions-dir",
    join(root, "extensions"),
  ];
  const host = runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath: join(root, "ext-a"),
    extensionTestsPath: join(root, "ext-a/dist/test/integration/windows/a.js"),
    launchArgs: args("a"),
  }).then(
    (code) => ({ code, error: null }),
    (error) => {
      writeFileSync(
        join(root, "startup-error.json"),
        JSON.stringify(String(error)),
      );
      return { code: 1, error };
    },
  );
  let hostResult: Awaited<typeof host> | undefined;
  try {
    await wait(() => existsSync(join(root, "a-ready.json")), "first window");
    // A second CLI test host is unsupported. Open a development window in the
    // existing app instead; its fixture runs actor B without production hooks.
    const second = spawn(
      executable,
      [
        ...args("b"),
        `--extensionDevelopmentPath=${join(root, "ext-b")}`,
        "--no-sandbox",
        "--disable-workspace-trust",
      ],
      { stdio: "inherit" },
    );
    second.on("error", (error) =>
      writeFileSync(join(root, "startup-error.json"), String(error)),
    );
    second.on("exit", (code) => {
      if (code && code !== 0)
        writeFileSync(
          join(root, "startup-error.json"),
          `Second window startup failed: ${code}`,
        );
    });
    await wait(
      () =>
        existsSync(join(root, "a-result.json")) &&
        existsSync(join(root, "b-result.json")),
      "both window results",
    );
    const results = ["a", "b"].map((role) =>
      JSON.parse(readFileSync(join(root, `${role}-result.json`), "utf8")),
    );
    writeFileSync(
      join(report, "results.json"),
      JSON.stringify(results, null, 2),
    );
    assert.equal(
      results[0].profileStorage,
      results[1].profileStorage,
      "Both windows must use the same profile storage",
    );
    assert.notEqual(
      results[0].pid,
      results[1].pid,
      "Separate extension-host processes are required",
    );
    assert.notEqual(
      results[0].workspace,
      results[1].workspace,
      "Two distinct windows sharing the same folder are required",
    );
    assert.ok(
      results.every((result) => result.passed),
      JSON.stringify(results),
    );
    console.log(
      "Two-window assertions passed with shared User data and workspace folder:",
      JSON.stringify(results),
    );
  } finally {
    writeFileSync(join(root, "finish.json"), "true");
    hostResult = await host;
  }
  if (hostResult.error) throw hostResult.error;
  assert.equal(hostResult.code, 0, "Native test host must exit successfully");
} catch (error) {
  const signals = Object.fromEntries(
    readdirSync(root)
      .filter((name) => name.endsWith(".json"))
      .map((name) => [name, readFileSync(join(root, name), "utf8")]),
  );
  writeFileSync(
    join(report, "failure.json"),
    JSON.stringify({ error: String(error), signals }, null, 2),
  );
  throw error;
} finally {
  rmSync(root, { recursive: true, force: true });
}
