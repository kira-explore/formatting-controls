export interface HoverContext {
  file: string;
  language?: string;
  flags: readonly boolean[];
  owned: readonly (boolean | undefined)[];
  formatter?: string;
  scope: string;
  languageScope: string;
  revision: number;
}
const text = (value: string) =>
  value
    .slice(0, 250)
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("")
    .replace(/[\\`*_{}[\]()<>#+.!|$]/g, "\\$&");
export function statusHover(context: HoverContext): string {
  const link = (action: number | string) =>
    `command:formattingControls.statusControl?${encodeURIComponent(JSON.stringify([context.revision, action]))}`;
  const state = context.flags.every(Boolean)
    ? "On"
    : context.flags.some(Boolean)
      ? "Mixed"
      : "Off";
  return [
    `### $(settings-gear) Formatting Controls · ${state}`,
    `${text(context.file)}${context.language ? ` · ${text(context.language)}` : ""}`,
    "---",
    `Write to: [${text(context.scope)} $(chevron-down)](${link("scope")})  \nLanguage: [${text(context.languageScope)} $(chevron-down)](${link("language")})`,
    "| Formatting | Value | &nbsp;&nbsp; Source |\n|:---|---:|:---|\n" +
      ["Save", "Paste", "Type"]
        .map((label, i) => {
          const owned = context.owned[i];
          const checked = owned ?? context.flags[i];
          const control = `[$(${checked ? "check" : "circle-large-outline"}) ${checked ? "On" : "Off"}](${link(i)})`;
          const note =
            owned === undefined
              ? "Inherited"
              : owned !== context.flags[i]
                ? `Effective ${context.flags[i] ? "On" : "Off"}`
                : "Set here";
          return `| Format on ${label.toLowerCase()} | ${control} | &nbsp;&nbsp; ${note} |`;
        })
        .join("\n"),
    `**Default formatter:** ${text(context.formatter || "Not configured")}`,
    "---",
    `[Open dashboard $(link-external)](command:formattingControls.dashboard)  ·  [VS Code Settings](command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(["editor.formatOn"]))})`,
  ].join("\n\n");
}
