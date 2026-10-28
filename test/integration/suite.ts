import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import * as vscode from "vscode";
import type { Response } from "../../shared/protocol";
import {
  configuration,
  own,
  resetIfUnchanged,
  setAction,
  write,
} from "../../src/configuration";
import { Dashboard } from "../../src/dashboard";
import { Workflows } from "../../src/workflows";
import { runCoreBridgeTests } from "./core-bridge";
import { profileDashboard } from "./performance";
import { runStatusTests } from "./status-controls";
import { MemoryStore, runWorkflowTests } from "./workflows";

async function changeFolders(
  start: number,
  deleteCount: number,
  ...folders: { uri: vscode.Uri; name: string }[]
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      listener.dispose();
      reject(new Error("Workspace folder update timed out"));
    }, 10000);
    const listener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      clearTimeout(timeout);
      listener.dispose();
      resolve();
    });
    if (
      !vscode.workspace.updateWorkspaceFolders(start, deleteCount, ...folders)
    ) {
      clearTimeout(timeout);
      listener.dispose();
      reject(new Error("Workspace folder update rejected"));
    }
  });
}
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
  const replies: Response[] = [];
  const dashboardWorkflows = new Workflows(
    new MemoryStore(),
    new MemoryStore(),
  );
  const dashboard = new Dashboard(
    ext.extensionUri,
    (message) => {
      replies.push(message);
    },
    dashboardWorkflows,
  );
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
    const dashboardScope = {
      target: "folder" as const,
      folder: folder.uri.toString(),
      language: "typescript",
    };
    await dashboard.handle({
      id: "dashboard-read",
      type: "read",
      scope: dashboardScope,
    });
    const snapshot = await dashboard.snapshot();
    await dashboard.handle({
      id: "dashboard-set",
      type: "set",
      scope: dashboardScope,
      revision: snapshot.revision,
      key: "editor.formatOnPaste",
      value: true,
    });
    assert.equal(
      own({ ...first, language: "typescript" }, "editor.formatOnPaste"),
      true,
    );
    await dashboard.handle({
      id: "stale",
      type: "set",
      scope: dashboardScope,
      revision: snapshot.revision,
      key: "editor.formatOnPaste",
      value: false,
    });
    assert.equal(
      own({ ...first, language: "typescript" }, "editor.formatOnPaste"),
      true,
      "Stale dashboard requests must not write",
    );
    await dashboard.handle({
      id: "untrusted-folder",
      type: "read",
      scope: { target: "folder", folder: "file:///untrusted" },
    });
    assert.equal(
      (await dashboard.snapshot()).scope.folder,
      folder.uri.toString(),
    );
    assert.equal(
      own({ ...second, language: "typescript" }, "editor.formatOnPaste"),
      undefined,
    );
    await dashboard.handle({
      id: "invalid-action",
      type: "action",
      scope: dashboardScope,
      revision: (await dashboard.snapshot()).revision,
      action: `source.${"a".repeat(201)}`,
      value: "explicit",
    });
    assert.ok(
      replies.some(
        (reply) => reply.type === "error" && reply.id === "invalid-action",
      ),
    );
    await dashboard.handle({
      id: "reload-handshake",
      type: "ready",
      scope: { target: "user" },
    });
    assert.deepEqual(
      (await dashboard.snapshot()).scope,
      dashboardScope,
      "Webview reload must preserve the selected scope",
    );
    const current = await dashboard.snapshot();
    await dashboard.handle({
      id: "dashboard-action",
      type: "action",
      scope: dashboardScope,
      revision: current.revision,
      action: "source.fixAll.biome",
      value: "explicit",
    });
    assert.deepEqual(
      own({ ...first, language: "typescript" }, "editor.codeActionsOnSave"),
      { "source.fixAll.biome": "explicit" },
    );
    assert.ok(
      (await vscode.commands.getCommands()).includes(
        "formattingControls.dashboard",
      ),
    );
    assert.ok(
      (await vscode.commands.getCommands()).includes(
        "formattingControls.welcome",
      ),
    );
    await write(
      { ...first, language: "typescript" },
      "editor.formatOnPaste",
      undefined,
    );
    await write(
      { ...first, language: "typescript" },
      "editor.codeActionsOnSave",
      undefined,
    );
    await dashboard.handle({
      id: "ui-read",
      type: "read",
      scope: { target: "user" },
    });
    if (process.env.FORMATTING_CONTROLS_UI_THEME)
      await vscode.workspace
        .getConfiguration("workbench")
        .update(
          "colorTheme",
          process.env.FORMATTING_CONTROLS_UI_THEME,
          vscode.ConfigurationTarget.Global,
        );
    await vscode.workspace.fs.writeFile(uri, new Uint8Array());
    const activeDocument = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(activeDocument);
    await dashboard.open(true);
    assert.equal((await dashboard.snapshot()).page, "welcome");
    await dashboard.handle({
      id: "other-folder",
      type: "read",
      scope: { target: "folder", folder: other.uri.toString() },
    });
    assert.equal(
      (await dashboard.snapshot()).resource,
      other.uri.toString(),
      "Caption must identify the folder whose settings are displayed",
    );
    await dashboard.handle({
      id: "active-file",
      type: "read",
      scope: { target: "user" },
    });
    await vscode.languages.setTextDocumentLanguage(
      activeDocument,
      "javascript",
    );
    assert.equal(
      (await dashboard.snapshot()).activeLanguage,
      "javascript",
      "Changing language mode must refresh the dashboard context",
    );

    const navigation = (await dashboard.snapshot()).navigation;
    await dashboard.open();
    assert.equal((await dashboard.snapshot()).page, "overview");
    assert.ok((await dashboard.snapshot()).navigation > navigation);
    await assert.rejects(
      write({ ...first, language: "typescript" }, "files.autoSave", "off"),
      /not language-overridable/,
    );
    await dashboard.handle({
      id: "closed-folder",
      type: "read",
      scope: { target: "folder", folder: other.uri.toString() },
    });
    dashboard.dispose();
    await changeFolders(1, 1);
    try {
      await dashboard.open();
      assert.equal(
        (await dashboard.snapshot()).scope.target,
        "user",
        "Reopening after a folder was removed must recover to a valid scope",
      );
    } finally {
      await changeFolders(1, 0, { uri: other.uri, name: other.name });
    }
    await runCoreBridgeTests(uri);
    await runStatusTests(uri);
    await runWorkflowTests(ext.extensionUri, uri);
    await profileDashboard(dashboard);
    if (
      process.env.FORMATTING_CONTROLS_UI_READY &&
      process.env.FORMATTING_CONTROLS_UI_DONE
    ) {
      if (process.env.FORMATTING_CONTROLS_STATUS_UI) {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
        const document = await vscode.languages.setTextDocumentLanguage(
          await vscode.workspace.openTextDocument(uri),
          "typescript",
        );
        await vscode.window.showTextDocument(document);
        await write(first, "editor.formatOnPaste", false);
      } else {
        await dashboard.open();
      }
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
      await vscode.commands.executeCommand("workbench.action.closePanel");
      writeFileSync(process.env.FORMATTING_CONTROLS_UI_READY, "ready");
      const deadline = Date.now() + 180000;
      while (!existsSync(process.env.FORMATTING_CONTROLS_UI_DONE)) {
        if (Date.now() > deadline)
          throw new Error("Dashboard verification timed out");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (process.env.FORMATTING_CONTROLS_UI_REVIEW)
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Number(process.env.FORMATTING_CONTROLS_UI_DURATION ?? 180000),
        ),
      );
    console.log(
      "Extension-host assertions passed: activation, scope precedence, language override, multi-root isolation, inherited action preservation, reset, stale preview protection, dashboard messages, folder allowlisting and real panel creation.",
    );
  } finally {
    dashboard.dispose();
    dashboardWorkflows.dispose();
    for (const s of [
      language,
      { ...first, language: "typescript" },
      first,
      second,
      workspace,
      user,
    ])
      for (const k of [
        "editor.formatOnSave",
        "editor.codeActionsOnSave",
        "editor.formatOnPaste",
      ] as const)
        await write(s, k, undefined);
  }
}
