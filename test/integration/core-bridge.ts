import assert from "node:assert/strict";
import * as vscode from "vscode";
import {
  type CoreState,
  coreCommands,
  isCoreState,
} from "../../shared/core-controls";
import { own, write } from "../../src/configuration";

/** Exercises the private settings bridge in both stock and patched editors. */
export async function runCoreBridgeTests(uri: vscode.Uri): Promise<void> {
  await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(uri),
  );
  const selection = { target: vscode.ConfigurationTarget.Workspace, uri };
  const original = own(selection, "editor.formatOnPaste");
  const originalFormatter = own(selection, "editor.defaultFormatter");
  const actions = own(selection, "editor.codeActionsOnSave");
  const snapshot = async () => {
    const state = await vscode.commands.executeCommand<CoreState>(
      coreCommands.snapshot,
    );
    assert.ok(isCoreState(state));
    return state;
  };
  const act = async (action: object) => {
    const state = await snapshot();
    return vscode.commands.executeCommand<CoreState>(coreCommands.action, {
      session: state.session,
      revision: state.revision,
      ...action,
    });
  };
  try {
    await act({ type: "scope", value: "workspace" });
    const before = await snapshot();
    await act({
      type: "flag",
      key: "editor.formatOnPaste",
      value: !before.flags[1]?.checked,
    });
    assert.equal(
      own(selection, "editor.formatOnPaste"),
      !before.flags[1]?.checked,
    );
    await assert.rejects(
      async () =>
        vscode.commands.executeCommand(coreCommands.action, {
          session: before.session,
          revision: before.revision,
          type: "flag",
          key: "editor.formatOnSave",
          value: false,
        }),
      /changed/,
    );
    await assert.rejects(
      async () => act({ type: "scope", value: "unavailable" }),
      /unavailable/,
    );
    await assert.rejects(
      async () => act({ type: "formatter", value: "not.installed" }),
      /unavailable/,
    );
    await assert.rejects(
      async () =>
        act({ type: "flag", key: "editor.codeActionsOnSave", value: false }),
      /Invalid/,
    );
    await act({ type: "formatter", value: "" });
    assert.equal(own(selection, "editor.defaultFormatter"), undefined);
    assert.deepEqual(own(selection, "editor.codeActionsOnSave"), actions);
    const language = (await snapshot()).languages.find(
      (option) => option.id,
    )?.id;
    assert.ok(language);
    const withLanguage = await act({ type: "language", value: language });
    assert.equal(withLanguage?.languageRule, language);
  } finally {
    await act({ type: "language", value: "" });
    await write(selection, "editor.formatOnPaste", original);
    await write(selection, "editor.defaultFormatter", originalFormatter);
  }
}
