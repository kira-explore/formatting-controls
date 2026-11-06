import { diagnose, type Finding } from "./diagnostics";
import type { Provider, Scope, Setting } from "./protocol";

const scopeNames = {
  user: "User settings",
  workspace: "Workspace",
  folder: "Workspace folder",
};

/** Describe provenance, including same-value overrides, without changing settings. */
export const formatterSource = (
  setting: Setting,
  scope: Scope,
  language?: string,
): string => {
  const suffix = language ? ` · ${language}` : "";
  const entries = [
    ["defaultValue", "VS Code default"],
    ["globalValue", "User settings"],
    ["workspaceValue", "Workspace"],
    ["workspaceFolderValue", "Workspace folder"],
    ["defaultLanguageValue", `VS Code default${suffix}`],
    ["globalLanguageValue", `User settings${suffix}`],
    ["workspaceLanguageValue", `Workspace${suffix}`],
    ["workspaceFolderLanguageValue", `Workspace folder${suffix}`],
    ["policyValue", "Organisation policy"],
  ] as const;
  const winner = entries.findLast(
    ([field]) => setting.sources[field] !== undefined,
  );
  const source = winner?.[1] ?? "VS Code default";
  const field = {
    user: scope.language ? "globalLanguageValue" : "globalValue",
    workspace: scope.language ? "workspaceLanguageValue" : "workspaceValue",
    folder: scope.language
      ? "workspaceFolderLanguageValue"
      : "workspaceFolderValue",
  }[scope.target];
  const destination = `${scopeNames[scope.target]}${scope.language ? ` · ${scope.language}` : ""}`;
  if (setting.configured)
    return `Saved in ${destination}.${winner && winner[0] !== field ? `\nOverridden by ${source}.` : ""}`;
  if (source.startsWith("VS Code default")) return `Using ${source}.`;
  const selectedRank = entries.findIndex(([name]) => name === field);
  const sourceRank = entries.findIndex(([name]) => name === winner?.[0]);
  return `${sourceRank > selectedRank ? "Effective from" : "Inherited from"} ${source}.`;
};

/** Presence and explicit provider switches are evidence; language lists are only hints. */
export const formatterWarning = (
  settings: readonly Setting[],
  providers: readonly Provider[],
): Finding | undefined =>
  diagnose(settings, providers).find(
    (finding) =>
      finding.confidence === "verified" &&
      ["formatter-unavailable", "provider-off"].includes(finding.id),
  );
