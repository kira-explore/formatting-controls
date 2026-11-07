import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { Finding } from "../shared/diagnostics";
import {
  correlationId,
  type DiagnosticReport,
  type LanguageRule,
  parseRequest,
  type Request,
  type Response,
  type Scope,
  type Snapshot,
  settingKeys,
} from "../shared/protocol";
import { adapters } from "../shared/providers";
import { issueUrl } from "../shared/status-help";
import {
  configuration,
  own,
  resetIfUnchanged,
  type Selection,
  setAction,
  write,
} from "./configuration";
import { createDiagnosticReport } from "./diagnostic-report";
import { flags, status } from "./model";
import { providersFor } from "./providers";
import type { Store, Workflows } from "./workflows";

const diagnosticHistoryKey = "formattingControls.diagnostics.v1";
const diagnosticHistoryLimit = 20;

export class Dashboard implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private listeners: vscode.Disposable[] = [];
  private revision = 0;
  private navigation = 0;
  private scope: Scope = { target: "user" };
  private active = vscode.window.activeTextEditor?.document;
  private page: Snapshot["page"] = "formatting";
  private focusFinding: string | undefined;
  private diagnosticHistory: DiagnosticReport[];
  private queue = Promise.resolve();
  private get activeDocument(): vscode.TextDocument | undefined {
    return this.active?.isClosed ? undefined : this.active;
  }
  private get hasWorkspace(): boolean {
    return !!(
      vscode.workspace.workspaceFile ||
      vscode.workspace.workspaceFolders?.length
    );
  }
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onResponse?: (message: Response) => unknown,
    private readonly workflows?: Workflows,
    private readonly extraFindings: (scope: Scope) => Finding[] = () => [],
    private readonly workspaceState?: Store,
  ) {
    this.diagnosticHistory =
      workspaceState?.get<DiagnosticReport[]>(diagnosticHistoryKey) ?? [];
  }
  private reconcileScope(): void {
    try {
      this.selection(this.scope);
    } catch {
      this.scope = { target: "user" };
      this.revision++;
    }
  }
  private async post(message: Response): Promise<void> {
    if (this.onResponse) await this.onResponse(message);
    await this.panel?.webview.postMessage(message);
  }
  async open(
    welcome = false,
    diagnostics?: {
      finding: string;
      scope: Scope;
      document?: vscode.TextDocument;
    },
  ): Promise<void> {
    if (diagnostics) {
      this.scope = diagnostics.scope;
      this.active = diagnostics.document ?? this.active;
      this.revision++;
    }
    this.reconcileScope();
    this.page = diagnostics
      ? "diagnostics"
      : welcome
        ? "welcome"
        : "formatting";
    this.focusFinding = diagnostics?.finding;
    this.navigation++;
    this.active =
      diagnostics?.document ??
      vscode.window.activeTextEditor?.document ??
      this.active;
    if (this.panel) {
      this.panel.reveal();
      await this.publish();
      return;
    }
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const panel = vscode.window.createWebviewPanel(
      "formattingControls.dashboard",
      "Formatting Controls",
      vscode.ViewColumn.One,
      { enableScripts: true, localResourceRoots: [root] },
    );
    this.panel = panel;
    panel.iconPath = vscode.Uri.joinPath(
      this.extensionUri,
      "assets",
      "icon.png",
    );
    const nonce = randomBytes(24).toString("base64");
    const js = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(root, "dashboard.js"),
    );
    const css = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(root, "dashboard.css"),
    );
    panel.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${panel.webview.cspSource}; font-src ${panel.webview.cspSource}; img-src ${panel.webview.cspSource};"><title>Formatting Controls</title><link rel="stylesheet" href="${css}"></head><body><div id="root"></div><script nonce="${nonce}" type="module" src="${js}"></script></body></html>`;
    this.listeners = [
      panel.webview.onDidReceiveMessage((raw: unknown) => {
        this.queue = this.queue
          .then(() => (this.panel === panel ? this.handle(raw) : undefined))
          .catch(() => undefined);
      }),
      vscode.workspace.onDidChangeConfiguration(() => {
        this.revision++;
        void this.publish();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.scope = { target: "user" };
        this.revision++;
        void this.publish();
      }),
      vscode.window.onDidChangeWindowState(({ focused }) => {
        if (focused) {
          this.revision++;
          void this.publish();
        }
      }),
      vscode.extensions.onDidChange(() => {
        this.revision++;
        void this.publish();
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.active = editor.document;
          this.revision++;
          void this.publish();
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document === this.active) {
          this.revision++;
          void this.publish();
        }
      }),
      vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
        const uri = this.activeDocument?.uri.toString();
        if (!uri) return;
        const showsDocument = ({ input }: vscode.Tab) =>
          input instanceof vscode.TabInputText
            ? input.uri.toString() === uri
            : input instanceof vscode.TabInputTextDiff &&
              (input.original.toString() === uri ||
                input.modified.toString() === uri);
        if (
          closed.some(showsDocument) &&
          !vscode.window.tabGroups.all.some((group) =>
            group.tabs.some(showsDocument),
          )
        ) {
          this.active = undefined;
          this.revision++;
          void this.publish();
        }
      }),
      ...(this.workflows
        ? [
            this.workflows.onDidChange(() => {
              this.revision++;
              void this.publish();
            }),
          ]
        : []),
      panel.onDidDispose(() => {
        this.panel = undefined;
        for (const listener of this.listeners.splice(0)) listener.dispose();
      }),
    ];
  }
  private selection(scope: Scope): Selection {
    const folder = scope.folder
      ? vscode.workspace.workspaceFolders?.find(
          (f) => f.uri.toString() === scope.folder,
        )
      : undefined;
    if (scope.folder && !folder)
      throw new Error("This workspace folder is no longer available.");
    if (scope.target === "folder" && !folder)
      throw new Error("Select a workspace folder before editing.");
    if (
      scope.target !== "user" &&
      !vscode.workspace.workspaceFile &&
      !vscode.workspace.workspaceFolders?.length
    )
      throw new Error("Open a workspace before editing workspace settings.");
    const activeUri = this.activeDocument?.uri;
    const activeFolder =
      activeUri && vscode.workspace.getWorkspaceFolder(activeUri);
    const uri = folder
      ? activeFolder?.uri.toString() === folder.uri.toString()
        ? activeUri
        : folder.uri
      : activeUri;
    return {
      target:
        scope.target === "user"
          ? vscode.ConfigurationTarget.Global
          : scope.target === "workspace"
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.WorkspaceFolder,
      ...(uri ? { uri } : {}),
      ...(scope.language ? { language: scope.language } : {}),
    };
  }
  async snapshot(): Promise<Snapshot> {
    const languages = await vscode.languages.getLanguages();
    const activeDocument = this.activeDocument;
    const language = this.scope.language ?? activeDocument?.languageId;
    const selection = this.selection(this.scope);
    const effective = configuration({
      ...selection,
      ...(language ? { language } : {}),
    });
    const settings = settingKeys.map((key) => {
      const owned = own(selection, key);
      return {
        key,
        effective: effective.get(key) ?? null,
        owned: owned ?? null,
        configured: owned !== undefined,
        sources: effective.inspect(key) as unknown as Record<string, unknown>,
      };
    });
    const detected = providersFor(
      effective,
      language ?? "",
      effective.get("editor.defaultFormatter"),
    );
    const selectedConfiguration = configuration(selection);
    const ids = new Set(
      settingKeys.flatMap(
        (key) => selectedConfiguration.inspect(key)?.languageIds ?? [],
      ),
    );
    const rules: LanguageRule[] = [...ids]
      .sort()
      .map((language) => {
        const config = configuration({ ...selection, language });
        const keys: LanguageRule["keys"] = [],
          sources = new Set<string>();
        for (const key of settingKeys) {
          const i = config.inspect(key);
          if (
            i &&
            (i.globalLanguageValue !== undefined ||
              i.workspaceLanguageValue !== undefined ||
              i.workspaceFolderLanguageValue !== undefined)
          ) {
            keys.push(key);
            if (i.globalLanguageValue !== undefined) sources.add("User");
            if (i.workspaceLanguageValue !== undefined)
              sources.add("Workspace");
            if (i.workspaceFolderLanguageValue !== undefined)
              sources.add("Folder");
          }
        }
        return { language, keys, sources: [...sources] };
      })
      .filter((rule) => rule.keys.length > 0);
    let profiles: Snapshot["profiles"] = [],
      recovery: Snapshot["recovery"] = null,
      workflowError: string | null = null;
    try {
      profiles = this.workflows?.summaries(selection, this.scope) ?? [];
    } catch (error) {
      workflowError = error instanceof Error ? error.message : String(error);
    }
    try {
      recovery = this.workflows?.recovery() ?? null;
    } catch (error) {
      workflowError = [
        workflowError,
        error instanceof Error ? error.message : String(error),
      ]
        .filter(Boolean)
        .join("; ");
    }
    const activeFolder =
      activeDocument && vscode.workspace.getWorkspaceFolder(activeDocument.uri);
    return {
      ...(vscode.env.remoteName ? { remoteName: vscode.env.remoteName } : {}),
      revision: this.revision,
      navigation: this.navigation,
      scope: this.scope,
      page: this.page,
      ...(activeDocument
        ? {
            activeFile: {
              name:
                activeDocument.uri.path.split("/").at(-1) ||
                activeDocument.fileName,
              language: activeDocument.languageId,
              ...(activeFolder ? { folder: activeFolder.name } : {}),
            },
          }
        : {}),
      ...(vscode.workspace.name
        ? { workspaceName: vscode.workspace.name }
        : {}),
      ...(this.focusFinding ? { focusFinding: this.focusFinding } : {}),
      activeLanguage: language ?? "All languages",
      resource: selection.uri?.toString() ?? "No active file",
      folders: (vscode.workspace.workspaceFolders ?? []).map((f) => ({
        name: f.name,
        uri: f.uri.toString(),
      })),
      languages,
      settings,
      providers: detected,
      diagnosticHistory: this.diagnosticHistory,
      rules,
      profiles,
      recovery,
      workflowError,
      status: status(flags.map((k) => effective.get(k, false))),
      hasWorkspace: this.hasWorkspace,
    };
  }
  private async publish(id?: string, message?: string): Promise<void> {
    if (!this.panel && !this.onResponse) return;
    const panel = this.panel;
    try {
      const state = await this.snapshot();
      if (panel !== this.panel) return;
      await this.post({
        type: "state",
        state,
        ...(id ? { id } : {}),
        ...(message ? { message } : {}),
      });
    } catch (error) {
      await this.post({
        type: "error",
        id: id ?? "sync",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  async handle(raw: unknown): Promise<void> {
    let request: Request | undefined;
    try {
      request = parseRequest(raw);
      if (request.type === "ready") {
        this.reconcileScope();
        if (
          this.scope.language &&
          !(await vscode.languages.getLanguages()).includes(this.scope.language)
        ) {
          this.scope = { ...this.scope };
          delete this.scope.language;
          this.revision++;
        }
        await this.publish(request.id);
        return;
      }
      if (
        request.scope.language &&
        !(await vscode.languages.getLanguages()).includes(
          request.scope.language,
        )
      )
        throw new Error("Unknown VS Code language identifier.");
      const selection = this.selection(request.scope);
      if (request.type === "read") {
        this.scope = request.scope;
        this.revision++;
        await this.publish(request.id);
        return;
      }
      if (request.type === "open") {
        if (request.destination === "quickControls")
          await vscode.commands.executeCommand(
            "formattingControls.quickControls",
          );
        else if (request.destination === "settings")
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "@id:editor.formatOnSave",
          );
        else
          await vscode.env.openExternal(
            vscode.Uri.parse(
              request.destination === "issues"
                ? issueUrl
                : request.destination === "github"
                  ? "https://github.com/kira-explore/formatting-controls"
                  : "https://github.com/kira-explore/formatting-controls#readme",
            ),
          );
        await this.publish(request.id);
        return;
      }
      if (request.type === "providerSettings") {
        const providerId = request.provider;
        if (
          !adapters.some((p) => p.id === providerId) &&
          !vscode.extensions.getExtension(providerId)
        )
          throw new Error(
            "No settings adapter is available for this provider.",
          );
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          `@ext:${request.provider}`,
        );
        await this.publish(request.id);
        return;
      }
      if (
        request.revision !== this.revision ||
        request.scope.target !== this.scope.target ||
        request.scope.folder !== this.scope.folder ||
        request.scope.language !== this.scope.language
      )
        throw new Error(
          "Settings changed. Review the refreshed values and try again.",
        );
      if (request.type === "runDiagnostics") {
        const state = await this.snapshot();
        if (state.revision !== request.revision)
          throw new Error(
            "The inspection context changed. Run diagnostics again.",
          );
        const report = createDiagnosticReport(
          state,
          this.extraFindings(state.scope),
        );
        const history = [report, ...this.diagnosticHistory].slice(
          0,
          diagnosticHistoryLimit,
        );
        if (state.hasWorkspace)
          await this.workspaceState?.update(diagnosticHistoryKey, history);
        this.diagnosticHistory = history;
        if (state.navigation === this.navigation) this.focusFinding = undefined;
        this.revision++;
        await this.publish(request.id);
        return;
      }
      if (request.type === "clearDiagnosticHistory") {
        if (this.hasWorkspace)
          await this.workspaceState?.update(diagnosticHistoryKey, undefined);
        this.diagnosticHistory = [];
        this.revision++;
        await this.publish(request.id, "Diagnostic history cleared.");
        return;
      }
      if (request.type === "formattingPause") {
        if (!this.workflows)
          throw new Error("Workflow storage is unavailable.");
        const message =
          this.workflows.recovery()?.kind === "pause"
            ? await this.workflows.resumePause()
            : await this.workflows.pauseFormatting(selection, this.scope);
        this.revision++;
        await this.publish(request.id, message);
        return;
      }
      if (request.type === "profile" || request.type === "pause") {
        if (!this.workflows)
          throw new Error("Workflow storage is unavailable.");
        let message: string;
        if (request.type === "pause") {
          const language =
            this.scope.language ?? this.activeDocument?.languageId;
          message = await this.workflows.pause(
            selection,
            this.scope,
            configuration({
              ...selection,
              ...(language ? { language } : {}),
            }).get("editor.codeActionsOnSave"),
          );
        } else
          switch (request.action) {
            case "save":
              message = await this.workflows.save(
                request.name as string,
                selection,
                this.scope,
              );
              break;
            case "apply":
              message = await this.workflows.apply(
                request.name as string,
                selection,
                this.scope,
              );
              break;
            case "delete":
              message = await this.workflows.remove(
                request.name as string,
                this.scope,
              );
              break;
            case "export":
              message = await this.workflows.export(
                request.name as string,
                selection,
                this.scope,
              );
              break;
            case "import":
              message = await this.workflows.import(this.scope);
              break;
            case "restore":
              message = await this.workflows.restore();
              break;
            case "discard":
              message = await this.workflows.discard();
              break;
          }
        this.revision++;
        await this.publish(request.id, message);
        return;
      }
      if (request.type === "set")
        await write(selection, request.key, request.value);
      if (request.type === "action")
        await setAction(selection, request.action, request.value);
      if (request.type === "reset") {
        const preview = structuredClone(own(selection, request.key));
        if (preview !== undefined) {
          const confirmed = await vscode.window.showWarningMessage(
            `Remove ${request.key} = ${JSON.stringify(preview)} from ${request.scope.target}${request.scope.language ? ` / ${request.scope.language}` : ""}? Inherited settings will apply.`,
            { modal: true },
            "Reset",
          );
          if (!confirmed) {
            await this.publish(request.id, "Reset cancelled.");
            return;
          }
          await resetIfUnchanged(selection, request.key, preview);
        }
      }
      this.revision++;
      await this.publish(request.id, "Saved to the selected scope.");
    } catch (error) {
      await this.post({
        type: "error",
        id: request?.id ?? correlationId(raw) ?? "invalid",
        error: error instanceof Error ? error.message : String(error),
      });
      await this.publish();
    }
  }
  dispose(): void {
    this.panel?.dispose();
    for (const listener of this.listeners.splice(0)) listener.dispose();
  }
}
