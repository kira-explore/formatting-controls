import type { Finding } from "./diagnostics";
import type { Adapter } from "./providers";
import type { ProfileSummary, Recovery } from "./workflows";
export const settingKeys = [
  "editor.formatOnSave",
  "editor.formatOnPaste",
  "editor.formatOnType",
  "editor.formatOnSaveMode",
  "editor.defaultFormatter",
  "files.autoSave",
  "files.autoSaveDelay",
  "editor.codeActionsOnSave",
] as const;
export type Key = (typeof settingKeys)[number];
export type Scope = {
  target: "user" | "workspace" | "folder";
  folder?: string;
  language?: string;
};
export type ActionValue = "explicit" | "always" | "never";
export type Operation =
  | { type: "ready" }
  | { type: "read" }
  | {
      type: "set";
      key: Key;
      value: boolean | string | number;
      revision: number;
    }
  | { type: "action"; action: string; value: ActionValue; revision: number }
  | { type: "reset"; key: Key; revision: number }
  | { type: "providerSettings"; provider: string }
  | { type: "pause"; revision: number }
  | { type: "pauseFormatting"; revision: number }
  | {
      type: "profile";
      action:
        | "save"
        | "apply"
        | "delete"
        | "export"
        | "import"
        | "restore"
        | "discard";
      name?: string;
      revision: number;
    }
  | {
      type: "open";
      destination:
        | "settings"
        | "github"
        | "docs"
        | "quickControls"
        | "dashboard";
    };
export type Request = { id: string; scope: Scope } & Operation;
export interface Setting {
  key: Key;
  effective: unknown;
  owned: unknown;
  configured: boolean;
  sources: Record<string, unknown>;
}
export interface Provider extends Adapter {
  installed: boolean;
  enabled: boolean | null;
  formattingEnabled: boolean | null;
  knownLanguage: boolean;
  evidence: { key: string; value: unknown }[];
}
export interface LanguageRule {
  language: string;
  keys: Key[];
  sources: string[];
}
export interface Snapshot {
  remoteName?: string;
  revision: number;
  navigation: number;
  scope: Scope;
  page: "overview" | "welcome";
  activeLanguage: string;
  editorContext?: {
    file: string;
    path: string;
    language: string;
    workspace?: string;
    folder?: string;
  };
  resource: string;
  folders: { name: string; uri: string }[];
  languages: string[];
  settings: Setting[];
  providers: Provider[];
  status: "ON" | "OFF" | "MIXED";
  hasWorkspace: boolean;
  profiles: ProfileSummary[];
  recovery: Recovery | null;
  workflowError: string | null;
  findings: Finding[];
  rules: LanguageRule[];
}
export type Response =
  | { type: "state"; state: Snapshot; id?: string; message?: string }
  | { type: "error"; id: string; error: string };
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const string = (v: unknown, max = 200): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
export const sourceAction = (v: unknown): v is string =>
  string(v) && /^source(?:\.[a-zA-Z0-9_-]+)+$/.test(v);
export function validValue(key: Key, value: unknown): boolean {
  if (
    [
      "editor.formatOnSave",
      "editor.formatOnPaste",
      "editor.formatOnType",
    ].includes(key)
  )
    return typeof value === "boolean";
  if (key === "files.autoSaveDelay")
    return (
      Number.isSafeInteger(value) &&
      typeof value === "number" &&
      value >= 0 &&
      value <= 2147483647
    );
  if (key === "editor.defaultFormatter")
    return string(value) && /^[\w-]+\.[\w.-]+$/.test(value);
  if (key === "editor.formatOnSaveMode")
    return (
      typeof value === "string" &&
      ["file", "modifications", "modificationsIfAvailable"].includes(value)
    );
  if (key === "files.autoSave")
    return (
      typeof value === "string" &&
      ["off", "afterDelay", "onFocusChange", "onWindowChange"].includes(value)
    );
  return false;
}
export function correlationId(raw: unknown): string | undefined {
  return object(raw) && string(raw.id, 80) ? raw.id : undefined;
}
export function parseRequest(raw: unknown): Request {
  if (JSON.stringify(raw)?.length > 16384)
    throw new Error("Request is too large.");
  if (!object(raw) || !string(raw.id, 80) || !object(raw.scope))
    throw new Error("Invalid request envelope.");
  const scope = raw.scope;
  if (
    typeof scope.target !== "string" ||
    !["user", "workspace", "folder"].includes(scope.target) ||
    (scope.language !== undefined && !string(scope.language, 100)) ||
    (scope.folder !== undefined && !string(scope.folder, 4096))
  )
    throw new Error("Invalid settings scope.");
  if (raw.type === "ready" || raw.type === "read") return raw as Request;
  if (
    raw.type === "open" &&
    typeof raw.destination === "string" &&
    ["settings", "github", "docs", "quickControls", "dashboard"].includes(
      String(raw.destination),
    )
  )
    return raw as Request;
  if (
    raw.type === "providerSettings" &&
    string(raw.provider) &&
    /^[\w-]+\.[\w.-]+$/.test(raw.provider)
  )
    return raw as Request;
  if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0)
    throw new Error("Invalid settings revision.");
  if (raw.type === "pause" || raw.type === "pauseFormatting")
    return raw as Request;
  if (
    raw.type === "profile" &&
    typeof raw.action === "string" &&
    [
      "save",
      "apply",
      "delete",
      "export",
      "import",
      "restore",
      "discard",
    ].includes(raw.action)
  ) {
    if (
      ["save", "apply", "delete", "export"].includes(raw.action) &&
      (!string(raw.name, 80) ||
        !raw.name.trim() ||
        [...raw.name].some((c) => c.charCodeAt(0) < 32))
    )
      throw new Error("A profile name of up to 80 characters is required.");
    return raw as Request;
  }
  if (
    raw.type === "action" &&
    sourceAction(raw.action) &&
    typeof raw.value === "string" &&
    ["explicit", "always", "never"].includes(String(raw.value))
  )
    return raw as Request;
  if (
    (raw.type === "set" || raw.type === "reset") &&
    settingKeys.includes(raw.key as Key)
  ) {
    if (scope.language && String(raw.key).startsWith("files."))
      throw new Error(
        "Auto Save is not a language-specific setting. Select All languages.",
      );
    if (raw.type === "reset" || validValue(raw.key as Key, raw.value))
      return raw as Request;
  }
  throw new Error("Unsupported setting or value.");
}
