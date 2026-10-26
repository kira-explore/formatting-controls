import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
} from "@vscode/test-electron";

const root = mkdtempSync(join(tmpdir(), "fcr-"));
const report = resolve("test-results/remote");
rmSync(report, { recursive: true, force: true });
mkdirSync(report, { recursive: true });
const context = process.env.FC_REMOTE_DOCKER_CONTEXT;
const dockerArgs = context ? ["--context", context] : [];
const command = (file: string, args: string[]) =>
  execFileSync(file, args, {
    encoding: "utf8",
    timeout: 600000,
    maxBuffer: 16777216,
  });
const docker = (...args: string[]) =>
  command("docker", [...dockerArgs, ...args]);
let container: string | undefined;
try {
  docker("build", "-t", "formatting-controls-remote-test:local", "test/remote");
  container = docker(
    "run",
    "--detach",
    "--rm",
    "-p",
    "127.0.0.1::22",
    "formatting-controls-remote-test:local",
  ).trim();
  command("ssh-keygen", [
    "-q",
    "-t",
    "ed25519",
    "-N",
    "",
    "-f",
    join(root, "identity"),
  ]);
  docker(
    "cp",
    join(root, "identity.pub"),
    `${container}:/home/fc/.ssh/authorized_keys`,
  );
  docker("exec", container, "chown", "fc:fc", "/home/fc/.ssh/authorized_keys");
  docker("exec", container, "chmod", "600", "/home/fc/.ssh/authorized_keys");
  const port = docker("port", container, "22/tcp").trim().split(":").at(-1);
  assert.match(port ?? "", /^\d+$/);
  const config = join(root, "ssh-config");
  writeFileSync(
    config,
    `Host fc-remote-review\n HostName 127.0.0.1\n Port ${port}\n User fc\n IdentityFile "${join(root, "identity")}"\n IdentitiesOnly yes\n StrictHostKeyChecking accept-new\n UserKnownHostsFile "${join(root, "known-hosts")}"\n`,
    { mode: 0o600 },
  );
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      command("ssh", [
        "-F",
        config,
        "-o",
        "ConnectTimeout=3",
        "fc-remote-review",
        "true",
      ]);
      break;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const fixture = join(root, "extension");
  mkdirSync(fixture);
  cpSync("dist", join(fixture, "dist"), { recursive: true });
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  manifest.main = "./dist/test/integration/remote/fixture.js";
  writeFileSync(join(fixture, "package.json"), JSON.stringify(manifest));
  const workspace = join(root, "workspace");
  mkdirSync(workspace);
  writeFileSync(
    join(workspace, "remote.code-workspace"),
    JSON.stringify({ folders: [{ path: "first" }, { path: "second" }] }),
  );
  mkdirSync(join(workspace, "first"));
  mkdirSync(join(workspace, "second"));
  writeFileSync(
    join(workspace, "first/example.ts"),
    "export const remote = true;\n",
  );
  if (process.argv.includes("--review"))
    writeFileSync(join(workspace, "review.json"), "true");
  docker("cp", fixture, `${container}:/home/fc/extension`);
  docker("cp", workspace, `${container}:/home/fc/workspace`);
  docker(
    "exec",
    container,
    "chown",
    "-R",
    "fc:fc",
    "/home/fc/extension",
    "/home/fc/workspace",
  );
  const machineSettings = join(root, "remote-settings.json");
  writeFileSync(
    machineSettings,
    JSON.stringify({ "editor.formatOnSaveMode": "modifications" }),
  );
  docker(
    "exec",
    container,
    "mkdir",
    "-p",
    "/home/fc/.vscode-server/data/Machine",
  );
  docker(
    "cp",
    machineSettings,
    `${container}:/home/fc/.vscode-server/data/Machine/settings.json`,
  );
  docker("exec", container, "chown", "-R", "fc:fc", "/home/fc/.vscode-server");
  const user = join(root, "u");
  mkdirSync(join(user, "User"), { recursive: true });
  writeFileSync(
    join(user, "User/settings.json"),
    JSON.stringify({
      "remote.SSH.configFile": config,
      "remote.SSH.remotePlatform": { "fc-remote-review": "linux" },
      "remote.SSH.useLocalServer": false,
      "remote.SSH.useExecServer": false,
      "remote.SSH.connectTimeout": 60,
      "extensions.autoUpdate": false,
      "extensions.autoCheckUpdates": false,
      "security.workspace.trust.enabled": false,
      "workbench.startupEditor": "none",
      "editor.formatOnSaveMode": "file",
    }),
  );
  const executable = await downloadAndUnzipVSCode({
    version: process.env.VSCODE_VERSION ?? "stable",
  });
  const extensions = join(root, "extensions");
  if (process.env.FC_REMOTE_EXTENSIONS)
    cpSync(process.env.FC_REMOTE_EXTENSIONS, extensions, { recursive: true });
  else {
    const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(executable);
    assert.ok(cli);
    console.log(
      command(cli, [
        ...args,
        "--user-data-dir",
        user,
        "--extensions-dir",
        extensions,
        "--install-extension",
        "ms-vscode-remote.remote-ssh@0.128.0",
        "--force",
      ]),
    );
  }
  writeFileSync(
    join(report, "session.json"),
    JSON.stringify({ root, container, config, user, extensions }, null, 2),
  );
  console.log("Remote test session:", join(report, "session.json"));
  const remote = (path: string) =>
    `vscode-remote://ssh-remote+fc-remote-review${path}`;
  // Native extension test mode uses in-memory storage. Ordinary development
  // windows exercise durable Mementos across real client/host restarts.
  const launch = async () => {
    await new Promise<void>((resolveLaunch, reject) => {
      const child = spawn(
        executable,
        [
          "--new-window",
          "--no-sandbox",
          "--disable-gpu-sandbox",
          "--disable-workspace-trust",
          "--skip-welcome",
          "--skip-release-notes",
          "--disable-updates",
          "--file-uri",
          remote("/home/fc/workspace/remote.code-workspace"),
          `--extensionDevelopmentPath=${remote("/home/fc/extension")}`,
          "--user-data-dir",
          user,
          "--extensions-dir",
          extensions,
        ],
        { stdio: "inherit" },
      );
      const timeout = setTimeout(
        () => {
          child.kill("SIGTERM");
          reject(new Error("Remote test window timed out"));
        },
        process.argv.includes("--review") ? 2100000 : 600000,
      );
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        code === 0
          ? resolveLaunch()
          : reject(new Error(`Remote client exited with ${code}`));
      });
    });
    const status = docker(
      "exec",
      container as string,
      "sh",
      "-c",
      "if test -f /home/fc/workspace/actor-error.json; then cat /home/fc/workspace/actor-error.json; fi",
    );
    if (status) writeFileSync(join(report, "failure.json"), status);
    assert.equal(status, "", status);
  };
  await launch();
  const localSettings = JSON.parse(
    readFileSync(join(user, "User/settings.json"), "utf8"),
  );
  const remoteSettings = JSON.parse(
    docker(
      "exec",
      container,
      "cat",
      "/home/fc/.vscode-server/data/Machine/settings.json",
    ),
  );
  writeFileSync(
    join(report, "scope-targets.json"),
    JSON.stringify(
      {
        localFormatOnSave: localSettings["editor.formatOnSave"],
        localMode: localSettings["editor.formatOnSaveMode"],
        remoteMode: remoteSettings["editor.formatOnSaveMode"],
      },
      null,
      2,
    ),
  );
  assert.equal(localSettings["editor.formatOnSave"], true);
  assert.equal(localSettings["editor.formatOnSaveMode"], "file");
  assert.equal(
    remoteSettings["editor.formatOnSaveMode"],
    "modificationsIfAvailable",
  );
  await launch();
  const resumed = JSON.parse(
    docker("exec", container, "cat", "/home/fc/workspace/resume-result.json"),
  );
  assert.equal(resumed.passed, true);
  writeFileSync(
    join(report, "reconnect.json"),
    JSON.stringify(resumed, null, 2),
  );
  const result = JSON.parse(
    docker("exec", container, "cat", "/home/fc/workspace/remote-result.json"),
  );
  assert.equal(result.passed, true);
  writeFileSync(join(report, "results.json"), JSON.stringify(result, null, 2));
  if (process.argv.includes("--review"))
    writeFileSync(
      join(report, "review.json"),
      docker("exec", container, "cat", "/home/fc/workspace/remote-review.json"),
    );
  console.log("Real Remote SSH review passed:", JSON.stringify(result));
} catch (error) {
  if (container)
    writeFileSync(join(report, "ssh.log"), docker("logs", container));
  if (existsSync(join(root, "u")))
    cpSync(join(root, "u"), join(report, "client"), { recursive: true });
  throw error;
} finally {
  if (container) docker("rm", "--force", container);
  rmSync(root, { recursive: true, force: true });
  rmSync(join(report, "session.json"), { force: true });
}
