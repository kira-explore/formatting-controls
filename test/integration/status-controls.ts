import assert from "node:assert/strict";
import * as vscode from "vscode";
import { own, write } from "../../src/configuration";
import { flags } from "../../src/model";
import { StatusControls } from "../../src/status-controls";
import { Workflows } from "../../src/workflows";
import { MemoryStore } from "./workflows";

class ControlledStore extends MemoryStore {
  block: Promise<void> | undefined;
  fail = false;
  entered: (() => void) | undefined;
  override async update(key: string, value: unknown): Promise<void> {
    if (this.fail) throw new Error("Test storage unavailable");
    this.entered?.();
    await this.block;
    await super.update(key, value);
  }
}
export async function runStatusTests(uri: vscode.Uri): Promise<void> {
  let document: vscode.TextDocument | undefined =
    await vscode.workspace.openTextDocument(uri);
  const item = vscode.window.createStatusBarItem();
  const workspaceStore = new ControlledStore();
  let confirmations = 0;
  const workflows = new Workflows(
    new MemoryStore(),
    workspaceStore,
    async () => {
      confirmations++;
      return true;
    },
  );
  let pausePrompts = 0;
  let acceptPause = true;
  let pendingChoice: Promise<boolean> | undefined;
  let promptOpened: (() => void) | undefined;
  const controls = new StatusControls(
    item,
    () => document,
    workflows,
    async () => {
      pausePrompts++;
      promptOpened?.();
      return pendingChoice ?? acceptPause;
    },
  );
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
    const beforeInfo = flags.map((flag) => own(selection, flag));
    const recoveryBeforeInfo = workflows.recovery();
    for (const revision of [stale, -1]) {
      await controls.control(revision, "info");
      assert.equal(item.tooltip, tooltip, "Info clicks never rebuild the card");
      assert.deepEqual(
        flags.map((flag) => own(selection, flag)),
        beforeInfo,
      );
      assert.deepEqual(own(selection, "editor.codeActionsOnSave"), actions);
      assert.deepEqual(workflows.recovery(), recoveryBeforeInfo);
    }
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
    await controls.control(stale, "info");
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
      "info-file",
      "info-formatting",
      "editor.codeActionsOnSave",
      null,
      {},
    ])
      await assert.rejects(controls.control(revision(), action), /Unknown/);
    const beforeCancel = flags.map((flag) => own(selection, flag));
    const journalBeforeCancel = workflows.journal();
    acceptPause = false;
    await controls.pause();
    acceptPause = true;
    assert.deepEqual(
      flags.map((flag) => own(selection, flag)),
      beforeCancel,
    );
    assert.deepEqual(workflows.journal(), journalBeforeCancel);
    assert.match((item.tooltip as vscode.MarkdownString).value, /alt="Pause"/);
    let choose!: (accept: boolean) => void;
    pendingChoice = new Promise((resolve) => {
      choose = resolve;
    });
    const opened = new Promise<void>((resolve) => {
      promptOpened = resolve;
    });
    const choosing = controls.pause();
    await opened;
    const beforeChoice = own(selection, key);
    await write(selection, key, !beforeChoice);
    controls.refresh();
    choose(true);
    await assert.rejects(
      choosing,
      /changed/,
      "Changes while the picker is open invalidate its action",
    );
    assert.equal(
      own(selection, key),
      !beforeChoice,
      "The later edit is preserved",
    );
    assert.deepEqual(workflows.journal(), journalBeforeCancel);
    pendingChoice = undefined;
    promptOpened = undefined;
    await write(selection, key, beforeChoice);
    controls.refresh();
    const beforeFailure = flags.map((flag) => own(selection, flag));
    workspaceStore.fail = true;
    await assert.rejects(
      controls.control(revision(), "pause"),
      /storage unavailable/,
    );
    workspaceStore.fail = false;
    assert.deepEqual(
      flags.map((flag) => own(selection, flag)),
      beforeFailure,
    );
    assert.equal(workflows.recovery(), null);
    assert.match((item.tooltip as vscode.MarkdownString).value, /alt="Pause"/);
    await dirtySettingsFailure("Pause");
    assert.equal(workflows.recovery(), null);
    await transition("Pause");
    assert.equal(own(selection, "editor.formatOnSave"), false);
    assert.equal(own(selection, "editor.formatOnPaste"), false);
    assert.equal(own(selection, "editor.formatOnType"), false);
    assert.deepEqual(own(selection, "editor.codeActionsOnSave"), actions);
    assert.match((item.tooltip as vscode.MarkdownString).value, /Resume/);
    await dirtySettingsFailure("Resume");
    assert.equal(workflows.recovery()?.kind, "pause");
    const recoveryBeforeFailure = workflows.recovery();
    workspaceStore.fail = true;
    await assert.rejects(
      controls.control(revision(), "pause"),
      /storage unavailable/,
    );
    workspaceStore.fail = false;
    assert.deepEqual(workflows.recovery(), recoveryBeforeFailure);
    assert.match((item.tooltip as vscode.MarkdownString).value, /alt="Resume"/);
    await transition("Resume");
    assert.equal(own(selection, "editor.formatOnPaste"), true);
    assert.equal(
      confirmations,
      0,
      "Status Pause/Resume uses its native picker, without a dashboard preview",
    );
    assert.ok(
      pausePrompts > 0,
      "Pause/Resume goes through the native confirmation picker",
    );
    for (const flag of flags) await write(selection, flag, false);
    controls.refresh();
    await controls.control(revision(), "pause");
    assert.equal(
      workflows.recovery()?.kind,
      "pause",
      "Already-disabled formatting still gets a durable pause",
    );
    assert.match((item.tooltip as vscode.MarkdownString).value, /alt="Resume"/);
    await controls.control(revision(), "pause");
    assert.equal(workflows.recovery(), null);
    assert.deepEqual(
      flags.map((flag) => own(selection, flag)),
      [false, false, false],
    );
    assert.match((item.tooltip as vscode.MarkdownString).value, /alt="Pause"/);
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
  async function dirtySettingsFailure(
    label: "Pause" | "Resume",
  ): Promise<void> {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    assert.ok(folder);
    const settings = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(folder.uri, ".vscode", "settings.json"),
    );
    const before = flags.map((flag) => own(selection, flag));
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      settings.uri,
      settings.positionAt(settings.getText().length),
      "\n ",
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.ok(settings.isDirty);
    const unsaved = settings.getText();
    try {
      await assert.rejects(
        controls.control(revision(), "pause"),
        /unsaved changes/,
        "A dirty settings file blocks both Pause and Resume",
      );
      assert.equal(settings.getText(), unsaved, "Unsaved edits are preserved");
      assert.ok(
        settings.isDirty,
        "The extension must not save the user's edits",
      );
      assert.deepEqual(
        flags.map((flag) => own(selection, flag)),
        before,
      );
      assert.match(
        (item.tooltip as vscode.MarkdownString).value,
        new RegExp(`alt="${label}"`),
      );
    } finally {
      // Only this disposable integration workspace is saved for the retry.
      assert.ok(await settings.save());
    }
  }
  async function transition(label: string): Promise<void> {
    let release!: () => void;
    workspaceStore.block = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      workspaceStore.entered = resolve;
    });
    const current = revision();
    const before = item.tooltip as vscode.MarkdownString;
    assert.match(before.value, new RegExp(`alt="${label}"`));
    const running = controls.control(current, "pause");
    await entered;
    const busy = item.tooltip;
    const snapshots: (typeof busy)[] = [];
    const observe = () => {
      controls.refresh();
      snapshots.push(item.tooltip);
    };
    const changes = [
      workflows.onDidChange(observe),
      vscode.workspace.onDidChangeConfiguration(observe),
    ];
    try {
      assert.equal(
        busy,
        undefined,
        "The card is closed while the chosen action applies",
      );
      await controls.control(current, "pause");
      await controls.control(current, "info");
      controls.refresh();
      assert.equal(
        item.tooltip,
        busy,
        "Intermediate events cannot reopen the dismissed card",
      );
    } finally {
      workspaceStore.block = undefined;
      workspaceStore.entered = undefined;
      release();
    }
    try {
      await running;
      assert.ok(
        snapshots.length,
        "The batch emitted recovery/configuration changes",
      );
      assert.ok(
        snapshots.every((tooltip) => tooltip === busy),
        "Intermediate batch writes must not replace the busy card",
      );
      assert.notEqual(
        item.tooltip,
        busy,
        "The completed batch refreshes the card",
      );
    } finally {
      for (const change of changes) change.dispose();
    }
  }
}
