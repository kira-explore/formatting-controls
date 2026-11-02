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
  // Simulate editing and saving settings.json, rather than using our writer.
  const manualSave = async (values: Array<boolean | undefined>) => {
    const settings = JSON.parse(document.getText());
    for (const [index, key] of flags.entries()) {
      if (values[index] === undefined) delete settings[key];
      else settings[key] = values[index];
    }
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      settingsUri,
      new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      ),
      JSON.stringify(settings, null, 2),
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
    // Biome can cancel a manual save too. Model the user saving again before
    // clicking Pause/Resume; never continue with an unsaved fixture edit.
    for (let attempt = 0; ; attempt++) {
      if (await document.save()) break;
      assert.ok(attempt < 4, "Manual fixture save must complete");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (process.env.FORMATTING_CONTROLS_EXHAUSTIVE === "1") {
      // The exhaustive state matrix starts only after the host acknowledges a
      // manual save. A native no-op reloads that cache even if a watcher event
      // was missed. Assert it does not alter any text/version/disk contents.
      const savedText = document.getText(),
        savedVersion = document.version;
      assert.equal(readFileSync(settingsUri.fsPath, "utf8"), savedText);
      await configuration(selection).update(
        flags[0],
        values[0],
        selection.target,
      );
      assert.equal(document.version, savedVersion);
      assert.equal(document.getText(), savedText);
      assert.equal(readFileSync(settingsUri.fsPath, "utf8"), savedText);
    }
    for (let attempt = 0; ; attempt++) {
      if (flags.every((key, index) => own(selection, key) === values[index]))
        break;
      assert.ok(attempt < 100, "Manual save must refresh configuration");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(document.isDirty, false);
    controls.refresh();
  };
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
    for (let mask = 0; mask < 8; mask++) {
      const expected = flags.map((_, bit) => Boolean(mask & (1 << bit)));
      action = `seed combination ${mask}`;
      await manualSave(expected);
      const baseline = snapshot("combination baseline");
      assert.deepEqual(baseline.effective, expected);
      for (cycle = 0; cycle < 10; cycle++) {
        action = `pause combination ${mask}`;
        await controls.pause();
        const paused = snapshot("combination paused");
        assert.deepEqual(paused.effective, [false, false, false], action);
        assert.deepEqual(paused.disk, [false, false, false], action);
        assert.equal(document.isDirty, false, action);
        action = `resume combination ${mask}`;
        await controls.pause();
        const restored = snapshot("combination restored");
        assert.deepEqual(restored.owned, expected, action);
        assert.deepEqual(restored.effective, expected, action);
        assert.deepEqual(restored.disk, expected, action);
        assert.equal(document.isDirty, false, action);
        assert.equal(workflows.recovery(), null, action);
      }
    }
    for (let mask = 0; mask < 8; mask++) {
      action = `manual edit during inherited pause ${mask}`;
      await manualSave([undefined, undefined, undefined]);
      await controls.pause();
      const edited = flags.map((_, bit) => Boolean(mask & (1 << bit)));
      await manualSave(edited);
      await controls.pause();
      const manualRestored = snapshot("manual edit preserved on resume");
      // True values differ from the pause's false values, so keep them.
      // Unchanged false values still restore the original inherited settings.
      const expected = edited.map((value) => (value ? true : undefined));
      assert.deepEqual(manualRestored.owned, expected, action);
      assert.deepEqual(manualRestored.effective, [true, true, true], action);
      assert.deepEqual(manualRestored.disk, expected, action);
      assert.equal(
        workflows.recovery(),
        null,
        "A successful Resume must finish the pause after preserving manual edits",
      );
      await controls.pause();
      assert.deepEqual(snapshot("new pause after manual edit").effective, [
        false,
        false,
        false,
      ]);
      await controls.pause();
      assert.deepEqual(snapshot("fresh baseline restored").owned, expected);
      assert.equal(workflows.recovery(), null);
    }
    action = "resume an already saved conflict record";
    await manualSave([undefined, undefined, undefined]);
    await controls.pause();
    const legacy = workflows.journal();
    assert.ok(legacy);
    await manualSave([true, undefined, undefined]);
    await workspaceStore.update("formattingControls.recovery.v1", {
      ...legacy,
      phase: "conflicts",
      changes: legacy.changes.filter((change) => change.key === flags[0]),
    });
    const reloaded = new Workflows(new MemoryStore(), workspaceStore);
    try {
      await reloaded.resumePause();
      assert.equal(reloaded.recovery(), null);
      assert.deepEqual(
        flags.map((key) => own(selection, key)),
        [true, undefined, undefined],
      );
    } finally {
      reloaded.dispose();
    }
    controls.refresh();
    await controls.pause();
    assert.deepEqual(snapshot("new pause after legacy conflict").effective, [
      false,
      false,
      false,
    ]);
    await controls.pause();
    assert.deepEqual(
      snapshot("legacy conflict fresh baseline restored").owned,
      [true, undefined, undefined],
    );
    assert.equal(workflows.recovery(), null);
    if (process.env.FORMATTING_CONTROLS_EXHAUSTIVE === "1") {
      const combinations = Array.from({ length: 8 }, (_, mask) =>
        flags.map((_, bit) => Boolean(mask & (1 << bit))),
      );
      let cases = 0;
      for (const baseline of combinations) {
        for (const intermediate of combinations) {
          for (const final of combinations) {
            action = `resumed edits ${baseline} -> ${intermediate} -> ${final}`;
            await manualSave(baseline);
            await manualSave(intermediate);
            await manualSave(final);
            assert.equal(workflows.recovery(), null, action);
            await controls.pause();
            assert.deepEqual(
              snapshot("exhaustive paused").effective,
              [false, false, false],
              action,
            );
            assert.equal(workflows.recovery()?.kind, "pause", action);
            await controls.pause();
            const normal = snapshot("exhaustive resumed edits restored");
            assert.deepEqual(normal.owned, final, action);
            assert.deepEqual(normal.disk, final, action);
            assert.equal(workflows.recovery(), null, action);

            action = `paused edits ${baseline} -> ${intermediate} -> ${final}`;
            await manualSave(baseline);
            await controls.pause();
            await manualSave(intermediate);
            await manualSave(final);
            assert.equal(workflows.recovery()?.kind, "pause", action);
            await controls.pause();
            // Final true is a newer preference; final false matches Pause and
            // restores the pre-pause value, regardless of intermediate edits.
            const expected = baseline.map(
              (value, index) => value || final[index],
            );
            const resumed = snapshot("exhaustive paused edits restored");
            assert.deepEqual(resumed.owned, expected, action);
            assert.deepEqual(resumed.effective, expected, action);
            assert.deepEqual(resumed.disk, expected, action);
            assert.equal(document.isDirty, false, action);
            assert.equal(workflows.recovery(), null, action);
            await controls.pause();
            assert.deepEqual(
              snapshot("exhaustive fresh pause").effective,
              [false, false, false],
              action,
            );
            await controls.pause();
            assert.deepEqual(
              snapshot("exhaustive fresh resume").owned,
              expected,
              action,
            );
            assert.equal(workflows.recovery(), null, action);
            cases++;
            if (cases % 8 === 0)
              console.log(`Exhaustive progress: ${cases * 2}/1024`);
          }
        }
        console.log(
          `Exhaustive saved-edit sequences passed: ${cases * 2}/1024`,
        );
      }
    }
    console.log(
      "Single-folder Pause/Resume: 50 inherited cycles, interrupted restore, all 8 explicit combinations × 10 cycles and all 8 saved edits during pause with fresh cycles passed",
    );
  } finally {
    writeFileSync(join(report, "trace.json"), JSON.stringify(trace, null, 2));
    for (const listener of listeners) listener.dispose();
    workflows.dispose();
    item.dispose();
  }
}
