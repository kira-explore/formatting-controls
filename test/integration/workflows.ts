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
export async function runWorkflowTests(
  extensionUri: vscode.Uri,
  uri: vscode.Uri,
): Promise<void> {
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
      await cancelled.apply("Strict", selection, scope),
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
}
