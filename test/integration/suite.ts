import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  configuration,
  own,
  resetIfUnchanged,
  setAction,
  write,
} from "../../src/configuration";
export async function run(): Promise<void> {
  const ext = vscode.extensions.getExtension("rajudhami.formatting-controls");
  assert.ok(ext);
  await ext.activate();
  assert.ok(
    (await vscode.commands.getCommands()).includes("formattingControls.open"),
  );
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "Integration workspace must be open");
  const other = vscode.workspace.workspaceFolders?.[1];
  assert.ok(other, "Two folders are required for isolation tests");
  const uri = vscode.Uri.joinPath(folder.uri, "sample.ts");
  const first = { target: vscode.ConfigurationTarget.WorkspaceFolder, uri };
  const second = {
    target: vscode.ConfigurationTarget.WorkspaceFolder,
    uri: vscode.Uri.joinPath(other.uri, "sample.ts"),
  };
  const user = { target: vscode.ConfigurationTarget.Global, uri };
  const workspace = { target: vscode.ConfigurationTarget.Workspace, uri };
  const language = { ...workspace, language: "typescript" };
  try {
    await write(user, "editor.formatOnSave", true);
    await write(workspace, "editor.formatOnSave", false);
    assert.equal(configuration(workspace).get("editor.formatOnSave"), false);
    assert.equal(own(user, "editor.formatOnSave"), true);
    await write(language, "editor.formatOnSave", true);
    assert.equal(configuration(language).get("editor.formatOnSave"), true);
    await write(workspace, "editor.codeActionsOnSave", {
      "source.organizeImports": "never",
    });
    await setAction(workspace, "source.fixAll", "explicit");
    assert.deepEqual(own(workspace, "editor.codeActionsOnSave"), {
      "source.organizeImports": "never",
      "source.fixAll": "explicit",
    });
    await write(language, "editor.formatOnSave", undefined);
    assert.equal(configuration(language).get("editor.formatOnSave"), false);
    await write(first, "editor.formatOnSave", true);
    assert.equal(configuration(first).get("editor.formatOnSave"), true);
    assert.equal(configuration(second).get("editor.formatOnSave"), false);
    assert.equal(own(second, "editor.formatOnSave"), undefined);

    await setAction(first, "source.fixAll.biome", "explicit");
    assert.deepEqual(own(first, "editor.codeActionsOnSave"), {
      "source.fixAll.biome": "explicit",
    });
    assert.equal(own(second, "editor.codeActionsOnSave"), undefined);
    assert.deepEqual(own(workspace, "editor.codeActionsOnSave"), {
      "source.organizeImports": "never",
      "source.fixAll": "explicit",
    });
    assert.equal(
      configuration(first).get<Record<string, unknown>>(
        "editor.codeActionsOnSave",
      )?.["source.organizeImports"],
      "never",
    );

    const preview = own(first, "editor.formatOnSave");
    await write(first, "editor.formatOnSave", false);
    await assert.rejects(
      resetIfUnchanged(first, "editor.formatOnSave", preview),
      /changed while/,
    );
    assert.equal(own(first, "editor.formatOnSave"), false);
    await resetIfUnchanged(first, "editor.formatOnSave", false);
    assert.equal(own(first, "editor.formatOnSave"), undefined);

    const actionPreview = structuredClone(
      own(first, "editor.codeActionsOnSave"),
    );
    await setAction(first, "source.organizeImports", "always");
    await assert.rejects(
      resetIfUnchanged(first, "editor.codeActionsOnSave", actionPreview),
      /changed while/,
    );
    assert.deepEqual(own(first, "editor.codeActionsOnSave"), {
      "source.fixAll.biome": "explicit",
      "source.organizeImports": "always",
    });
    console.log(
      "Extension-host assertions passed: activation, scope precedence, language override, multi-root isolation, inherited action preservation, reset and stale preview protection.",
    );
  } finally {
    for (const s of [language, first, second, workspace, user])
      for (const k of [
        "editor.formatOnSave",
        "editor.codeActionsOnSave",
      ] as const)
        await write(s, k, undefined);
  }
}
