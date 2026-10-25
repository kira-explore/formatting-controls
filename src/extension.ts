import * as vscode from "vscode";
import {
  configuration,
  own,
  type Selection,
  setAction,
  write,
} from "./configuration";
import {
  type ActionValue,
  flags,
  keys,
  type SettingKey,
  status,
} from "./model";

export function activate(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  item.command = "formattingControls.open";
  const scope = (): Selection => {
    const document = vscode.window.activeTextEditor?.document;
    return {
      target: vscode.ConfigurationTarget.Global,
      ...(document ? { uri: document.uri } : {}),
    };
  };
  const refresh = () => {
    const c = configuration(scope());
    // Read with the active language even when the editing target is ordinary User settings.
    const document = vscode.window.activeTextEditor?.document;
    const effective = document
      ? vscode.workspace.getConfiguration(undefined, {
          uri: document.uri,
          languageId: document.languageId,
        })
      : c;
    item.text = `$(settings-gear) Formatting: ${status(flags.map((k) => effective.get<boolean>(k, false)))}`;
    item.tooltip =
      "Effective Save / Paste / Type formatting for the active editor. Click to choose a setting and scope. Code actions are separate.";
    item.accessibilityInformation = {
      label: item.text.replace("$(settings-gear) ", ""),
    };
    item.show();
  };
  const inspect = async () => {
    const d = vscode.window.activeTextEditor?.document;
    const c = vscode.workspace.getConfiguration(
      undefined,
      d ? { uri: d.uri, languageId: d.languageId } : undefined,
    );
    const doc = await vscode.workspace.openTextDocument({
      language: "json",
      content: JSON.stringify(
        {
          language: d?.languageId,
          resource: d?.uri.toString(),
          settings: Object.fromEntries(
            keys.map((k) => [
              k,
              { effective: c.get(k), sources: c.inspect(k) },
            ]),
          ),
        },
        null,
        2,
      ),
    });
    await vscode.window.showTextDocument(doc);
  };
  const open = async () => {
    const target = await vscode.window.showQuickPick(
      [
        { label: "User", target: vscode.ConfigurationTarget.Global },
        ...(vscode.workspace.workspaceFolders?.length
          ? [
              {
                label: "Workspace",
                target: vscode.ConfigurationTarget.Workspace,
              },
              {
                label: "Workspace Folder (active file)",
                target: vscode.ConfigurationTarget.WorkspaceFolder,
              },
            ]
          : []),
      ],
      { title: "Formatting Controls · Choose where to write" },
    );
    if (!target) return;
    const s: Selection = { ...scope(), target: target.target };
    const d = vscode.window.activeTextEditor?.document;
    const language =
      d &&
      (await vscode.window.showQuickPick(
        ["All languages", `Language: ${d.languageId}`],
        { title: "Choose language scope" },
      ));
    if (d && !language) return;
    if (language?.startsWith("Language:") && d) s.language = d.languageId;
    const c = configuration(s);
    const selected = await vscode.window.showQuickPick(
      [
        ...keys.map((key) => ({
          label: key,
          description: JSON.stringify(c.get(key)),
          key,
        })),
        {
          label: "Inspect effective settings",
          description: "Show all scope and language values",
          key: "inspect",
        },
        {
          label: "Reset one setting",
          description: "Preview removal at the selected scope only",
          key: "reset",
        },
      ],
      {
        title: `Formatting Controls · ${target.label}${s.language ? ` · ${s.language}` : ""}`,
        matchOnDescription: true,
      },
    );
    if (!selected) return;
    if (selected.key === "inspect") return inspect();
    if (selected.key === "reset") {
      const key = await vscode.window.showQuickPick(
        keys.map((key) => ({
          label: key,
          description: JSON.stringify(own(s, key)),
          key,
        })),
        { title: "Reset · select a setting" },
      );
      if (!key || own(s, key.key) === undefined) return;
      const confirm = await vscode.window.showWarningMessage(
        `Remove ${key.key} = ${JSON.stringify(own(s, key.key))} from ${target.label}${s.language ? ` / ${s.language}` : ""}? Inherited settings will apply.`,
        { modal: true },
        "Reset",
      );
      if (confirm) await write(s, key.key, undefined);
      return;
    }
    const key = selected.key as SettingKey;
    if (key.startsWith("files.") && s.language)
      throw new Error(
        "Auto Save settings are not language-overridable. Choose All languages.",
      );
    if (key === "editor.codeActionsOnSave") {
      const id = await vscode.window.showInputBox({
        title: "Source action identifier",
        value: "source.fixAll",
        prompt:
          "Availability depends on the installed provider and language; this configures behavior only.",
      });
      if (!id) return;
      const value = await vscode.window.showQuickPick(
        ["explicit", "always", "never"] as const,
        {
          title:
            "Run action · always includes focus/window Auto Save, not afterDelay",
        },
      );
      if (value) await setAction(s, id, value as ActionValue);
    } else {
      let value: unknown;
      if (flags.includes(key as (typeof flags)[number])) {
        const choice = await vscode.window.showQuickPick(["ON", "OFF"], {
          title: key,
        });
        if (!choice) return;
        value = choice === "ON";
      } else if (
        key === "files.autoSave" ||
        key === "editor.formatOnSaveMode"
      ) {
        value = await vscode.window.showQuickPick(
          key === "files.autoSave"
            ? ["off", "afterDelay", "onFocusChange", "onWindowChange"]
            : ["file", "modifications", "modificationsIfAvailable"],
          { title: key },
        );
      } else {
        const input = await vscode.window.showInputBox({
          title: key,
          value: String(c.get(key) ?? ""),
          validateInput: (text) =>
            key === "files.autoSaveDelay" &&
            (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text)))
              ? "Enter a non-negative whole number of milliseconds."
              : undefined,
        });
        if (input === undefined) return;
        value =
          key === "files.autoSaveDelay" ? Number(input) : input || undefined;
      }
      if (value === undefined) return;
      await write(s, key, value);
    }
    const effective = vscode.workspace
      .getConfiguration(
        undefined,
        d ? { uri: d.uri, languageId: d.languageId } : undefined,
      )
      .get(key);
    await vscode.window.showInformationMessage(
      `Updated ${target.label}. Effective ${key}: ${JSON.stringify(effective)}. Inspect Effective Settings to see overrides.`,
    );
  };
  const guarded = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (error) {
      await vscode.window.showErrorMessage(
        `Formatting Controls: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  context.subscriptions.push(
    item,
    vscode.commands.registerCommand("formattingControls.open", guarded(open)),
    vscode.commands.registerCommand(
      "formattingControls.inspect",
      guarded(inspect),
    ),
    vscode.workspace.onDidChangeConfiguration(refresh),
    vscode.window.onDidChangeActiveTextEditor(refresh),
  );
  refresh();
}
