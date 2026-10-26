export type QuickTab = "formatting" | "actions";
export const quickTab = (value: unknown): QuickTab =>
  value === "actions" ? "actions" : "formatting";
export interface HoverContext {
  file: string;
  language?: string;
  flags: readonly boolean[];
  formatter?: string;
  actions: unknown;
}
const text = (value: string) =>
  value
    .slice(0, 250)
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("")
    .replace(/[\\`*_{}[\]()<>#+.!|$]/g, "\\$&");
export function saveActions(value: unknown): [string, unknown][] {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value)
        .filter(([id]) => /^source(?:\.[\w-]+)+$/.test(id))
        .sort(([a], [b]) => a.localeCompare(b))
    : [];
}
export const actionEnabled = (value: unknown): boolean =>
  value === true || value === "explicit" || value === "always";
export function statusHover(context: HoverContext): string {
  const configured = saveActions(context.actions);
  const active = configured.filter(([, value]) => actionEnabled(value)).length;
  const link = (tab: QuickTab) =>
    `command:formattingControls.quickControls?${encodeURIComponent(JSON.stringify([tab]))}`;
  const state = context.flags.every(Boolean)
    ? "On"
    : context.flags.some(Boolean)
      ? "Mixed"
      : "Off";
  return [
    `### $(settings-gear) Formatting Controls · ${state}`,
    `${text(context.file)}${context.language ? ` · ${text(context.language)}` : ""}`,
    `[Formatting](${link("formatting")})  ·  [Save actions (${active})](${link("actions")})`,
    "| Formatting trigger | Effective value |\n|:---|---:|\n" +
      ["Save", "Paste", "Type"]
        .map(
          (label, i) =>
            `| Format on ${label.toLowerCase()} | ${context.flags[i] ? "On" : "Off"} |`,
        )
        .join("\n"),
    `**Default formatter:** ${text(context.formatter || "Not configured")}`,
    `**Save actions:** ${active} configured to run. Separate from formatting; providers determine execution.`,
    Array.isArray(context.actions)
      ? "Legacy save-action list: migrate it in VS Code Settings before editing."
      : "",
    `[Open quick controls](${link("formatting")})  ·  [Open dashboard](command:formattingControls.dashboard)`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
