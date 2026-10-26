import assert from "node:assert/strict";
import * as vscode from "vscode";
import { own, write } from "../../src/configuration";
import { StatusControls } from "../../src/status-controls";
export async function runStatusTests(uri: vscode.Uri): Promise<void> {
  let document: vscode.TextDocument | undefined =
    await vscode.workspace.openTextDocument(uri);
  const item = vscode.window.createStatusBarItem();
  const controls = new StatusControls(item, () => document);
  const selection = { target: vscode.ConfigurationTarget.WorkspaceFolder, uri };
  const key = "editor.formatOnPaste";
  const original = own(selection, key);
  const language = { ...selection, language: document.languageId };
  const originalLanguage = own(language, key);
  const actions = own(selection, "editor.codeActionsOnSave");
  const revision = () =>
    JSON.parse(
      decodeURIComponent(
        (item.tooltip as vscode.MarkdownString).value.match(
          /statusControl\?([^)]*)/,
        )?.[1] ?? "",
      ),
    )[0];
  try {
    await write(selection, key, false);
    await write(language, key, true);
    controls.refresh();
    assert.equal(item.command, "workbench.action.showHover");
    const tooltip = item.tooltip as vscode.MarkdownString;
    assert.equal(tooltip.supportHtml, false);
    assert.deepEqual(tooltip.isTrusted, {
      enabledCommands: [
        "formattingControls.statusControl",
        "formattingControls.dashboard",
        "workbench.action.openSettings",
      ],
    });
    assert.match(tooltip.value, /Effective On/);
    const stale = revision();
    const pending = controls.control(stale, 1);
    await assert.rejects(controls.control(stale, 1), /Finish|changed/);
    await pending;
    assert.equal(
      own(selection, key),
      true,
      "Edit the owned folder value even when a language override wins",
    );
    assert.equal(own(language, key), true);
    assert.deepEqual(own(selection, "editor.codeActionsOnSave"), actions);
    await assert.rejects(controls.control(stale, 1), /changed/);
    for (const action of [-1, 3, "0", "editor.codeActionsOnSave", null, {}])
      await assert.rejects(controls.control(revision(), action), /Unknown/);
    const previousDocument = revision();
    document = undefined;
    controls.refresh();
    await assert.rejects(controls.control(previousDocument, 0), /changed/);
    assert.match(
      (item.tooltip as vscode.MarkdownString).value,
      /No active editor/,
    );
  } finally {
    await write(selection, key, original);
    await write(language, key, originalLanguage);
    item.dispose();
  }
}
