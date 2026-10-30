import assert from "node:assert/strict";
import * as vscode from "vscode";
import { own, write } from "../../src/configuration";
import { Dashboard } from "../../src/dashboard";
import { StatusControls } from "../../src/status-controls";
import { Workflows } from "../../src/workflows";
import { MemoryStore } from "./workflows";
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension(
    "rajudhami.formatting-controls",
  );
  assert.ok(extension);
  await extension.activate();
  assert.equal(vscode.workspace.workspaceFolders, undefined);
  const commands = await vscode.commands.getCommands();
  for (const command of [
    "open",
    "inspect",
    "dashboard",
    "welcome",
    "restore",
    "quickControls",
  ])
    assert.ok(commands.includes(`formattingControls.${command}`));
  const workflows = new Workflows(
    new MemoryStore(),
    new MemoryStore(),
    async () => true,
  );
  const dashboard = new Dashboard(
    extension.extensionUri,
    () => undefined,
    workflows,
  );
  const user = { target: vscode.ConfigurationTarget.Global };
  const original = own(user, "editor.formatOnSave");
  try {
    const state = await dashboard.snapshot();
    assert.equal(state.hasWorkspace, false);
    assert.deepEqual(state.scope, { target: "user" });
    assert.equal(state.recovery, null);
    await assert.rejects(
      write(
        { target: vscode.ConfigurationTarget.Workspace },
        "editor.formatOnSave",
        true,
      ),
      /Open a workspace/,
    );
    await write(user, "editor.formatOnSave", true);
    assert.equal(own(user, "editor.formatOnSave"), true);
    await workflows.save("Empty window preferences", user, { target: "user" });
    await write(user, "editor.formatOnSave", false);
    await workflows.apply("Empty window preferences", user, { target: "user" });
    assert.equal(own(user, "editor.formatOnSave"), true);
    await workflows.restore();
    assert.equal(own(user, "editor.formatOnSave"), false);
    const item = vscode.window.createStatusBarItem();
    try {
      const controls = new StatusControls(item, () => undefined);
      controls.refresh();
      const tooltip = (item.tooltip as vscode.MarkdownString).value;
      assert.ok(tooltip.includes("User"));
      assert.equal(item.command, "workbench.action.showHover");
      assert.doesNotMatch(
        tooltip,
        /href="command:formattingControls.statusControl\?/,
        "An empty window exposes no workspace Pause or formatting edits",
      );
      assert.equal(
        own(user, "editor.formatOnSave"),
        false,
        "Rendering the read-only card must preserve User settings",
      );
    } finally {
      item.dispose();
    }
    await dashboard.open();
    await dashboard.open(true);
    assert.equal((await dashboard.snapshot()).page, "welcome");
    console.log(
      "Empty-window assertions passed: activation, commands, User settings, profile recovery, workspace rejection and real dashboard.",
    );
  } finally {
    await write(user, "editor.formatOnSave", original);
    dashboard.dispose();
    workflows.dispose();
  }
}
