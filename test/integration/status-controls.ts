import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
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
  const workbench = vscode.workspace.getConfiguration("workbench");
  const originalMotion = workbench.inspect("reduceMotion")?.globalValue;
  const formattingHeight = () =>
    Number(
      (item.tooltip as vscode.MarkdownString).value.match(
        /height="(\d+)" alt="(?:Format on save|Default formatter):/,
      )?.[1],
    );
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
    for (const action of [-1, 3, "0", "editor.codeActionsOnSave", null, {}])
      await assert.rejects(controls.control(revision(), action), /Unknown/);
    await controls.control(revision(), "collapse");
    assert.ok(
      !(item.tooltip as vscode.MarkdownString).value.includes("Format on save"),
    );
    await controls.control(revision(), "collapse");
    await workbench.update(
      "reduceMotion",
      "off",
      vscode.ConfigurationTarget.Global,
    );
    const collapsing = controls.control(revision(), "collapse");
    await delay(45);
    assert.ok(
      formattingHeight() > 54 && formattingHeight() < 192,
      "Disclosure clips through intermediate heights",
    );
    const duringMotion = revision();
    await controls.control(duringMotion, "collapse");
    await collapsing;
    assert.equal(formattingHeight(), 192, "Rapid reversal finishes expanded");
    const afterMotion = revision();
    await delay(40);
    assert.equal(
      revision(),
      afterMotion,
      "Cancelled frames cannot change the final revision",
    );
    await workbench.update(
      "reduceMotion",
      "on",
      vscode.ConfigurationTarget.Global,
    );
    const reduced = controls.control(revision(), "collapse");
    assert.equal(
      formattingHeight(),
      54,
      "Reduce Motion skips intermediate frames",
    );
    await reduced;
    await controls.control(revision(), "collapse");
    await workbench.update(
      "reduceMotion",
      originalMotion,
      vscode.ConfigurationTarget.Global,
    );
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
    controls.dispose();
    await workbench.update(
      "reduceMotion",
      originalMotion,
      vscode.ConfigurationTarget.Global,
    );
    await write(selection, key, original);
    await write(language, key, originalLanguage);
    await write(selection, "editor.formatOnSave", originalSave);
    await write(selection, "editor.formatOnType", originalType);
    await write(selection, "editor.defaultFormatter", originalFormatter);
    await write(language, "editor.defaultFormatter", originalLanguageFormatter);
    workflows.dispose();
    item.dispose();
  }
  const disposableItem = vscode.window.createStatusBarItem();
  const disposableControls = new StatusControls(disposableItem, () => document);
  try {
    disposableControls.refresh();
    const current = JSON.parse(
      decodeURIComponent(
        (disposableItem.tooltip as vscode.MarkdownString).value.match(
          /statusControl\?([^"]*)/,
        )?.[1] ?? "",
      ),
    )[0];
    const closing = disposableControls.control(current, "collapse");
    disposableControls.dispose();
    const finalTooltip = disposableItem.tooltip;
    await closing;
    disposableControls.refresh();
    assert.equal(
      disposableItem.tooltip,
      finalTooltip,
      "Disposal cancels pending animation updates",
    );
  } finally {
    disposableControls.dispose();
    disposableItem.dispose();
  }
}
