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
export const projectSettingsFile = (s: Selection): vscode.Uri | undefined => {
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
};

const dirtySettingsDocument = (
  s: Selection,
): vscode.TextDocument | undefined => {
  const uri = projectSettingsFile(s);
  return uri
    ? vscode.workspace.textDocuments.find(
        (document) =>
          document.isDirty && document.uri.toString() === uri.toString(),
      )
    : undefined;
};
export const assertSettingsSaved = (s: Selection): void => {
  const document = dirtySettingsDocument(s);
  if (document) throw new UnsavedSettingsError(document.uri);
};

/** Let an existing native save settle; never save or discard editor changes. */
export const waitForSettingsSave = async (s: Selection): Promise<void> => {
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
};
export const configuration = (s: Selection): vscode.WorkspaceConfiguration => {
  return vscode.workspace.getConfiguration(
    undefined,
    s.language
      ? { ...(s.uri ? { uri: s.uri } : {}), languageId: s.language }
      : s.uri,
  );
};
export const own = (s: Selection, key: SettingKey): unknown => {
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
};
export const write = async (
  s: Selection,
  key: SettingKey,
  value: unknown,
  update = () =>
    configuration(s).update(key, value, s.target, Boolean(s.language)),
): Promise<void> => {
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
  assertSettingsSaved(s);
  const changesValue = !isDeepStrictEqual(own(s, key), value);
  const uri = projectSettingsFile(s);
  let document =
    uri &&
    vscode.workspace.textDocuments.find(
      (candidate) => candidate.uri.toString() === uri.toString(),
    );
  let version = document?.version;
  const opened = vscode.workspace.onDidOpenTextDocument((candidate) => {
    if (
      !document &&
      uri &&
      candidate.uri.toString() === uri.toString() &&
      !candidate.isDirty
    ) {
      document = candidate;
      version = candidate.version;
    }
  });
  try {
    await update();
    if (document?.isDirty) {
      // A save participant can cancel the native settings save even though
      // update() resolves. Finish only the single edit made by this update;
      // any intervening model edit leaves ownership uncertain and is blocked.
      if (
        !changesValue ||
        version === undefined ||
        document.version !== version + 1
      )
        throw new UnsavedSettingsError(document.uri);
      for (let attempt = 0; document.isDirty; attempt++) {
        if (attempt >= 3 || document.version !== version + 1)
          throw new UnsavedSettingsError(document.uri);
        await document.save();
        if (document.isDirty)
          await new Promise((resolve) =>
            setTimeout(resolve, 20 * (attempt + 1)),
          );
      }
      // The first native request may have reloaded configuration before its
      // cancelled save was completed above. Repeating the same native update
      // refreshes that cache without relying on a file-watcher event. Only do
      // this while the single owned edit is still the entire document change.
      if (document.version === version + 1) {
        await update();
        if (document.isDirty) throw new UnsavedSettingsError(document.uri);
      }
    }
  } finally {
    opened.dispose();
  }
  if (!isDeepStrictEqual(own(s, key), value)) {
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timeout);
        listener.dispose();
        resolve();
      };
      const check = () => {
        if (isDeepStrictEqual(own(s, key), value)) finish();
      };
      const listener = vscode.workspace.onDidChangeConfiguration(check);
      const timeout = setTimeout(finish, 1000);
      check();
    });
    if (!isDeepStrictEqual(own(s, key), value))
      throw new Error(
        `VS Code did not confirm the saved value of ${key}. Review the current settings before retrying.`,
      );
  }
};
export const setAction = async (
  s: Selection,
  id: string,
  value: ActionValue,
): Promise<void> => {
  // Read only the selected scope: never copy inherited settings into a narrower scope.
  await write(
    s,
    "editor.codeActionsOnSave",
    updateAction(own(s, "editor.codeActionsOnSave"), id, value),
  );
};

/** Refuse a reset if its confirmed preview no longer matches the selected scope. */
export const resetIfUnchanged = async (
  s: Selection,
  key: SettingKey,
  expected: unknown,
): Promise<void> => {
  if (!isDeepStrictEqual(own(s, key), expected)) {
    throw new Error(
      "This setting changed while the reset preview was open. Reopen Reset to review its current value.",
    );
  }
  await write(s, key, undefined);
};
