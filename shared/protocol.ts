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
  | { type: "read" }
  | {
      type: "set";
      key: Key;
      value: boolean | string | number;
      revision: number;
    }
  | { type: "action"; action: string; value: ActionValue; revision: number }
  | { type: "reset"; key: Key; revision: number }
  | {
      type: "open";
      destination: "settings" | "github" | "docs" | "quickControls";
    };
export type Request = { id: string; scope: Scope } & Operation;
export interface Setting {
  key: Key;
  effective: unknown;
  owned: unknown;
  configured: boolean;
  sources: Record<string, unknown>;
}
export interface Provider {
  id: string;
  name: string;
  installed: boolean;
  formatting: boolean;
  note: string;
}
export interface Snapshot {
  revision: number;
  navigation: number;
  scope: Scope;
  page: "overview" | "welcome";
  activeLanguage: string;
  resource: string;
  folders: { name: string; uri: string }[];
  languages: string[];
  settings: Setting[];
  providers: Provider[];
  status: "ON" | "OFF" | "MIXED";
  hasWorkspace: boolean;
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
  if (raw.type === "read") return raw as Request;
  if (
    raw.type === "open" &&
    typeof raw.destination === "string" &&
    ["settings", "github", "docs", "quickControls"].includes(
      String(raw.destination),
    )
  )
    return raw as Request;
  if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0)
    throw new Error("Invalid settings revision.");
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
