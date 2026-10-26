import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import {
  configuration,
  own,
  setAction,
  write,
} from "../../../src/configuration";
import { Dashboard } from "../../../src/dashboard";
import { FileProfiles } from "../../../src/profile-store";
import { Workflows } from "../../../src/workflows";

export async function run(): Promise<void> {
  assert.equal(
    vscode.env.remoteName,
    "ssh-remote",
    "A real Remote SSH extension host is required",
  );
  assert.equal(
    process.platform,
    "linux",
    "The test host must run in Linux, not the desktop client",
  );
  const extension = vscode.extensions.getExtension<vscode.ExtensionContext>(
    "rajudhami.formatting-controls",
  );
  assert.ok(extension);
  const context = await extension.activate();
  const folder = vscode.workspace.workspaceFolders?.[0];
  const other = vscode.workspace.workspaceFolders?.[1];
  assert.ok(folder);
  assert.ok(other);
  assert.ok(vscode.workspace.workspaceFile);
  const root = dirname(vscode.workspace.workspaceFile.fsPath);
  const profiles = new FileProfiles(
    context.globalStorageUri,
    context.globalState,
  );
  const scope = { target: "folder" as const, folder: folder.uri.toString() };
  const selection = {
    target: vscode.ConfigurationTarget.WorkspaceFolder,
    uri: folder.uri,
  };
  const exported = vscode.Uri.joinPath(folder.uri, "roundtrip.json");
  const make = () =>
    new Workflows(
      context.globalState,
      context.workspaceState,
      async () => true,
      { open: async () => exported, save: async () => exported },
      profiles,
    );
  let workflows = make();
  const checks: string[] = [];
  try {
    const resumePath = join(root, "resume-phase.json");
    if (existsSync(resumePath)) {
      const previous = JSON.parse(readFileSync(resumePath, "utf8"));
      assert.notEqual(
        process.pid,
        previous.pid,
        "Reconnect must use a new remote extension-host process",
      );
      assert.equal(workflows.recovery()?.kind, "pause");
      assert.equal(
        own(selection, "editor.formatOnSave"),
        false,
        "Folder format-on-save must be false during pause",
      );
      assert.ok(profiles.read().some((p) => p.name === "Remote saved"));
      await setAction(selection, "source.fixAll.afterReconnect", "explicit");
      await workflows.restore();
      assert.equal(own(selection, "editor.formatOnSave"), true);
      assert.equal(
        (own(selection, "editor.codeActionsOnSave") as Record<string, unknown>)[
          "source.fixAll.afterReconnect"
        ],
        "explicit",
      );
      assert.equal(workflows.recovery(), null);
      const result = {
        passed: true,
        previousPid: previous.pid,
        pid: process.pid,
        remoteName: vscode.env.remoteName,
        checks: [
          "saved profiles and paused settings survive client close/reconnect",
          "persisted workspace recovery resumes in a new Linux host process",
          "resume preserves an action added after reconnect",
        ],
      };
      writeFileSync(
        join(root, "resume-result.json"),
        JSON.stringify(result, null, 2),
      );
      console.log(
        "Remote reconnect assertions passed:",
        JSON.stringify(result),
      );
      return;
    }
    const user = { ...selection, target: vscode.ConfigurationTarget.Global };
    const workspace = {
      ...selection,
      target: vscode.ConfigurationTarget.Workspace,
    };
    assert.equal(
      configuration(user).get("editor.formatOnSaveMode"),
      "modifications",
    );
    await write(user, "editor.formatOnSaveMode", "modificationsIfAvailable");
    assert.equal(
      configuration(user).get("editor.formatOnSaveMode"),
      "modificationsIfAvailable",
    );
    checks.push(
      "existing Remote User preference updates through VS Code Global target",
    );
    await write(user, "editor.formatOnSave", true);
    await write(workspace, "editor.formatOnSave", false);
    assert.equal(
      configuration(selection).get("editor.formatOnSave"),
      false,
      "Workspace false must override global true",
    );
    await write(selection, "editor.formatOnSave", true);
    assert.equal(configuration(selection).get("editor.formatOnSave"), true);
    assert.equal(own(user, "editor.formatOnSave"), true);
    assert.equal(
      own(workspace, "editor.formatOnSave"),
      false,
      "Workspace must retain its explicit false value",
    );
    assert.equal(
      own({ ...selection, uri: other.uri }, "editor.formatOnSave"),
      undefined,
    );
    checks.push("User/Workspace/Folder precedence and remote folder isolation");
    const language = { ...selection, language: "typescript" };
    await write(language, "editor.formatOnSave", false);
    assert.equal(
      configuration(language).get("editor.formatOnSave"),
      false,
      "TypeScript override must remain false",
    );
    assert.equal(
      configuration({ ...selection, language: "javascript" }).get(
        "editor.formatOnSave",
      ),
      true,
    );
    await write(language, "editor.formatOnSave", undefined);
    await setAction(selection, "source.fixAll.biome", "explicit");
    await setAction(selection, "source.organizeImports", "always");
    checks.push(
      "language override and action-preserving remote settings writes",
    );
    await workflows.save("Remote saved", selection, scope);
    assert.ok(
      existsSync(join(context.globalStorageUri.fsPath, "profiles-v2.json")),
    );
    assert.ok(
      context.globalStorageUri.fsPath.startsWith(homedir()),
      "Profiles must be stored on the Linux host",
    );
    await workflows.export("Remote saved", selection, scope);
    const document = JSON.parse(
      new TextDecoder().decode(await vscode.workspace.fs.readFile(exported)),
    );
    assert.equal(document.name, "Remote saved");
    document.name = "Remote imported";
    await vscode.workspace.fs.writeFile(
      exported,
      new TextEncoder().encode(JSON.stringify(document)),
    );
    await workflows.import(scope);
    assert.ok(profiles.read().some((p) => p.name === "Remote imported"));
    checks.push(
      "profiles persist in remote private storage; remote URI import/export round trip",
    );
    await workflows.pause(
      selection,
      scope,
      configuration(selection).get("editor.codeActionsOnSave"),
    );
    assert.equal(
      own(selection, "editor.formatOnSave"),
      false,
      "Folder format-on-save must be false during pause",
    );
    assert.equal(workflows.recovery()?.kind, "pause");
    workflows.dispose();
    workflows = make();
    assert.equal(workflows.recovery()?.kind, "pause");
    await setAction(selection, "source.fixAll.biome", "always");
    await setAction(selection, "source.fixAll.external", "explicit");
    await workflows.restore();
    assert.equal(own(selection, "editor.formatOnSave"), true);
    const actions = own(selection, "editor.codeActionsOnSave") as Record<
      string,
      unknown
    >;
    assert.equal(actions["source.fixAll.biome"], "always");
    assert.equal(actions["source.organizeImports"], "always");
    assert.equal(actions["source.fixAll.external"], "explicit");
    assert.equal(workflows.recovery()?.phase, "conflicts");
    await workflows.discard();
    checks.push("durable remote pause journal and conflict-preserving resume");
    const dashboard = new Dashboard(context.extensionUri, undefined, workflows);
    try {
      assert.equal((await dashboard.snapshot()).remoteName, "ssh-remote");
    } finally {
      dashboard.dispose();
    }
    checks.push(
      "dashboard identifies the remote session for User scope guidance",
    );
    await vscode.commands.executeCommand("formattingControls.dashboard");
    const report = {
      passed: true,
      remoteName: vscode.env.remoteName,
      vscode: vscode.version,
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      pid: process.pid,
      extension: context.extensionUri.toString(),
      storage: context.globalStorageUri.toString(),
      workspace: vscode.workspace.workspaceFile.toString(),
      checks,
    };
    writeFileSync(
      join(root, "remote-result.json"),
      JSON.stringify(report, null, 2),
    );
    console.log("Remote workspace assertions passed:", JSON.stringify(report));
    if (existsSync(join(root, "review.json"))) {
      const deadline = Date.now() + 1800000;
      while (!existsSync(join(root, "review-done"))) {
        if (Date.now() > deadline)
          throw new Error("Remote UI review timed out");
        await new Promise((r) => setTimeout(r, 500));
      }
      const review = JSON.parse(
        readFileSync(join(root, "review-done"), "utf8"),
      );
      assert.equal(
        review.passed,
        true,
        "The native UI review must be completed successfully",
      );
      writeFileSync(
        join(root, "remote-review.json"),
        JSON.stringify(review, null, 2),
      );
    }
    await workflows.pause(
      selection,
      scope,
      configuration(selection).get("editor.codeActionsOnSave"),
    );
    assert.equal(workflows.recovery()?.kind, "pause");
    writeFileSync(
      join(root, "resume-phase.json"),
      JSON.stringify({ pid: process.pid }),
    );
  } finally {
    workflows.dispose();
    profiles.dispose();
  }
}
