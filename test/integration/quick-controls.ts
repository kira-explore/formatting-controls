import assert from "node:assert/strict";
import * as vscode from "vscode";
import type { Response } from "../../shared/protocol";
import { own } from "../../src/configuration";
import { Dashboard } from "../../src/dashboard";
import { statusTooltip } from "../../src/status-hover";
import { Workflows } from "../../src/workflows";
import { MemoryStore } from "./workflows";
export async function runQuickTests(
  root: vscode.Uri,
  uri: vscode.Uri,
): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
  const replies: Response[] = [];
  const workflows = new Workflows(
    new MemoryStore(),
    new MemoryStore(),
    async () => true,
  );
  const quick = new Dashboard(
    root,
    (message) => {
      replies.push(message);
    },
    workflows,
    "quick",
  );
  try {
    const tooltip = statusTooltip({
      file: "[Run](command:evil)",
      flags: [false, false, false],
      actions: undefined,
    });
    assert.ok(tooltip instanceof vscode.MarkdownString);
    assert.equal(tooltip.supportHtml, false);
    assert.deepEqual(tooltip.isTrusted, {
      enabledCommands: [
        "formattingControls.quickControls",
        "formattingControls.dashboard",
      ],
    });
    await quick.open(false, "actions");
    const state = await quick.snapshot();
    assert.equal(state.quickTab, "actions");
    assert.equal(state.scope.target, "folder");
    assert.equal(
      state.scope.folder,
      vscode.workspace.getWorkspaceFolder(uri)?.uri.toString(),
    );
    assert.equal(state.resource, uri.toString());
    await quick.handle({
      id: "quick-ready",
      type: "ready",
      scope: { target: "user" },
    });
    assert.deepEqual(
      (await quick.snapshot()).scope,
      state.scope,
      "Readiness must preserve the chosen quick scope",
    );
    const ready = await quick.snapshot();
    const original = own(
      { target: vscode.ConfigurationTarget.WorkspaceFolder, uri },
      "editor.formatOnPaste",
    );
    await quick.handle({
      id: "quick-change",
      type: "set",
      scope: state.scope,
      revision: ready.revision,
      key: "editor.formatOnPaste",
      value: original !== true,
    });
    assert.equal(
      own(
        { target: vscode.ConfigurationTarget.WorkspaceFolder, uri },
        "editor.formatOnPaste",
      ),
      original !== true,
    );
    const current = await quick.snapshot();
    await quick.handle({
      id: "quick-stale",
      type: "set",
      scope: current.scope,
      revision: state.revision,
      key: "editor.formatOnPaste",
      value: original === true,
    });
    assert.ok(
      replies.some(
        (message) => message.type === "error" && message.id === "quick-stale",
      ),
    );
    await quick.open(false, "formatting");
    assert.equal((await quick.snapshot()).quickTab, "formatting");
    assert.equal(
      (await quick.snapshot()).resource,
      uri.toString(),
      "Quick controls must retain editor context when its webview has focus",
    );
  } finally {
    quick.dispose();
    workflows.dispose();
  }
}
