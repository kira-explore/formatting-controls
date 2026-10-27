import type { Scope, Setting } from "./protocol";

const scopeNames = {
  user: "User settings",
  workspace: "Workspace",
  folder: "Workspace folder",
};
/** VS Code applies regular scopes first, then language scopes, then policy. */
export function settingSource(
  setting: Pick<Setting, "configured" | "owned" | "effective" | "sources">,
  scope: Scope,
  language?: string,
): { label: string; override?: string } {
  let source = "VS Code default";
  for (const [field, name] of [
    ["defaultValue", "VS Code default"],
    ["globalValue", "User settings"],
    ["workspaceValue", "Workspace"],
    ["workspaceFolderValue", "Workspace folder"],
    [
      "defaultLanguageValue",
      `VS Code default${language ? ` · ${language}` : ""}`,
    ],
    ["globalLanguageValue", `User settings${language ? ` · ${language}` : ""}`],
    ["workspaceLanguageValue", `Workspace${language ? ` · ${language}` : ""}`],
    [
      "workspaceFolderLanguageValue",
      `Workspace folder${language ? ` · ${language}` : ""}`,
    ],
    ["policyValue", "Organisation policy"],
  ])
    if (field && name && setting.sources[field] !== undefined) source = name;
  const suffix = scope.language ? ` · ${scope.language}` : "";
  return {
    label: setting.configured
      ? `Saved in ${scopeNames[scope.target]}${suffix}`
      : source.startsWith("VS Code default")
        ? `Using ${source}`
        : `Inherited from ${source}`,
    ...(setting.configured && setting.owned !== setting.effective
      ? {
          override: `Overridden by ${source} · effective: ${setting.effective ? "On" : "Off"}`,
        }
      : {}),
  };
}
