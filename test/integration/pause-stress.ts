import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { configuration, own, write } from "../../src/configuration";
import { flags } from "../../src/model";
import { StatusControls } from "../../src/status-controls";
import { Workflows } from "../../src/workflows";
import { MemoryStore } from "./workflows";

export async function run(): Promise<void> {
  await vscode.extensions
    .getExtension("rajudhami.formatting-controls")
    ?.activate();
  if (process.env.FORMATTING_CONTROLS_STRESS_BIOME) {
    const biome = vscode.extensions.getExtension("biomejs.biome");
    assert.ok(biome, "The requested Biome stress extension must be loaded");
    await biome.activate();
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder);
  const settingsUri = vscode.Uri.joinPath(
    folder.uri,
    ".vscode",
    "settings.json",
  );
  const document = await vscode.workspace.openTextDocument(settingsUri);
  await vscode.window.showTextDocument(document);
  const selection = {
    target: vscode.ConfigurationTarget.WorkspaceFolder,
    uri: settingsUri,
  };
  const workspaceStore = new MemoryStore();
  const workflows = new Workflows(
    new MemoryStore(),
    workspaceStore,
    async () => true,
  );
  const item = vscode.window.createStatusBarItem();
  const controls = new StatusControls(
    item,
    () => document,
    workflows,
    async () => true,
  );
  const report =
    process.env.FORMATTING_CONTROLS_STRESS_REPORT ??
    "test-results/pause-stress";
  mkdirSync(report, { recursive: true });
  const trace: object[] = [];
  let cycle = -1,
    action = "setup";
  const parse = (text: string) => {
    try {
      const value = JSON.parse(text);
      return flags.map((key) => value[key]);
    } catch {
      return "parse pending";
    }
  };
  const snapshot = (event: string) => {
    const point = {
      event,
      cycle,
      action,
      time: Date.now(),
      dirty: document.isDirty,
      version: document.version,
      owned: flags.map((key) => own(selection, key)),
      effective: flags.map((key) =>
        configuration({ ...selection, language: document.languageId }).get(key),
      ),
      buffer: parse(document.getText()),
      disk: parse(readFileSync(settingsUri.fsPath, "utf8")),
      journal: workflows.journal(),
    };
    trace.push(point);
    return point;
  };
  const listeners = [
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === document) snapshot("document changed");
    }),
    vscode.workspace.onDidSaveTextDocument((d) => {
      if (d === document) snapshot("document saved");
    }),
    vscode.workspace.onWillSaveTextDocument((e) => {
      if (e.document === document) snapshot("document saving");
    }),
    vscode.workspace.onDidChangeConfiguration(() => {
      snapshot("configuration changed");
      controls.refresh();
    }),
    workflows.onDidChange(() => {
      snapshot("journal changed");
      controls.refresh();
    }),
  ];
  try {
    const initial = snapshot("initial");
    assert.deepEqual(initial.effective, [true, true, true]);
    assert.deepEqual(initial.owned, [undefined, undefined, undefined]);
    controls.refresh();
    for (cycle = 0; cycle < 50; cycle++) {
      action = "pause";
      snapshot("before action");
      await controls.pause();
      const paused = snapshot("after action");
      assert.deepEqual(
        paused.effective,
        [false, false, false],
        `Pause cycle ${cycle}`,
      );
      assert.deepEqual(
        paused.disk,
        [false, false, false],
        `Unsaved pause in cycle ${cycle}`,
      );
      assert.equal(
        document.isDirty,
        false,
        `Pause left settings dirty in cycle ${cycle}`,
      );
      action = "resume";
      await controls.pause();
      const restored = snapshot("after action");
      assert.deepEqual(
        restored.owned,
        initial.owned,
        `Owned values drift in cycle ${cycle}`,
      );
      assert.deepEqual(
        restored.effective,
        initial.effective,
        `Effective values drift in cycle ${cycle}`,
      );
      assert.deepEqual(
        restored.disk,
        initial.disk,
        `Saved values drift in cycle ${cycle}`,
      );
      assert.equal(
        document.isDirty,
        false,
        `Resume left settings dirty in cycle ${cycle}`,
      );
      assert.equal(workflows.recovery(), null);
      await new Promise((resolve) =>
        setTimeout(resolve, cycle % 3 === 0 ? 150 : 5),
      );
      assert.deepEqual(
        snapshot("after settling").effective,
        initial.effective,
        `Delayed drift in cycle ${cycle}`,
      );
    }
    action = "interrupted resume";
    await controls.pause();
    await write(selection, "editor.formatOnType", undefined);
    await write(selection, "editor.formatOnPaste", undefined);
    const interrupted = workflows.journal();
    assert.ok(interrupted);
    await workspaceStore.update("formattingControls.recovery.v1", {
      ...interrupted,
      phase: "restoring",
    });
    controls.refresh();
    assert.deepEqual(snapshot("partial restore").owned, [
      false,
      undefined,
      undefined,
    ]);
    await controls.pause();
    const recovered = snapshot("partial restore completed");
    assert.deepEqual(recovered.owned, initial.owned);
    assert.deepEqual(recovered.effective, initial.effective);
    assert.deepEqual(recovered.disk, initial.disk);
    assert.equal(document.isDirty, false);
    assert.equal(workflows.recovery(), null);
    console.log(
      "Single-folder all-enabled Pause/Resume: 50 cycles and interrupted restore passed",
    );
  } finally {
    writeFileSync(join(report, "trace.json"), JSON.stringify(trace, null, 2));
    for (const listener of listeners) listener.dispose();
    workflows.dispose();
    item.dispose();
  }
}
