import assert from "node:assert/strict";
import * as vscode from "vscode";
import { configuration, own, setAction, write } from "../../src/configuration";
export async function run(): Promise<void> {
  const ext = vscode.extensions.getExtension("rajudhami.formatting-controls");
  assert.ok(ext);
  await ext.activate();
  assert.ok(
    (await vscode.commands.getCommands()).includes("formattingControls.open"),
  );
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "Integration workspace must be open");
  const uri = vscode.Uri.joinPath(folder.uri, "sample.ts");
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
    console.log(
      "Extension-host assertions passed: activation, scope precedence, language override, action preservation, reset.",
    );
  } finally {
    for (const s of [language, workspace, user])
      for (const k of [
        "editor.formatOnSave",
        "editor.codeActionsOnSave",
      ] as const)
        await write(s, k, undefined);
  }
}
