import assert from "node:assert/strict";
import * as vscode from "vscode";
import { own, write } from "../../src/configuration";
import { StatusControls } from "../../src/status-controls";
import { Workflows } from "../../src/workflows";
import { MemoryStore } from "./workflows";
export async function runStatusTests(uri: vscode.Uri): Promise<void> {
  let document: vscode.TextDocument | undefined =
    await vscode.workspace.openTextDocument(uri);
  const item = vscode.window.createStatusBarItem();
  const workflows = new Workflows(
    new MemoryStore(),
    new MemoryStore(),
    async () => true,
  );
  const controls = new StatusControls(item, () => document, workflows);
  const selection = { target: vscode.ConfigurationTarget.WorkspaceFolder, uri };
  const key = "editor.formatOnPaste";
  const original = own(selection, key);
  const language = { ...selection, language: document.languageId };
  const originalLanguage = own(language, key);
  const actions = own(selection, "editor.codeActionsOnSave");
  const originalSave = own(selection, "editor.formatOnSave");
  const originalType = own(selection, "editor.formatOnType");
  const originalFormatter = own(selection, "editor.defaultFormatter");
  const originalLanguageFormatter = own(language, "editor.defaultFormatter");
  const revision = () =>
    JSON.parse(
      decodeURIComponent(
        (item.tooltip as vscode.MarkdownString).value.match(
          /statusControl\?([^"]*)/,
        )?.[1] ?? "",
      ),
    )[0];
  try {
    await write(selection, key, false);
    await write(language, key, true);
    controls.refresh();
    assert.equal(item.command, "workbench.action.showHover");
    assert.deepEqual(
      (await vscode.commands.getCommands(true)).filter(
        (command) =>
          command.startsWith("kiraFormattingControls.prototype.") ||
          command.startsWith("formattingControls.core."),
      ),
      [],
      "The shipped extension must not register custom-editor bridge commands.",
    );
    const tooltip = item.tooltip as vscode.MarkdownString;
    assert.equal(tooltip.supportHtml, true);
    assert.equal(tooltip.supportThemeIcons, false);
    assert.deepEqual(tooltip.isTrusted, {
      enabledCommands: [
        "formattingControls.statusControl",
        "formattingControls.dashboard",
        "workbench.action.openSettings",
      ],
    });
    assert.match(tooltip.value, /Overridden by/);
    const stale = revision();
    controls.refresh();
    assert.equal(
      revision(),
      stale,
      "Equivalent refreshes must keep active links valid",
    );
    assert.equal(
      item.tooltip,
      tooltip,
      "Equivalent refreshes must not rebuild the hover",
    );
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
    for (const action of [
      -1,
      3,
      "0",
      "collapse",
      "editor.codeActionsOnSave",
      null,
      {},
    ])
      await assert.rejects(controls.control(revision(), action), /Unknown/);
    await controls.control(revision(), "pause");
    assert.equal(own(selection, "editor.formatOnSave"), false);
    assert.equal(own(selection, "editor.formatOnPaste"), false);
    assert.equal(own(selection, "editor.formatOnType"), false);
    assert.deepEqual(own(selection, "editor.codeActionsOnSave"), actions);
    assert.match((item.tooltip as vscode.MarkdownString).value, /Resume/);
    await controls.control(revision(), "pause");
    assert.equal(own(selection, "editor.formatOnPaste"), true);
    await write(
      language,
      "editor.defaultFormatter",
      "vscode.typescript-language-features",
    );
    controls.refresh();
    const inheritedFormatter = revision();
    await write(
      selection,
      "editor.defaultFormatter",
      "vscode.typescript-language-features",
    );
    controls.refresh();
    await assert.rejects(
      controls.control(inheritedFormatter, "formatter"),
      /changed/,
      "A same-effective-value edit must invalidate a pending formatter reset",
    );
    assert.equal(
      vscode.extensions.getExtension("rajudhami.formatting-controls")
        ?.packageJSON.contributes.views,
      undefined,
      "No docked view is contributed",
    );
    const previousDocument = revision();
    document = undefined;
    controls.refresh();
    await assert.rejects(controls.control(previousDocument, 0), /changed/);
    assert.match(
      (item.tooltip as vscode.MarkdownString).value,
      /No active file/,
    );
  } finally {
    await write(selection, key, original);
    await write(language, key, originalLanguage);
    await write(selection, "editor.formatOnSave", originalSave);
    await write(selection, "editor.formatOnType", originalType);
    await write(selection, "editor.defaultFormatter", originalFormatter);
    await write(language, "editor.defaultFormatter", originalLanguageFormatter);
    workflows.dispose();
    item.dispose();
  }
}
