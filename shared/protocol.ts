// Phase 2 contract only; no webview is shipped in Phase 1.
export type Scope = {
  target: "user" | "workspace" | "folder";
  folderUri?: string;
  languageId?: string;
};
export type Request =
  | { id: string; type: "read"; scope: Scope }
  | {
      id: string;
      type: "setBoolean";
      scope: Scope;
      key:
        | "editor.formatOnSave"
        | "editor.formatOnPaste"
        | "editor.formatOnType";
      value: boolean;
    };
export type Response =
  | {
      id: string;
      ok: true;
      revision: number;
      settings: Record<string, unknown>;
    }
  | { id: string; ok: false; error: string };
// Runtime parsing, URI allowlisting, revision checks and message-size limits are
// required before this protocol is connected to a webview in Phase 2.
