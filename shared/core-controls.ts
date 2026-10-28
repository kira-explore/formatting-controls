/** Private bridge for the isolated VS Code core prototype, not a public VS Code API. */
export const coreCommands = {
  connect: "kiraFormattingControls.prototype.connect",
  update: "kiraFormattingControls.prototype.update",
  disconnect: "kiraFormattingControls.prototype.disconnect",
  snapshot: "formattingControls.core.snapshot",
  action: "formattingControls.core.action",
} as const;

export interface CoreOption {
  id: string;
  label: string;
}
export interface CoreFlag {
  key: "editor.formatOnSave" | "editor.formatOnPaste" | "editor.formatOnType";
  label: string;
  checked: boolean;
  effective: boolean;
  source: string;
  disabled: boolean;
}
export interface CoreState {
  protocol: 1;
  session: string;
  revision: number;
  file: string;
  path: string;
  language: string;
  workspace: string;
  folder: string;
  status: "On" | "Off" | "Mixed";
  destination: string;
  destinations: CoreOption[];
  languageRule: string;
  languages: CoreOption[];
  formatter: string;
  formatters: CoreOption[];
  formatterDisabled: boolean;
  flags: CoreFlag[];
  paused: boolean;
  canPause: boolean;
}
export type CoreAction = {
  session: string;
  revision: number;
} & (
  | { type: "scope" | "language" | "formatter"; value: string }
  | { type: "flag"; key: CoreFlag["key"]; value: boolean }
  | { type: "pause" | "dashboard" | "settings" }
);

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, limit = 4096): value is string =>
  typeof value === "string" && value.length <= limit;
const options = (value: unknown): value is CoreOption[] =>
  Array.isArray(value) &&
  value.length <= 2000 &&
  value.every((v) => object(v) && text(v.id) && text(v.label));

export function isCoreState(value: unknown): value is CoreState {
  if (!object(value)) return false;
  return (
    value.protocol === 1 &&
    text(value.session, 80) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) > 0 &&
    [
      "file",
      "path",
      "language",
      "workspace",
      "folder",
      "destination",
      "languageRule",
      "formatter",
    ].every((key) => text(value[key])) &&
    ["On", "Off", "Mixed"].includes(String(value.status)) &&
    ["destinations", "languages", "formatters"].every((key) =>
      options(value[key]),
    ) &&
    ["paused", "canPause", "formatterDisabled"].every(
      (key) => typeof value[key] === "boolean",
    ) &&
    Array.isArray(value.flags) &&
    value.flags.length === 3 &&
    value.flags.every(
      (flag, index) =>
        object(flag) &&
        flag.key ===
          [
            "editor.formatOnSave",
            "editor.formatOnPaste",
            "editor.formatOnType",
          ][index] &&
        text(flag.label) &&
        text(flag.source) &&
        ["checked", "effective", "disabled"].every(
          (key) => typeof flag[key] === "boolean",
        ),
    )
  );
}

export function isCoreAction(value: unknown): value is CoreAction {
  if (
    !object(value) ||
    !text(value.session, 80) ||
    !Number.isSafeInteger(value.revision)
  )
    return false;
  if (["scope", "language", "formatter"].includes(String(value.type)))
    return text(value.value);
  if (value.type === "flag")
    return (
      [
        "editor.formatOnSave",
        "editor.formatOnPaste",
        "editor.formatOnType",
      ].includes(String(value.key)) && typeof value.value === "boolean"
    );
  return ["pause", "dashboard", "settings"].includes(String(value.type));
}
