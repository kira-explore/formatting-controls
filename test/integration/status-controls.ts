import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  assertSettingsSaved,
  own,
  UnsavedSettingsError,
  write,
} from "../../src/configuration";
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
      "info",
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
    const beforeLanguagePause = flags.map((flag) => own(language, flag));
    try {
      for (const flag of flags) await write(language, flag, true);
      controls.refresh();
      await controls.control(revision(), "pause");
      assert.deepEqual(
        flags.map((flag) => own(selection, flag)),
        [false, false, false],
        "Pause writes the selected folder's all-language settings",
      );
      assert.equal(
        item.text,
        "Formatting: ON",
        "Language overrides still determine the active editor's effective state",
      );
      assert.match(
        (item.tooltip as vscode.MarkdownString).value,
        /alt="Automatic formatting: Enabled"/,
      );
      assert.match(
        (item.tooltip as vscode.MarkdownString).value,
        /alt="Resume"/,
      );
      assert.match(
        (item.tooltip as vscode.MarkdownString).value,
        /Overridden by/,
      );
      await controls.control(revision(), "pause");
      assert.equal(workflows.recovery(), null);
      assert.match(
        (item.tooltip as vscode.MarkdownString).value,
        /alt="Pause"/,
      );
      assert.deepEqual(
        flags.map((flag) => own(language, flag)),
        [true, true, true],
        "Resume clears its record without altering language overrides",
      );
    } finally {
      for (const [i, flag] of flags.entries())
        await write(language, flag, beforeLanguagePause[i]);
      controls.refresh();
    }
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
    const editorBeforeCycles = document;
    const cycleFolder = vscode.workspace.getWorkspaceFolder(uri);
    assert.ok(cycleFolder);
    const settingsForCycles = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(cycleFolder.uri, ".vscode", "settings.json"),
    );
    const cycleEvents: object[] = [];
    const cycleListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === settingsForCycles)
        cycleEvents.push({
          event: "change",
          dirty: event.document.isDirty,
          version: event.document.version,
          time: Date.now(),
        });
    });
    try {
      await vscode.window.showTextDocument(settingsForCycles);
      document = settingsForCycles;
      await write(selection, "editor.formatOnSave", true);
      // A native save (including a formatter/save participant) may still be
      // finishing when the user chooses the next Pause/Resume action.
      for (const action of ["Pause", "Resume"]) {
        let releaseSave!: () => void;
        const saveGate = new Promise<vscode.TextEdit[]>((resolve) => {
          releaseSave = () => resolve([]);
        });
        let saveEntered!: () => void;
        const enteredSave = new Promise<void>((resolve) => {
          saveEntered = resolve;
        });
        const saveListener = vscode.workspace.onWillSaveTextDocument(
          (event) => {
            if (event.document === settingsForCycles) {
              event.waitUntil(saveGate);
              saveEntered();
            }
          },
        );
        const formattingEdit = new vscode.WorkspaceEdit();
        formattingEdit.insert(
          settingsForCycles.uri,
          settingsForCycles.positionAt(settingsForCycles.getText().length),
          "\n ",
        );
        assert.ok(await vscode.workspace.applyEdit(formattingEdit));
        const recoveryBeforeSave = structuredClone(workflows.journal());
        const saving = settingsForCycles.save(); // Disposable fixture only.
        try {
          await enteredSave;
          controls.refresh();
          const duringSave = controls.pause().then(
            () => null,
            (error: unknown) => error,
          );
          await new Promise((resolve) => setTimeout(resolve, 50));
          assert.deepEqual(
            workflows.journal(),
            recoveryBeforeSave,
            `${action} must not modify its restore point while the file is saving`,
          );
          releaseSave();
          assert.ok(await saving);
          assert.equal(
            await duringSave,
            null,
            `An in-progress save should finish before ${action} checks for unsaved edits`,
          );
        } finally {
          releaseSave();
          saveListener.dispose();
          await saving;
        }
      }
      assert.equal(workflows.recovery(), null);
      const values = [true, false, undefined];
      for (let cycle = 0; cycle < 12; cycle++) {
        for (const [index, flag] of flags.entries())
          await write(selection, flag, values[(cycle + index) % values.length]);
        const previous = flags.map((flag) => own(selection, flag));
        controls.refresh();
        await controls.pause();
        assert.equal(settingsForCycles.isDirty, false, `Pause cycle ${cycle}`);
        assert.deepEqual(
          flags.map((flag) => own(selection, flag)),
          [false, false, false],
        );
        await controls.pause();
        assert.equal(settingsForCycles.isDirty, false, `Resume cycle ${cycle}`);
        assert.deepEqual(
          flags.map((flag) => own(selection, flag)),
          previous,
        );
        assert.equal(workflows.recovery(), null);
      }
    } catch (error) {
      console.error("Pause/resume settings-document audit", cycleEvents);
      throw error;
    } finally {
      cycleListener.dispose();
      document = editorBeforeCycles;
      if (document) await vscode.window.showTextDocument(document);
      controls.refresh();
    }
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
    const recovery = structuredClone(workflows.journal());
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
      assert.doesNotThrow(() =>
        assertSettingsSaved({
          target: vscode.ConfigurationTarget.Workspace,
          uri,
        }),
      );
      await assert.rejects(
        controls.control(revision(), "pause"),
        (error: unknown) =>
          error instanceof UnsavedSettingsError &&
          error.uri.toString() === settings.uri.toString(),
        "A dirty settings file blocks both Pause and Resume",
      );
      assert.deepEqual(
        workflows.journal(),
        recovery,
        "Preflight must preserve the recovery record and its phase",
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
