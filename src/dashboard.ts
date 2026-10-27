import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { diagnose } from "../shared/diagnostics";
import {
  correlationId,
  type LanguageRule,
  parseRequest,
  type Request,
  type Response,
  type Scope,
  type Snapshot,
  settingKeys,
} from "../shared/protocol";
import { adapters } from "../shared/providers";
import {
  configuration,
  own,
  resetIfUnchanged,
  type Selection,
  setAction,
  write,
} from "./configuration";
import { flags, status } from "./model";
import { providersFor } from "./providers";
import type { Workflows } from "./workflows";

export class Dashboard
  implements vscode.Disposable, vscode.WebviewViewProvider
{
  private panel: vscode.WebviewPanel | undefined;
  private view: vscode.WebviewView | undefined;
  private controlsInitialized = false;
  private readonly scopeChanged = new vscode.EventEmitter<Scope>();
  readonly onDidChangeScope = this.scopeChanged.event;
  private get webview(): vscode.Webview | undefined {
    return this.panel?.webview ?? this.view?.webview;
  }
  private listeners: vscode.Disposable[] = [];
  private revision = 0;
  private navigation = 0;
  private scope: Scope = { target: "user" };
  private active = vscode.window.activeTextEditor?.document;
  private get document(): vscode.TextDocument | undefined {
    return this.active?.isClosed ? undefined : this.active;
  }
  private page: "overview" | "welcome" = "overview";
  private queue = Promise.resolve();
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onResponse?: (message: Response) => unknown,
    private readonly workflows?: Workflows,
    private readonly mode: "dashboard" | "controls" = "dashboard",
  ) {}
  private reconcileScope(): void {
    try {
      this.selection(this.scope);
    } catch {
      this.scope = { target: "user" };
      this.scopeChanged.fire(this.scope);
      this.revision++;
    }
  }
  private async post(message: Response): Promise<void> {
    if (this.onResponse) await this.onResponse(message);
    await this.webview?.postMessage(message);
  }
  async open(welcome = false): Promise<void> {
    if (this.mode === "controls") {
      await vscode.commands.executeCommand("formattingControls.controls.focus");
      this.view?.show(false);
      return;
    }
    this.reconcileScope();
    this.page = welcome ? "welcome" : "overview";
    this.navigation++;
    this.active = vscode.window.activeTextEditor?.document ?? this.active;
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
    this.bind(panel.webview, panel.onDidDispose);
  }
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    this.active = vscode.window.activeTextEditor?.document ?? this.active;
    const folder =
      this.document && vscode.workspace.getWorkspaceFolder(this.document.uri);
    if (!this.controlsInitialized) {
      this.scope =
        vscode.workspace.workspaceFile ||
        vscode.workspace.workspaceFolders?.length
          ? { target: "workspace" }
          : { target: "user" };
      if (folder && (vscode.workspace.workspaceFolders?.length ?? 0) > 1)
        this.scope = { target: "folder", folder: folder.uri.toString() };
      this.controlsInitialized = true;
    }
    this.reconcileScope();
    this.scopeChanged.fire(this.scope);
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    view.webview.options = { enableScripts: true, localResourceRoots: [root] };
    this.bind(view.webview, view.onDidDispose);
    this.listeners.push(
      view.onDidChangeVisibility(() => {
        if (view.visible) {
          this.reconcileScope();
          void this.publish();
        }
      }),
    );
  }
  private bind(
    webview: vscode.Webview,
    onDidDispose: vscode.Event<void>,
  ): void {
    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const nonce = randomBytes(24).toString("base64");
    const js = webview.asWebviewUri(vscode.Uri.joinPath(root, "dashboard.js"));
    const css = webview.asWebviewUri(
      vscode.Uri.joinPath(root, "dashboard.css"),
    );
    webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource};"><title>Formatting Controls</title><link rel="stylesheet" href="${css}"></head><body data-surface="${this.mode}"><div id="root"></div><script nonce="${nonce}" type="module" src="${js}"></script></body></html>`;
    this.listeners = [
      webview.onDidReceiveMessage((raw: unknown) => {
        this.queue = this.queue
          .then(() => (this.webview === webview ? this.handle(raw) : undefined))
          .catch(() => undefined);
      }),
      vscode.workspace.onDidChangeConfiguration(() => {
        this.revision++;
        void this.publish();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.reconcileScope();
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
        if (editor && editor.document.uri.scheme !== "vscode-userdata") {
          this.active = editor.document;
          this.revision++;
          void this.publish();
        }
      }),
      vscode.workspace.onDidOpenTextDocument((document) => {
        if (this.active?.uri.toString() === document.uri.toString()) {
          this.active = document;
          this.revision++;
          void this.publish();
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        if (document === this.active) {
          this.reconcileScope();
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
      onDidDispose(() => {
        this.panel = undefined;
        this.view = undefined;
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
    const activeUri = this.document?.uri;
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
    const selection = this.selection(this.scope);
    const effective = configuration({
      ...selection,
      ...((this.scope.language ?? this.document?.languageId)
        ? {
            language: (this.scope.language ??
              this.document?.languageId) as string,
          }
        : {}),
    });
    const settings = settingKeys.map((key) => ({
      key,
      effective: effective.get(key) ?? null,
      owned: own(selection, key) ?? null,
      configured: own(selection, key) !== undefined,
      sources: effective.inspect(key) as unknown as Record<string, unknown>,
    }));
    const detected = providersFor(
      effective,
      this.scope.language ?? this.document?.languageId ?? "",
      effective.get("editor.defaultFormatter"),
    );
    const ids = new Set(
      settingKeys.flatMap(
        (key) => configuration(selection).inspect(key)?.languageIds ?? [],
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
    return {
      ...(vscode.env.remoteName ? { remoteName: vscode.env.remoteName } : {}),
      ...(this.document
        ? {
            editorContext: {
              file:
                this.document.uri.path.split("/").pop() ??
                this.document.fileName,
              path: vscode.workspace.asRelativePath(this.document.uri),
              language: this.document.languageId,
              ...(vscode.workspace.name
                ? { workspace: vscode.workspace.name }
                : {}),
              ...((vscode.workspace.workspaceFolders?.length ?? 0) > 1 &&
              vscode.workspace.getWorkspaceFolder(this.document.uri)
                ? {
                    folder: vscode.workspace.getWorkspaceFolder(
                      this.document.uri,
                    )?.name as string,
                  }
                : {}),
            },
          }
        : {}),
      revision: this.revision,
      navigation: this.navigation,
      scope: this.scope,
      page: this.page,
      activeLanguage:
        this.scope.language ?? this.document?.languageId ?? "All languages",
      resource: selection.uri?.toString() ?? "No active file",
      folders: (vscode.workspace.workspaceFolders ?? []).map((f) => ({
        name: f.name,
        uri: f.uri.toString(),
      })),
      languages,
      settings,
      providers: detected,
      findings: diagnose(settings, detected),
      rules,
      profiles,
      recovery,
      workflowError,
      status: status(flags.map((k) => effective.get(k, false))),
      hasWorkspace: !!(
        vscode.workspace.workspaceFile ||
        vscode.workspace.workspaceFolders?.length
      ),
    };
  }
  private async publish(id?: string, message?: string): Promise<void> {
    if (!this.webview && !this.onResponse) return;
    const webview = this.webview;
    try {
      const state = await this.snapshot();
      if (webview !== this.webview) return;
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
        this.scopeChanged.fire(this.scope);
        this.revision++;
        await this.publish(request.id);
        return;
      }
      if (request.type === "open") {
        if (request.destination === "quickControls")
          await vscode.commands.executeCommand(
            "formattingControls.quickControls",
          );
        else if (request.destination === "dashboard")
          await vscode.commands.executeCommand("formattingControls.dashboard");
        else if (request.destination === "settings")
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "@id:editor.formatOnSave",
          );
        else
          await vscode.env.openExternal(
            vscode.Uri.parse(
              request.destination === "github"
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
      if (
        request.type === "profile" ||
        request.type === "pause" ||
        request.type === "pauseFormatting"
      ) {
        if (!this.workflows)
          throw new Error("Workflow storage is unavailable.");
        let message: string;
        if (request.type === "pauseFormatting") {
          message = await this.workflows.pauseFormatting(selection, this.scope);
        } else if (request.type === "pause") {
          const language = this.scope.language ?? this.document?.languageId;
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
    this.scopeChanged.dispose();
    this.panel?.dispose();
    this.view = undefined;
    for (const listener of this.listeners.splice(0)) listener.dispose();
  }
}
