import { isDeepStrictEqual } from "node:util";
import * as vscode from "vscode";
import { type ActionValue, type SettingKey, updateAction } from "./model";
export interface Selection {
  target: vscode.ConfigurationTarget;
  uri?: vscode.Uri;
  language?: string;
}
export class UnsavedSettingsError extends Error {
  constructor(readonly uri: vscode.Uri) {
    super(
      `${vscode.workspace.asRelativePath(uri)} has unsaved changes. Save the file, then try again.`,
    );
    this.name = "UnsavedSettingsError";
  }
}

/** Resolve project settings through VS Code URIs, including remote workspaces. */
export function projectSettingsFile(s: Selection): vscode.Uri | undefined {
  if (s.target === vscode.ConfigurationTarget.Global) return undefined;
  if (
    s.target === vscode.ConfigurationTarget.Workspace &&
    vscode.workspace.workspaceFile
  )
    return vscode.workspace.workspaceFile;
  const folder =
    s.target === vscode.ConfigurationTarget.WorkspaceFolder
      ? s.uri && vscode.workspace.getWorkspaceFolder(s.uri)
      : vscode.workspace.workspaceFolders?.[0];
  return folder
    ? vscode.Uri.joinPath(folder.uri, ".vscode", "settings.json")
    : undefined;
}

function dirtySettingsDocument(s: Selection): vscode.TextDocument | undefined {
  const uri = projectSettingsFile(s);
  return uri
    ? vscode.workspace.textDocuments.find(
        (document) =>
          document.isDirty && document.uri.toString() === uri.toString(),
      )
    : undefined;
}
export function assertSettingsSaved(s: Selection): void {
  const document = dirtySettingsDocument(s);
  if (document) throw new UnsavedSettingsError(document.uri);
}

/** Let an existing native save settle; never save or discard editor changes. */
export async function waitForSettingsSave(s: Selection): Promise<void> {
  if (!dirtySettingsDocument(s)) return;
  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      for (const listener of listeners) listener.dispose();
      resolve();
    };
    const check = () => {
      if (!dirtySettingsDocument(s)) finish();
    };
    const listeners = [
      vscode.workspace.onDidSaveTextDocument(check),
      vscode.workspace.onDidChangeTextDocument(check),
      vscode.workspace.onDidCloseTextDocument(check),
    ];
    const timeout = setTimeout(finish, 1000);
    check();
  });
  assertSettingsSaved(s);
}
export function configuration(s: Selection): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(
    undefined,
    s.language
      ? { ...(s.uri ? { uri: s.uri } : {}), languageId: s.language }
      : s.uri,
  );
}
export function own(s: Selection, key: SettingKey): unknown {
  const i = configuration(s).inspect(key);
  if (!i) return undefined;
  if (s.language)
    return s.target === vscode.ConfigurationTarget.Global
      ? i.globalLanguageValue
      : s.target === vscode.ConfigurationTarget.Workspace
        ? i.workspaceLanguageValue
        : i.workspaceFolderLanguageValue;
  return s.target === vscode.ConfigurationTarget.Global
    ? i.globalValue
    : s.target === vscode.ConfigurationTarget.Workspace
      ? i.workspaceValue
      : i.workspaceFolderValue;
}
export async function write(
  s: Selection,
  key: SettingKey,
  value: unknown,
): Promise<void> {
  if (
    s.target !== vscode.ConfigurationTarget.Global &&
    !vscode.workspace.workspaceFile &&
    !vscode.workspace.workspaceFolders?.length
  )
    throw new Error("Open a workspace before editing workspace settings.");
  if (
    s.target === vscode.ConfigurationTarget.WorkspaceFolder &&
    (!s.uri || !vscode.workspace.getWorkspaceFolder(s.uri))
  )
    throw new Error("Select a file inside the intended workspace folder.");
  if (s.language && key.startsWith("files."))
    throw new Error("Auto Save settings are not language-overridable.");
  await waitForSettingsSave(s);
  await configuration(s).update(key, value, s.target, Boolean(s.language));
}
export async function setAction(
  s: Selection,
  id: string,
  value: ActionValue,
): Promise<void> {
  // Read only the selected scope: never copy inherited settings into a narrower scope.
  await write(
    s,
    "editor.codeActionsOnSave",
    updateAction(own(s, "editor.codeActionsOnSave"), id, value),
  );
}

/** Refuse a reset if its confirmed preview no longer matches the selected scope. */
export async function resetIfUnchanged(
  s: Selection,
  key: SettingKey,
  expected: unknown,
): Promise<void> {
  if (!isDeepStrictEqual(own(s, key), expected)) {
    throw new Error(
      "This setting changed while the reset preview was open. Reopen Reset to review its current value.",
    );
  }
  await write(s, key, undefined);
}
