import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import * as vscode from "vscode";
import {
  type CoreState,
  coreCommands,
  isCoreState,
} from "../../shared/core-controls";
import { own, write } from "../../src/configuration";

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension(
    "rajudhami.formatting-controls",
  );
  assert.ok(extension);
  await extension.activate();
  const theme = process.env.FORMATTING_CORE_THEME ?? "Dark Modern";
  await vscode.workspace
    .getConfiguration("workbench")
    .update("colorTheme", theme, vscode.ConfigurationTarget.Global);
  const expectedTheme =
    theme === "Light Modern"
      ? vscode.ColorThemeKind.Light
      : theme === "Default High Contrast"
        ? vscode.ColorThemeKind.HighContrast
        : vscode.ColorThemeKind.Dark;
  const themeDeadline = Date.now() + 10000;
  while (vscode.window.activeColorTheme.kind !== expectedTheme) {
    if (Date.now() > themeDeadline)
      throw new Error(`Editor did not apply theme ${theme}.`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(
    (await vscode.commands.getCommands(true)).includes(coreCommands.connect),
    "This test must run in the patched editor, not ordinary VS Code.",
  );
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder);
  const uri = vscode.Uri.joinPath(folder.uri, "app.ts");
  const document = await vscode.languages.setTextDocumentLanguage(
    await vscode.workspace.openTextDocument(uri),
    "typescript",
  );
  await vscode.window.showTextDocument(document);
  const workspace = { target: vscode.ConfigurationTarget.Workspace, uri };
  const user = { target: vscode.ConfigurationTarget.Global, uri };
  await write(workspace, "editor.formatOnSave", true);
  await write(workspace, "editor.formatOnPaste", false);
  await write(user, "editor.formatOnType", true);
  await write(workspace, "editor.codeActionsOnSave", {
    "source.fixAll": "explicit",
  });
  await write(
    workspace,
    "editor.defaultFormatter",
    "vscode.typescript-language-features",
  );
  let state = await vscode.commands.executeCommand<CoreState>(
    coreCommands.snapshot,
  );
  assert.ok(isCoreState(state));
  state = await vscode.commands.executeCommand<CoreState>(coreCommands.action, {
    session: state.session,
    revision: state.revision,
    type: "scope",
    value: "workspace",
  });
  assert.ok(isCoreState(state));
  const stale = state;
  state = await vscode.commands.executeCommand<CoreState>(coreCommands.action, {
    session: state.session,
    revision: state.revision,
    type: "flag",
    key: "editor.formatOnPaste",
    value: true,
  });
  assert.ok(isCoreState(state));
  await assert.rejects(
    async () =>
      vscode.commands.executeCommand(coreCommands.action, {
        session: stale.session,
        revision: stale.revision,
        type: "flag",
        key: "editor.formatOnSave",
        value: false,
      }),
    /changed/,
  );
  await assert.rejects(
    async () =>
      vscode.commands.executeCommand(coreCommands.action, {
        session: "wrong-session",
        revision: state.revision,
        type: "pause",
      }),
    /changed/,
  );
  await assert.rejects(
    async () =>
      vscode.commands.executeCommand(coreCommands.action, {
        session: state.session,
        revision: state.revision,
        type: "scope",
        value: "outside-workspace",
      }),
    /unavailable/,
  );
  await assert.rejects(
    async () =>
      vscode.commands.executeCommand(coreCommands.action, {
        session: state.session,
        revision: state.revision,
        type: "formatter",
        value: "unknown.provider",
      }),
    /unavailable/,
  );
  assert.deepEqual(own(workspace, "editor.codeActionsOnSave"), {
    "source.fixAll": "explicit",
  });
  await write(workspace, "editor.formatOnPaste", false);
  await vscode.commands.executeCommand(coreCommands.connect);
  await vscode.commands.executeCommand("workbench.action.closeSidebar");
  await vscode.commands.executeCommand("workbench.action.closePanel");
  const ready = process.env.FORMATTING_CORE_READY;
  const done = process.env.FORMATTING_CORE_DONE;
  assert.ok(ready && done);
  writeFileSync(ready, "ready");
  const deadline = Date.now() + 180000;
  while (!existsSync(done)) {
    if (Date.now() > deadline) throw new Error("Core card UI tests timed out.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.deepEqual(
    own(workspace, "editor.codeActionsOnSave"),
    { "source.fixAll": "explicit" },
    "Popover actions must preserve save actions.",
  );
  console.log(
    "Core prototype host assertions passed: real bridge, scoped writes, stale sessions/revisions, formatter allowlisting and save-action preservation.",
  );
}
