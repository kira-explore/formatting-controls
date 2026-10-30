import * as vscode from "vscode";
import { adapters } from "../shared/providers";
import { settingSource } from "../shared/setting-source";
import { own, type Selection, write } from "./configuration";
import { flags, status } from "./model";
import { providersFor } from "./providers";
import { statusTooltip } from "./status-hover";
import type { Workflows } from "./workflows";

/** Hover and click share the same native anchored status card. */
export class StatusControls {
  private revision = 0;
  private fingerprint = "";
  private target: vscode.ConfigurationTarget | undefined;
  private languageOnly = false;
  private pending = false;
  constructor(
    private readonly item: vscode.StatusBarItem,
    private readonly document: () => vscode.TextDocument | undefined,
    private readonly workflows?: Workflows,
  ) {
    item.name = "Formatting Controls";
    item.command = "workbench.action.showHover";
  }
  private selection(): Selection {
    const document = this.document();
    const folder =
      document && vscode.workspace.getWorkspaceFolder(document.uri);
    const hasWorkspace = !!(
      vscode.workspace.workspaceFile ||
      vscode.workspace.workspaceFolders?.length
    );
    const target =
      this.target ??
      (folder
        ? vscode.ConfigurationTarget.WorkspaceFolder
        : hasWorkspace
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global);
    return {
      target:
        (target === vscode.ConfigurationTarget.WorkspaceFolder && !folder) ||
        (target === vscode.ConfigurationTarget.Workspace && !hasWorkspace)
          ? vscode.ConfigurationTarget.Global
          : target,
      ...(document ? { uri: document.uri } : {}),
      ...(this.languageOnly && document
        ? { language: document.languageId }
        : {}),
    };
  }
  private effective(): vscode.WorkspaceConfiguration {
    const document = this.document();
    return vscode.workspace.getConfiguration(
      undefined,
      document
        ? { uri: document.uri, languageId: document.languageId }
        : undefined,
    );
  }
  refresh(): void {
    const document = this.document();
    const selection = this.selection();
    const effective = this.effective();
    const values = flags.map((key) => effective.get<boolean>(key, false));
    const configuredFormatter = effective.get<unknown>(
      "editor.defaultFormatter",
    );
    const formatter =
      typeof configuredFormatter === "string" ? configuredFormatter : undefined;
    const displayName: unknown = formatter
      ? vscode.extensions.getExtension(formatter)?.packageJSON.displayName
      : undefined;
    const folder =
      document && vscode.workspace.getWorkspaceFolder(document.uri);
    let paused = false;
    try {
      paused = this.workflows?.recovery()?.kind === "pause";
    } catch {
      /* The dashboard reports invalid recovery storage. */
    }
    const sources = flags.map((key) => {
      const source = settingSource(
        {
          configured: own(selection, key) !== undefined,
          owned: own(selection, key),
          effective: effective.get(key),
          sources: effective.inspect(key) as unknown as Record<string, unknown>,
        },
        {
          target:
            selection.target === vscode.ConfigurationTarget.Global
              ? "user"
              : selection.target === vscode.ConfigurationTarget.Workspace
                ? "workspace"
                : "folder",
          ...(selection.language ? { language: selection.language } : {}),
        },
        document?.languageId,
      );
      return source;
    });
    const context = {
      version: String(
        vscode.extensions.getExtension("rajudhami.formatting-controls")
          ?.packageJSON.version ?? "",
      ),
      paused,
      canPause:
        !!this.workflows &&
        (paused || selection.target !== vscode.ConfigurationTarget.Global),
      file: document
        ? (document.uri.path.split("/").pop() ?? document.fileName)
        : "No active file",
      ...(document ? { language: document.languageId } : {}),
      ...(vscode.workspace.name ? { workspace: vscode.workspace.name } : {}),
      ...(folder && (vscode.workspace.workspaceFolders?.length ?? 0) > 1
        ? { folder: folder.name }
        : {}),
      flags: values,
      sources: sources.map((source) => source.label),
      overrides: sources.map((source) => source.override),
      owned: flags.map((key) => {
        const value = own(selection, key);
        return typeof value === "boolean" ? value : undefined;
      }),
      ...(formatter
        ? {
            formatter:
              adapters.find((adapter) => adapter.id === formatter)?.name ??
              (typeof displayName === "string" ? displayName : formatter),
          }
        : {}),
      scope:
        selection.target === vscode.ConfigurationTarget.Global
          ? "User"
          : selection.target === vscode.ConfigurationTarget.Workspace
            ? "Workspace"
            : `Folder: ${selection.uri ? (vscode.workspace.getWorkspaceFolder(selection.uri)?.name ?? "") : ""}`,
      languageScope: selection.language ?? "All languages",
    };
    // Distinguish write destinations even when their visible labels match.
    const fingerprint = JSON.stringify({
      context,
      activePath: document?.uri.toString(),
      target: selection.target,
      uri: selection.uri?.toString(),
      language: selection.language,
      ownedFormatter: own(selection, "editor.defaultFormatter"),
      theme: vscode.window.activeColorTheme.kind,
      folders: vscode.workspace.workspaceFolders?.map((folder) =>
        folder.uri.toString(),
      ),
    });
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint;
    this.revision++;
    this.item.text = `Formatting: ${status(values)}`;
    this.item.tooltip = statusTooltip({ ...context, revision: this.revision });
    this.item.accessibilityInformation = {
      label: this.item.text.replace("$(settings-gear) ", ""),
    };
    this.item.show();
  }
  private assertCurrent(revision: unknown): void {
    if (revision !== this.revision)
      throw new Error(
        "Formatting settings or editor changed. Reopen the status card and try again.",
      );
  }
  async control(revision: unknown, action: unknown): Promise<void> {
    this.assertCurrent(revision);
    if (this.pending)
      throw new Error("Finish the current formatting control first.");
    this.pending = true;
    try {
      await this.applyControl(revision, action);
    } finally {
      this.pending = false;
      this.refresh();
    }
  }
  private async applyControl(
    revision: unknown,
    action: unknown,
  ): Promise<void> {
    if (action === "pause") {
      if (!this.workflows) throw new Error("Pause storage is unavailable.");
      if (this.workflows.recovery()?.kind === "pause")
        await this.workflows.restore();
      else {
        const selection = this.selection();
        await this.workflows.pauseFormatting(selection, {
          target:
            selection.target === vscode.ConfigurationTarget.Global
              ? "user"
              : selection.target === vscode.ConfigurationTarget.Workspace
                ? "workspace"
                : "folder",
          ...(selection.target === vscode.ConfigurationTarget.WorkspaceFolder &&
          selection.uri
            ? {
                folder: vscode.workspace
                  .getWorkspaceFolder(selection.uri)
                  ?.uri.toString() as string,
              }
            : {}),
          ...(selection.language ? { language: selection.language } : {}),
        });
      }
    } else if (action === "scope") {
      const document = this.document();
      const choices = [
        { label: "User", target: vscode.ConfigurationTarget.Global },
        ...(vscode.workspace.workspaceFile ||
        vscode.workspace.workspaceFolders?.length
          ? [
              {
                label: "Workspace",
                target: vscode.ConfigurationTarget.Workspace,
              },
            ]
          : []),
        ...(document && vscode.workspace.getWorkspaceFolder(document.uri)
          ? [
              {
                label: "Workspace Folder (active file)",
                target: vscode.ConfigurationTarget.WorkspaceFolder,
              },
            ]
          : []),
      ];
      const choice = await vscode.window.showQuickPick(choices, {
        title: "Formatting Controls · Write to",
      });
      if (!choice) return;
      this.assertCurrent(revision);
      this.target = choice.target;
    } else if (action === "language") {
      const language = this.document()?.languageId;
      const choice = await vscode.window.showQuickPick(
        language ? ["All languages", language] : ["All languages"],
        { title: "Formatting Controls · Apply to language" },
      );
      if (!choice) return;
      this.assertCurrent(revision);
      this.languageOnly = choice !== "All languages";
    } else if (action === "formatting") {
      const selection = this.selection();
      const effective = this.effective();
      const before = flags.map((key) => own(selection, key));
      const initial = flags.map(
        (key, index) => before[index] ?? effective.get<boolean>(key, false),
      );
      const choices = flags.map((key, index) => ({
        label: `Format on ${["save", "paste", "type"][index]}`,
        key,
        picked: initial[index] === true,
        description:
          before[index] === undefined
            ? "Inherited at this scope"
            : "Saved at this scope",
        detail: `Effective for the active editor: ${effective.get<boolean>(key, false) ? "On" : "Off"}`,
      }));
      const picked = await vscode.window.showQuickPick(choices, {
        title: `Formatting Controls · ${this.scopeLabel(selection)} · ${selection.language ?? "All languages"}`,
        placeHolder:
          "Select enabled formatting triggers, then choose OK to save",
        canPickMany: true,
      });
      if (!picked) return;
      this.assertCurrent(revision);
      const enabled = new Set(picked.map((choice) => choice.key));
      for (let index = 0; index < flags.length; index++) {
        const key = flags[index];
        if (!key || enabled.has(key) === initial[index]) continue;
        if (own(selection, key) !== before[index])
          throw new Error(
            "Formatting settings changed. Reopen the controls and try again.",
          );
        await write(selection, key, enabled.has(key));
      }
    } else if (action === "formatter") {
      const selection = this.selection();
      const effective = this.effective();
      const selected = effective.get<string>("editor.defaultFormatter");
      const choices = providersFor(
        effective,
        this.document()?.languageId ?? "",
        selected,
      )
        .filter(
          (provider) =>
            provider.installed &&
            ((provider.formatting && provider.knownLanguage) ||
              provider.id === selected),
        )
        .map((provider) => ({
          label: provider.name,
          description:
            provider.id === selected
              ? "Current effective formatter"
              : "Known formatter integration",
          detail: provider.id,
          id: provider.id as string | undefined,
        }));
      choices.unshift({
        label: "Use inherited formatter",
        description: "Remove the formatter saved at this scope",
        detail:
          "Other installed formatters can be configured in the dashboard or VS Code Settings.",
        id: undefined,
      });
      const choice = await vscode.window.showQuickPick(choices, {
        title: `Formatting Controls · Default formatter · ${this.scopeLabel(selection)}`,
        placeHolder: "Choose a known formatter for the active language",
        matchOnDetail: true,
      });
      if (!choice) return;
      this.assertCurrent(revision);
      await write(selection, "editor.defaultFormatter", choice.id);
    } else if (
      typeof action === "number" &&
      Number.isInteger(action) &&
      action >= 0 &&
      action < flags.length
    ) {
      const key = flags[action];
      if (!key) return;
      const selection = this.selection();
      const effective = this.effective();
      const value = own(selection, key) ?? effective.get<boolean>(key, false);
      await write(selection, key, !value);
    } else {
      throw new Error("Unknown formatting control.");
    }
  }
  private scopeLabel(selection: Selection): string {
    return selection.target === vscode.ConfigurationTarget.Global
      ? "User settings"
      : selection.target === vscode.ConfigurationTarget.Workspace
        ? "Workspace"
        : "Workspace folder";
  }
  async open(): Promise<void> {
    const revision = this.revision;
    const choice = await vscode.window.showQuickPick(
      [
        { label: "Change automatic formatting", action: "formatting" },
        { label: "Choose write scope", action: "scope" },
        { label: "Choose language scope", action: "language" },
        { label: "Choose default formatter", action: "formatter" },
      ],
      {
        title: `Formatting · ${this.selection().target === vscode.ConfigurationTarget.Global ? "User" : vscode.ConfigurationTarget[this.selection().target]} · ${this.selection().language ?? "All languages"}`,
      },
    );
    if (choice) await this.control(revision, choice.action);
  }
}
