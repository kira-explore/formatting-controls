import * as vscode from "vscode";
import { type ActionValue, type SettingKey, updateAction } from "./model";
export interface Selection {
  target: vscode.ConfigurationTarget;
  uri?: vscode.Uri;
  language?: string;
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
    !vscode.workspace.workspaceFolders?.length
  )
    throw new Error("Open a workspace before editing workspace settings.");
  if (
    s.target === vscode.ConfigurationTarget.WorkspaceFolder &&
    (!s.uri || !vscode.workspace.getWorkspaceFolder(s.uri))
  )
    throw new Error("Select a file inside the intended workspace folder.");
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
