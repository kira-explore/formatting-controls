import * as vscode from "vscode";
import type { Scope } from "../shared/protocol";
import { settingSource } from "../shared/setting-source";
import { own, type Selection, write } from "./configuration";
import { flags, status } from "./model";
import { statusTooltip } from "./status-hover";

/** Native summary above the status item; click opens real controls in the Panel. */
export class StatusControls {
  private revision = 0;
  private fingerprint = "";
  private target: vscode.ConfigurationTarget | undefined;
  private languageOnly = false;
  private pending = false;
  private collapsed = false;
  private externalScope: Scope | undefined;
  setScope(scope: Scope): void {
    this.externalScope = scope;
    this.refresh();
  }
  constructor(
    private readonly item: vscode.StatusBarItem,
    private readonly document: () => vscode.TextDocument | undefined,
  ) {
    item.name = "Formatting Controls";
    item.command = "formattingControls.quickControls";
  }
  private selection(): Selection {
    const document = this.document();
    const folder =
      document && vscode.workspace.getWorkspaceFolder(document.uri);
    const hasWorkspace = !!(
      vscode.workspace.workspaceFile ||
      vscode.workspace.workspaceFolders?.length
    );
    if (this.externalScope) {
      const scope = this.externalScope;
      const selectedFolder = vscode.workspace.workspaceFolders?.find(
        (f) => f.uri.toString() === scope.folder,
      );
      const target =
        scope.target === "user"
          ? vscode.ConfigurationTarget.Global
          : scope.target === "workspace" && hasWorkspace
            ? vscode.ConfigurationTarget.Workspace
            : scope.target === "folder" && selectedFolder
              ? vscode.ConfigurationTarget.WorkspaceFolder
              : vscode.ConfigurationTarget.Global;
      const uri =
        target === vscode.ConfigurationTarget.WorkspaceFolder &&
        selectedFolder &&
        folder?.uri.toString() !== selectedFolder.uri.toString()
          ? selectedFolder.uri
          : document?.uri;
      return {
        target,
        ...(uri ? { uri } : {}),
        ...(scope.language ? { language: scope.language } : {}),
      };
    }
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
    const context = {
      file: document
        ? (document.uri.path.split("/").pop() ?? document.fileName)
        : "No active file",
      collapsed: this.collapsed,
      ...(document ? { language: document.languageId } : {}),
      ...(vscode.workspace.name ? { workspace: vscode.workspace.name } : {}),
      ...(folder && (vscode.workspace.workspaceFolders?.length ?? 0) > 1
        ? { folder: folder.name }
        : {}),
      flags: values,
      sources: flags.map((key) => {
        const source = settingSource(
          {
            configured: own(selection, key) !== undefined,
            owned: own(selection, key),
            effective: effective.get(key),
            sources: effective.inspect(key) as unknown as Record<
              string,
              unknown
            >,
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
        return source.override
          ? `${source.label} · ${source.override}`
          : source.label;
      }),
      owned: flags.map((key) => {
        const value = own(selection, key);
        return typeof value === "boolean" ? value : undefined;
      }),
      ...(formatter
        ? {
            formatter:
              typeof displayName === "string" ? displayName : formatter,
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
    if (action === "collapse") {
      this.collapsed = !this.collapsed;
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
        title: "Formatting · Write to",
      });
      if (!choice) return;
      this.assertCurrent(revision);
      this.target = choice.target;
      if (this.externalScope) {
        const folder =
          document && vscode.workspace.getWorkspaceFolder(document.uri);
        this.externalScope = {
          target:
            choice.target === vscode.ConfigurationTarget.Global
              ? "user"
              : choice.target === vscode.ConfigurationTarget.Workspace
                ? "workspace"
                : "folder",
          ...(choice.target === vscode.ConfigurationTarget.WorkspaceFolder &&
          folder
            ? { folder: folder.uri.toString() }
            : {}),
          ...(this.externalScope.language
            ? { language: this.externalScope.language }
            : {}),
        };
      }
    } else if (action === "language") {
      const language = this.document()?.languageId;
      const choice = await vscode.window.showQuickPick(
        language ? ["All languages", language] : ["All languages"],
        { title: "Formatting · Language scope" },
      );
      if (!choice) return;
      this.assertCurrent(revision);
      this.languageOnly = choice !== "All languages";
      if (this.externalScope) {
        this.externalScope = { ...this.externalScope };
        if (this.languageOnly) this.externalScope.language = choice;
        else delete this.externalScope.language;
      }
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
  async open(): Promise<void> {
    const revision = this.revision;
    const choice = await vscode.window.showQuickPick(
      [
        { label: "Toggle format on save", action: 0 },
        { label: "Toggle format on paste", action: 1 },
        { label: "Toggle format on type", action: 2 },
        { label: "Choose write scope", action: "scope" },
        { label: "Choose language scope", action: "language" },
      ],
      {
        title: `Formatting · ${this.selection().target === vscode.ConfigurationTarget.Global ? "User" : vscode.ConfigurationTarget[this.selection().target]} · ${this.selection().language ?? "All languages"}`,
      },
    );
    if (choice) await this.control(revision, choice.action);
  }
}
