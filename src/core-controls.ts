import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import {
  type CoreAction,
  type CoreOption,
  type CoreState,
  coreCommands,
  isCoreAction,
} from "../shared/core-controls";
import { settingSource } from "../shared/setting-source";
import { own, resetIfUnchanged, type Selection, write } from "./configuration";
import { flags } from "./model";
import { providersFor } from "./providers";
import type { Workflows } from "./workflows";

function languageName(id: string): string {
  const names: Record<string, string> = {
    typescript: "TypeScript",
    typescriptreact: "TypeScript React",
    javascript: "JavaScript",
    javascriptreact: "JavaScript React",
    json: "JSON",
    jsonc: "JSON with Comments",
    plaintext: "Plain Text",
    markdown: "Markdown",
    python: "Python",
    css: "CSS",
    html: "HTML",
  };
  return names[id] ?? id;
}

/** Settings remain in the extension host; only the custom build owns the DOM. */
export class CoreControls implements vscode.Disposable {
  private readonly session = randomUUID();
  private revision = 0;
  private fingerprint = "";
  private destination: "user" | "workspace" | "folder" | undefined;
  private languageRule = "";
  private connected = false;
  private disposed = false;
  private pending = false;
  private languages: CoreOption[] = [];
  private readonly listeners: vscode.Disposable[];
  constructor(
    private readonly document: () => vscode.TextDocument | undefined,
    private readonly workflows: Workflows,
    private readonly onConnected: (connected: boolean) => void,
  ) {
    this.listeners = [
      vscode.commands.registerCommand(coreCommands.snapshot, () =>
        this.snapshot(),
      ),
      vscode.commands.registerCommand(coreCommands.action, (action: unknown) =>
        this.act(action),
      ),
    ];
  }
  async connect(): Promise<void> {
    const commands = await vscode.commands.getCommands(true);
    if (this.disposed || !commands.includes(coreCommands.connect)) return;
    this.languages = (await vscode.languages.getLanguages())
      .sort()
      .map((id) => ({ id, label: languageName(id) }));
    this.connected =
      (await vscode.commands.executeCommand<boolean>(coreCommands.connect)) ===
      true;
    if (this.disposed) {
      this.dispose();
      return;
    }
    this.onConnected(this.connected);
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
      this.destination ??
      (folder ? "folder" : hasWorkspace ? "workspace" : "user");
    return {
      target:
        target === "folder" && folder
          ? vscode.ConfigurationTarget.WorkspaceFolder
          : target !== "user" && hasWorkspace
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global,
      ...(document ? { uri: document.uri } : {}),
      ...(this.languageRule ? { language: this.languageRule } : {}),
    };
  }
  snapshot(): CoreState {
    const document = this.document();
    const selection = this.selection();
    const folder =
      document && vscode.workspace.getWorkspaceFolder(document.uri);
    const hasWorkspace = !!(
      vscode.workspace.workspaceFile ||
      vscode.workspace.workspaceFolders?.length
    );
    const effective = vscode.workspace.getConfiguration(
      undefined,
      document
        ? {
            uri: document.uri,
            languageId: selection.language ?? document.languageId,
          }
        : selection.language
          ? { languageId: selection.language }
          : undefined,
    );
    const scope = {
      target:
        selection.target === vscode.ConfigurationTarget.Global
          ? ("user" as const)
          : selection.target === vscode.ConfigurationTarget.Workspace
            ? ("workspace" as const)
            : ("folder" as const),
      ...(selection.language ? { language: selection.language } : {}),
    };
    const labels = ["Format on save", "Format on paste", "Format on type"];
    const values = flags.map((key, index) => {
      const owned = own(selection, key);
      const value = effective.get<boolean>(key, false);
      const sources = effective.inspect(key) as unknown as Record<
        string,
        unknown
      >;
      const source = settingSource(
        {
          configured: owned !== undefined,
          owned,
          effective: value,
          sources: sources ?? {},
        },
        scope,
        selection.language ?? document?.languageId,
      );
      return {
        key,
        label: labels[index] ?? key,
        checked: typeof owned === "boolean" ? owned : value,
        effective: value,
        source: source.override
          ? `${source.label} · ${source.override}`
          : source.label,
        disabled: sources?.policyValue !== undefined,
      };
    });
    const configured = effective.get<string>("editor.defaultFormatter", "");
    const ownedFormatter = own(selection, "editor.defaultFormatter");
    const providers = providersFor(
      effective,
      selection.language ?? document?.languageId ?? "",
      configured,
    );
    const display = (id: string) =>
      providers.find((p) => p.id === id)?.name ??
      vscode.extensions.getExtension(id)?.packageJSON.displayName ??
      id;
    const formatters = [
      {
        id: "",
        label:
          configured && ownedFormatter === undefined
            ? `${display(configured)} (inherited)`
            : "Use inherited formatter",
      },
      ...providers
        .filter(
          (p) =>
            (p.installed && p.formatting && p.knownLanguage) ||
            p.id === configured,
        )
        .map((p) => ({ id: p.id, label: p.name })),
    ];
    if (
      typeof ownedFormatter === "string" &&
      !formatters.some((p) => p.id === ownedFormatter)
    )
      formatters.push({ id: ownedFormatter, label: display(ownedFormatter) });
    let paused = false;
    try {
      paused = this.workflows.recovery()?.kind === "pause";
    } catch {
      /* Recovery is reported in the dashboard. */
    }
    const context = {
      protocol: 1 as const,
      session: this.session,
      file: document
        ? (document.uri.path.split("/").pop() ?? document.fileName)
        : "No active file",
      path: document
        ? vscode.workspace.asRelativePath(document.uri, false)
        : "",
      language: document ? languageName(document.languageId) : "",
      workspace: vscode.workspace.name ?? "",
      folder:
        (vscode.workspace.workspaceFolders?.length ?? 0) > 1
          ? (folder?.name ?? "")
          : "",
      status: values.every((v) => v.effective)
        ? ("On" as const)
        : values.some((v) => v.effective)
          ? ("Mixed" as const)
          : ("Off" as const),
      destination: scope.target,
      destinations: [
        { id: "user", label: "User" },
        ...(hasWorkspace ? [{ id: "workspace", label: "Workspace" }] : []),
        ...(folder
          ? [{ id: "folder", label: `Workspace folder: ${folder.name}` }]
          : []),
      ],
      languageRule: this.languageRule,
      languages: [
        { id: "", label: "All languages" },
        ...(this.languages.length
          ? this.languages
          : document
            ? [
                {
                  id: document.languageId,
                  label: languageName(document.languageId),
                },
              ]
            : []),
      ],
      formatter: typeof ownedFormatter === "string" ? ownedFormatter : "",
      formatters,
      formatterDisabled:
        (
          effective.inspect("editor.defaultFormatter") as unknown as {
            policyValue?: string;
          }
        )?.policyValue !== undefined,
      flags: values,
      paused,
      canPause:
        paused || selection.target !== vscode.ConfigurationTarget.Global,
    };
    const fingerprint = JSON.stringify({
      context,
      uri: document?.uri.toString(),
      folders: vscode.workspace.workspaceFolders?.map((f) => f.uri.toString()),
    });
    if (fingerprint !== this.fingerprint) {
      this.fingerprint = fingerprint;
      this.revision++;
    }
    return { ...context, revision: this.revision };
  }
  refresh(): void {
    if (!this.connected || this.disposed) return;
    void vscode.commands
      .executeCommand(coreCommands.update, this.snapshot())
      .then(undefined, () => {
        this.connected = false;
        this.onConnected(false);
      });
  }
  private async act(raw: unknown): Promise<CoreState> {
    if (!isCoreAction(raw)) throw new Error("Invalid core control action.");
    const state = this.snapshot();
    if (raw.session !== state.session || raw.revision !== state.revision)
      throw new Error(
        "Settings or editor changed. Review the updated card and try again.",
      );
    if (this.pending)
      throw new Error("Finish the current formatting action first.");
    this.pending = true;
    try {
      await this.apply(raw, state);
    } finally {
      this.pending = false;
      this.refresh();
    }
    return this.snapshot();
  }
  private async apply(action: CoreAction, state: CoreState): Promise<void> {
    const selection = this.selection();
    if (action.type === "scope") {
      if (!state.destinations.some((option) => option.id === action.value))
        throw new Error("That settings destination is unavailable.");
      this.destination = action.value as "user" | "workspace" | "folder";
    } else if (action.type === "language") {
      if (!state.languages.some((option) => option.id === action.value))
        throw new Error("That language rule is unavailable.");
      this.languageRule = action.value;
    } else if (action.type === "flag") {
      if (state.flags.find((flag) => flag.key === action.key)?.disabled)
        throw new Error("This setting is managed by policy.");
      await write(selection, action.key, action.value);
    } else if (action.type === "formatter") {
      if (
        state.formatterDisabled ||
        !state.formatters.some((option) => option.id === action.value)
      )
        throw new Error("That formatter is unavailable.");
      if (action.value)
        await write(selection, "editor.defaultFormatter", action.value);
      else
        await resetIfUnchanged(
          selection,
          "editor.defaultFormatter",
          own(selection, "editor.defaultFormatter"),
        );
    } else if (action.type === "pause") {
      if (!state.canPause)
        throw new Error("Choose Workspace or Folder to pause.");
      if (state.paused) await this.workflows.restore();
      else {
        const folder =
          selection.uri && vscode.workspace.getWorkspaceFolder(selection.uri);
        if (state.destination === "folder" && !folder)
          throw new Error("The selected folder is unavailable.");
        await this.workflows.pauseFormatting(selection, {
          target: state.destination as "user" | "workspace" | "folder",
          ...(state.destination === "folder" && folder
            ? { folder: folder.uri.toString() }
            : {}),
          ...(selection.language ? { language: selection.language } : {}),
        });
      }
    } else if (action.type === "dashboard")
      await vscode.commands.executeCommand("formattingControls.dashboard");
    else if (action.type === "settings")
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:rajudhami.formatting-controls",
      );
  }
  dispose(): void {
    this.disposed = true;
    for (const listener of this.listeners.splice(0)) listener.dispose();
    if (this.connected)
      void vscode.commands
        .executeCommand(coreCommands.disconnect, this.session)
        .then(undefined, () => undefined);
    this.connected = false;
  }
}
