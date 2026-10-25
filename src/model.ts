import { settingKeys } from "../shared/protocol";
export const flags = [
  "editor.formatOnSave",
  "editor.formatOnPaste",
  "editor.formatOnType",
] as const;
export const keys = settingKeys;
export type SettingKey = (typeof keys)[number];
export type ActionValue = "explicit" | "always" | "never";
export type Actions = Record<string, ActionValue | boolean>;
export function status(values: readonly boolean[]): "ON" | "OFF" | "MIXED" {
  return values.every(Boolean) ? "ON" : values.some(Boolean) ? "MIXED" : "OFF";
}
export function updateAction(
  current: unknown,
  key: string,
  value: ActionValue,
): Actions {
  if (!/^source(?:\.[a-zA-Z0-9_-]+)+$/.test(key))
    throw new Error("Use a source action identifier.");
  if (
    current !== undefined &&
    (typeof current !== "object" || current === null || Array.isArray(current))
  )
    throw new Error(
      "Legacy code-action arrays must be migrated in Settings first.",
    );
  return { ...(current as Actions | undefined), [key]: value };
}
export function enabled(value: unknown): boolean {
  return value === true || value === "always" || value === "explicit";
}
