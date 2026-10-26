export interface HoverContext {
  file: string;
  language?: string;
  flags: readonly boolean[];
  formatter?: string;
}
const text = (value: string) =>
  value
    .slice(0, 250)
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("")
    .replace(/[\\`*_{}[\]()<>#+.!|$]/g, "\\$&");
export function statusHover(context: HoverContext): string {
  const state = context.flags.every(Boolean)
    ? "On"
    : context.flags.some(Boolean)
      ? "Mixed"
      : "Off";
  return [
    `### $(settings-gear) Formatting Controls · ${state}`,
    `${text(context.file)}${context.language ? ` · ${text(context.language)}` : ""}`,
    ...["Save", "Paste", "Type"].map(
      (label, i) =>
        `Format on ${label.toLowerCase()}: **${context.flags[i] ? "On" : "Off"}**`,
    ),
    `**Default formatter:** ${text(context.formatter || "Not configured")}`,
    "[Open sidebar controls](command:formattingControls.quickControls) · [Open dashboard](command:formattingControls.dashboard)",
  ].join("\n\n");
}
