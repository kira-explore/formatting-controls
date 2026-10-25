import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import {
  correlationId,
  type Provider,
  parseRequest,
  type Request,
  type Response,
  type Scope,
  type Snapshot,
  settingKeys,
} from "../shared/protocol";
import {
  configuration,
  own,
  resetIfUnchanged,
  type Selection,
  setAction,
  write,
} from "./configuration";
import { flags, status } from "./model";

const providers = [
  {
    id: "biomejs.biome",
    name: "Biome",
    formatting: true,
    note: "Formatting and provider-specific source actions; requires project configuration.",
  },
  {
    id: "esbenp.prettier-vscode",
    name: "Prettier",
    formatting: true,
    note: "Formatting; does not provide fix-all code actions.",
  },
  {
    id: "dbaeumer.vscode-eslint",
    name: "ESLint",
    formatting: true,
    note: "Source fixes; formatting requires eslint.format.enable.",
  },
  {
    id: "vscode.typescript-language-features",
    name: "TypeScript / JavaScript",
    formatting: true,
    note: "Built-in language formatting and supported import actions.",
  },
  {
    id: "vscode.json-language-features",
    name: "JSON / JSONC",
    formatting: true,
    note: "Built-in JSON formatting.",
  },
  {
    id: "vscode.html-language-features",
    name: "HTML",
    formatting: true,
    note: "Built-in HTML formatting.",
  },
  {
    id: "vscode.css-language-features",
    name: "CSS / SCSS / Less",
    formatting: true,
    note: "Built-in stylesheet formatting.",
  },
] satisfies Omit<Provider, "installed">[];
export class Dashboard implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private listeners: vscode.Disposable[] = [];
  private revision = 0;
  private navigation = 0;
  private scope: Scope = { target: "user" };
  private active = vscode.window.activeTextEditor?.document;
  private page: "overview" | "welcome" = "overview";
  private queue = Promise.resolve();
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onResponse?: (message: Response) => unknown,
  ) {}
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
  async open(welcome = false): Promise<void> {
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
    const activeUri = this.active?.uri;
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
      ...((this.scope.language ?? this.active?.languageId)
        ? {
            language: (this.scope.language ??
              this.active?.languageId) as string,
          }
        : {}),
    });
    return {
      revision: this.revision,
      navigation: this.navigation,
      scope: this.scope,
      page: this.page,
      activeLanguage:
        this.scope.language ?? this.active?.languageId ?? "All languages",
      resource: selection.uri?.toString() ?? "No active file",
      folders: (vscode.workspace.workspaceFolders ?? []).map((f) => ({
        name: f.name,
        uri: f.uri.toString(),
      })),
      languages,
      settings: settingKeys.map((key) => ({
        key,
        effective: effective.get(key) ?? null,
        owned: own(selection, key) ?? null,
        configured: own(selection, key) !== undefined,
        sources: effective.inspect(key) as unknown as Record<string, unknown>,
      })),
      providers: providers.map((p) => ({
        ...p,
        installed: !!vscode.extensions.getExtension(p.id),
      })),
      status: status(flags.map((k) => effective.get(k, false))),
      hasWorkspace: !!(
        vscode.workspace.workspaceFile ||
        vscode.workspace.workspaceFolders?.length
      ),
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
          await vscode.commands.executeCommand("formattingControls.open");
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
      if (
        request.revision !== this.revision ||
        request.scope.target !== this.scope.target ||
        request.scope.folder !== this.scope.folder ||
        request.scope.language !== this.scope.language
      )
        throw new Error(
          "Settings changed. Review the refreshed values and try again.",
        );
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
