import assert from "node:assert/strict";
import * as vscode from "vscode";
import { settingKeys } from "../../shared/protocol";
import type { Change } from "../../shared/workflows";
import { configuration, own, write } from "../../src/configuration";
import { Dashboard } from "../../src/dashboard";
import { providersFor } from "../../src/providers";
import { type Store, Workflows } from "../../src/workflows";
export class MemoryStore implements Store {
  readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return structuredClone(this.values.get(key)) as T | undefined;
  }
  async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) this.values.delete(key);
    else this.values.set(key, structuredClone(value));
  }
}
const runMultiLanguageProfileTest = async (uri: vscode.Uri): Promise<void> => {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  assert.ok(folder);
  const selection = { target: vscode.ConfigurationTarget.WorkspaceFolder, uri };
  const scope = { target: "folder" as const, folder: folder.uri.toString() };
  const html = { ...selection, language: "html" };
  const css = { ...selection, language: "css" };
  const file = vscode.Uri.joinPath(
    folder.uri,
    "test-multi-language-profile.json",
  );
  const key = "editor.formatOnSave";
  const userHtml = {
    target: vscode.ConfigurationTarget.Global,
    language: "html",
  };
  const flags = [key, "editor.formatOnPaste", "editor.formatOnType"] as const;
  const originalUserHtml = flags.map((flag) => own(userHtml, flag));
  const originals = [selection, html, css].map((s) => own(s, key));
  const profile = {
    version: 1,
    name: "Web formatting",
    settings: {
      [key]: false,
      "[html]": { [key]: true },
      "[css]": { [key]: false },
    },
  };
  const global = new MemoryStore();
  const workspace = new MemoryStore();
  const previews: Change[][] = [];
  const workflows = new Workflows(
    global,
    workspace,
    async (_, changes) => {
      previews.push([...changes]);
      return true;
    },
    { open: async () => file, save: async () => file },
  );
  const reopened = new Workflows(global, workspace, async () => true);
  try {
    await write(selection, key, true);
    await write(html, key, undefined);
    await write(css, key, true);
    await vscode.workspace.fs.writeFile(
      file,
      new TextEncoder().encode(JSON.stringify(profile)),
    );
    await workflows.import(scope);
    assert.deepEqual(
      [own(selection, key), own(html, key), own(css, key)],
      [true, undefined, true],
    );
    await workflows.export(profile.name, selection, scope);
    assert.deepEqual(
      JSON.parse(
        new TextDecoder().decode(await vscode.workspace.fs.readFile(file)),
      ),
      profile,
    );
    await assert.rejects(
      workflows.apply(profile.name, html, { ...scope, language: "html" }),
      /Select All languages/,
    );
    await workflows.apply(profile.name, selection, scope);
    assert.equal(previews.length, 1);
    assert.deepEqual(
      previews[0]?.map(({ language }) => language),
      [undefined, "html", "css"],
    );
    assert.deepEqual(
      [own(selection, key), own(html, key), own(css, key)],
      [false, true, false],
    );
    await write(userHtml, key, true);
    await workflows.apply("Manual Formatting", userHtml, {
      target: "user",
      language: "html",
    });
    const points = reopened.restorePoints();
    assert.deepEqual(
      points.map((point) => point.scope.target),
      ["user", "folder"],
    );
    await write(css, key, undefined);
    await reopened.restore(
      points.find((point) => point.scope.target === "folder")?.id,
    );
    assert.equal(own(userHtml, key), false);
    await reopened.restore(
      points.find((point) => point.scope.target === "user")?.id,
    );
    assert.equal(own(userHtml, key), true);
    assert.deepEqual(
      [own(selection, key), own(html, key), own(css, key)],
      [true, undefined, undefined],
    );
  } finally {
    workflows.dispose();
    reopened.dispose();
    for (const [index, flag] of flags.entries()) {
      await write(userHtml, flag, originalUserHtml[index]);
    }
    for (const [index, s] of [selection, html, css].entries()) {
      await write(s, key, originals[index]);
    }
    await vscode.workspace.fs.delete(file).then(undefined, () => {});
  }
};

export const runWorkflowTests = async (
  extensionUri: vscode.Uri,
  uri: vscode.Uri,
): Promise<void> => {
  await runMultiLanguageProfileTest(uri);
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  assert.ok(folder);
  const selection = {
    target: vscode.ConfigurationTarget.WorkspaceFolder,
    uri,
    language: "typescriptreact",
  };
  const scope = {
    target: "folder" as const,
    folder: folder.uri.toString(),
    language: "typescriptreact",
  };
  const exported = vscode.Uri.joinPath(
    folder.uri,
    "formatting-controls-test-profile.json",
  );
  const originals = settingKeys
    .filter((key) => !key.startsWith("files."))
    .map((key) => ({
      key,
      value: own(selection, key),
    }));
  const global = new MemoryStore(),
    workspace = new MemoryStore();
  const previews: Change[][] = [];
  const workflows = new Workflows(global, workspace, async (title, changes) => {
    if (title.startsWith("Restore")) previews.push([...changes]);
    return true;
  });
  try {
    await write(selection, "editor.formatOnSave", true);
    await write(selection, "editor.codeActionsOnSave", {
      "source.fixAll.biome": "explicit",
      "source.organizeImports": "always",
    });
    await assert.rejects(
      workflows.save("Wrong scope", selection, {
        target: "workspace",
        language: "typescriptreact",
      }),
      /scope changed/,
    );
    const actionsBeforePause = structuredClone(
      own(selection, "editor.codeActionsOnSave"),
    );
    await workflows.pauseFormatting(selection, scope);
    assert.equal(own(selection, "editor.formatOnSave"), false);
    assert.equal(own(selection, "editor.formatOnPaste"), false);
    assert.equal(own(selection, "editor.formatOnType"), false);
    assert.deepEqual(
      own(selection, "editor.codeActionsOnSave"),
      actionsBeforePause,
      "Formatting-only pause must preserve all save actions",
    );
    await write(selection, "editor.formatOnType", true);
    await workflows.restore();
    assert.equal(own(selection, "editor.formatOnSave"), true);
    assert.equal(
      own(selection, "editor.formatOnType"),
      true,
      "Resume preserves newer edits",
    );
    assert.deepEqual(
      own(selection, "editor.codeActionsOnSave"),
      actionsBeforePause,
    );
    await workflows.discard();
    previews.length = 0;
    await write(
      selection,
      "editor.formatOnType",
      originals.find((entry) => entry.key === "editor.formatOnType")?.value,
    );
    await workflows.save("TSX Project", selection, scope);
    assert.ok(
      workflows
        .summaries(selection, scope)
        .some((p) => p.name === "TSX Project" && !p.builtin),
    );
    const exportedWorkflows = new Workflows(
      global,
      workspace,
      async () => true,
      { open: async () => exported, save: async () => exported },
    );
    await exportedWorkflows.export("TSX Project", selection, scope);
    const importedGlobal = new MemoryStore(),
      imported = new Workflows(
        importedGlobal,
        new MemoryStore(),
        async () => true,
        { open: async () => exported, save: async () => undefined },
      );
    const beforeImport = own(selection, "editor.formatOnSave");
    await imported.import(scope);
    assert.ok(
      imported
        .summaries(selection, scope)
        .some((p) => p.name === "TSX Project" && !p.builtin),
    );
    assert.equal(
      own(selection, "editor.formatOnSave"),
      beforeImport,
      "Import only saves a profile; it never applies settings",
    );
    await vscode.workspace.fs.writeFile(exported, new Uint8Array(131073));
    await assert.rejects(imported.import(scope), /at most 128 KiB/);
    await vscode.workspace.fs.writeFile(
      exported,
      new TextEncoder().encode(
        JSON.stringify({
          version: 1,
          name: "unsafe",
          settings: { "files.exclude": {} },
        }),
      ),
    );
    await assert.rejects(imported.import(scope), /supported formatting/);
    imported.dispose();
    exportedWorkflows.dispose();
    await write(selection, "editor.formatOnSave", false);
    await write(selection, "editor.codeActionsOnSave", {
      "source.fixAll.biome": "never",
      "source.organizeImports": "always",
      "source.removeUnusedImports": "never",
    });
    await workflows.apply("TSX Project", selection, scope);
    await assert.rejects(workflows.resumePause(), /dashboard/);
    assert.equal(own(selection, "editor.formatOnSave"), true);
    assert.equal(
      (own(selection, "editor.codeActionsOnSave") as Record<string, unknown>)[
        "source.removeUnusedImports"
      ],
      "never",
    );
    await write(selection, "editor.formatOnSave", undefined);
    await workflows.restore();
    assert.equal(own(selection, "editor.formatOnSave"), undefined);
    assert.equal(workflows.recovery()?.phase, "conflicts");
    assert.ok(
      previews[0]?.every((change) => change.key !== "editor.formatOnSave"),
      "Restore preview must omit the externally edited value",
    );
    assert.equal(
      (own(selection, "editor.codeActionsOnSave") as Record<string, unknown>)[
        "source.fixAll.biome"
      ],
      "never",
    );
    await workflows.discard();
    const cancelled = new Workflows(global, workspace, async () => false);
    assert.match(
      await cancelled.apply("Format on Save, Paste and Type", selection, scope),
      /Cancelled/,
    );
    assert.equal(own(selection, "editor.formatOnSave"), undefined);
    assert.equal(cancelled.recovery(), null);
    cancelled.dispose();
    await write(selection, "editor.formatOnSave", true);
    await write(selection, "editor.formatOnPaste", true);
    await write(selection, "editor.codeActionsOnSave", {
      "source.fixAll.biome": "explicit",
      "source.organizeImports": "always",
    });
    await workflows.pause(
      selection,
      scope,
      configuration(selection).get("editor.codeActionsOnSave"),
    );
    assert.equal(own(selection, "editor.formatOnSave"), false);
    const reloaded = new Workflows(global, workspace, async () => true);
    assert.equal(reloaded.recovery()?.kind, "pause");
    const paused = own(selection, "editor.codeActionsOnSave") as Record<
      string,
      unknown
    >;
    await write(selection, "editor.codeActionsOnSave", {
      ...paused,
      "source.fixAll.biome": "always",
      "source.fixAll.custom": "explicit",
    });
    await reloaded.restore();
    assert.equal(own(selection, "editor.formatOnSave"), true);
    assert.equal(own(selection, "editor.formatOnPaste"), true);
    const resumed = own(selection, "editor.codeActionsOnSave") as Record<
      string,
      unknown
    >;
    assert.equal(resumed["source.fixAll.biome"], "always");
    assert.equal(resumed["source.organizeImports"], "always");
    assert.equal(resumed["source.fixAll.custom"], "explicit");
    assert.equal(reloaded.recovery()?.phase, "conflicts");
    await reloaded.discard();
    await assert.rejects(
      reloaded.pause(
        { ...selection, target: vscode.ConfigurationTarget.Global },
        { target: "user" },
        {},
      ),
      /requires Workspace/,
    );
    assert.equal(reloaded.recovery(), null);
    const editedDuringPreview = new Workflows(
      global,
      workspace,
      async (title, preview) => {
        if (title.startsWith("Restore")) {
          assert.ok(preview.every((c) => c.key !== "editor.formatOnSave"));
          await write(selection, "editor.formatOnSave", true);
        }
        return true;
      },
    );
    await write(selection, "editor.formatOnSave", false);
    await editedDuringPreview.apply("TSX Project", selection, scope);
    await write(selection, "editor.formatOnSave", undefined);
    await editedDuringPreview.restore();
    assert.equal(
      own(selection, "editor.formatOnSave"),
      true,
      "A value omitted from the preview must not be restored after confirmation",
    );
    assert.equal(editedDuringPreview.recovery()?.phase, "conflicts");
    await editedDuringPreview.discard();
    editedDuringPreview.dispose();

    await write(selection, "editor.formatOnSave", true);
    await write(selection, "editor.codeActionsOnSave", {
      "source.fixAll.biome": "explicit",
    });
    await reloaded.pause(
      selection,
      scope,
      configuration(selection).get("editor.codeActionsOnSave"),
    );
    const legacy = ["source.organizeImports"];
    await write(selection, "editor.codeActionsOnSave", legacy);
    await reloaded.restore();
    assert.equal(
      own(selection, "editor.formatOnSave"),
      true,
      "Legacy externally edited actions must not block restoring formatting flags",
    );
    assert.deepEqual(
      own(selection, "editor.codeActionsOnSave"),
      legacy,
      "The external action list must remain untouched",
    );
    assert.equal(reloaded.recovery()?.phase, "conflicts");
    await reloaded.discard();
    await write(selection, "editor.codeActionsOnSave", {
      "source.fixAll.biome": "explicit",
    });
    const providerConfig = vscode.workspace.getConfiguration(
      undefined,
      folder.uri,
    );
    const originalFormatFlag = providerConfig.inspect(
      "typescript.format.enable",
    )?.workspaceValue;
    try {
      await providerConfig.update(
        "typescript.format.enable",
        false,
        vscode.ConfigurationTarget.Workspace,
        false,
      );
      assert.equal(
        providersFor(configuration(selection), "typescriptreact", null).find(
          (p) => p.id === "vscode.typescript-language-features",
        )?.formattingEnabled,
        false,
      );
      assert.equal(
        providersFor(configuration(selection), "json", null).find(
          (p) => p.id === "vscode.typescript-language-features",
        )?.formattingEnabled,
        null,
      );
    } finally {
      await providerConfig.update(
        "typescript.format.enable",
        originalFormatFlag,
        vscode.ConfigurationTarget.Workspace,
        false,
      );
    }
    const dashboard = new Dashboard(extensionUri, () => undefined, reloaded);
    await dashboard.handle({ id: "rules", type: "read", scope });
    const state = await dashboard.snapshot();
    assert.ok(
      state.rules.some(
        (rule) =>
          rule.language === "typescriptreact" &&
          rule.keys.includes("editor.formatOnSave"),
      ),
    );
    assert.equal(state.workflowError, null);
    assert.ok(state.profiles.some((p) => p.name === "TSX Project"));
    assert.ok(
      providersFor(configuration(selection), "typescriptreact", null).some(
        (p) => p.id === "vscode.typescript-language-features" && p.installed,
      ),
    );
    dashboard.dispose();
    reloaded.dispose();
    const corrupt = new MemoryStore();
    await corrupt.update("formattingControls.recovery.v1", { version: 999 });
    const damaged = new Workflows(global, corrupt, async () => true),
      safeDashboard = new Dashboard(extensionUri, () => undefined, damaged);
    const safeState = await safeDashboard.snapshot();
    assert.ok(safeState.workflowError);
    assert.equal(safeState.settings.length, 8);
    safeDashboard.dispose();
    damaged.dispose();
    console.log(
      "Phase 3 assertions passed: saved profiles, scoped apply, external-edit preservation, cancellation, durable pause, granular resume, language rules, provider detection and storage recovery.",
    );
  } finally {
    for (const original of originals)
      await write(selection, original.key, original.value);
    workflows.dispose();
    await vscode.workspace.fs.delete(exported).then(undefined, () => undefined);
  }
};
