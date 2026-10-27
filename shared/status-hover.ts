export interface HoverContext {
  file: string;
  language?: string;
  workspace?: string;
  folder?: string;
  flags: readonly boolean[];
  owned: readonly (boolean | undefined)[];
  sources?: readonly string[];
  formatter?: string;
  scope: string;
  languageScope: string;
  collapsed?: boolean;
  paused?: boolean;
  canPause?: boolean;
  revision: number;
}
const text = (value: string) =>
  value
    .slice(0, 250)
    .split("")
    .map((character) => (character.charCodeAt(0) < 32 ? " " : character))
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const muted = (value: string) =>
  `<span style="color:var(--vscode-descriptionForeground);">${value}</span>`;
const table = (rows: string) =>
  `<table width="400"><tbody>${rows}</tbody></table>`;
const row = (label: string, value: string, height = 32) =>
  `<tr height="${height}"><td>${label}</td><td align="right">${value}</td></tr>`;
export function statusHover(context: HoverContext): string {
  const state = context.flags.every(Boolean)
    ? "On"
    : context.flags.some(Boolean)
      ? "Mixed"
      : "Off";
  const link = (action: string | number) =>
    `command:formattingControls.statusControl?${encodeURIComponent(JSON.stringify([context.revision, action]))}`;
  const collapse = link("collapse");
  const triggers = ["Save", "Paste", "Type"]
    .map((label, i) => {
      const source =
        context.sources?.[i] ??
        (context.owned[i] === undefined
          ? "Using VS Code default"
          : `Saved in ${context.scope}`);
      const checked = context.owned[i] ?? context.flags[i];
      const override =
        context.owned[i] !== undefined && context.owned[i] !== context.flags[i]
          ? ` · Effective: ${context.flags[i] ? "On" : "Off"}`
          : "";
      return (
        row(
          `Format on ${label.toLowerCase()}`,
          `<a href="${link(i)}" title="Turn ${checked ? "off" : "on"} format on ${label.toLowerCase()} at ${text(context.scope)} / ${text(context.languageScope)}">${checked ? "On" : "Off"}</a>`,
        ) +
        `<tr height="22"><td colspan="2"><small>${muted(text(source + override))}</small></td></tr>`
      );
    })
    .join("");
  return [
    table(row("Formatting Controls", `<code>${state}</code>`)),
    "<hr>",
    `<blockquote>Active file: ${text(context.file)}${context.language ? ` · ${text(context.language)}` : ""}${context.workspace ? `<br>${muted(`Workspace: ${text(context.workspace)}${context.folder ? ` · Folder: ${text(context.folder)}` : ""}`)}` : ""}</blockquote>`,
    table(
      row(
        "Write to",
        `<a href="${link("scope")}" title="Choose write destination in the native picker">${text(context.scope)} ⌄</a>`,
      ) +
        row(
          "Apply to language",
          `<a href="${link("language")}" title="Choose language rule in the native picker">${text(context.languageScope)} ⌄</a>`,
        ),
    ),
    "<hr>",
    `<a href="${collapse}">Automatic formatting ${context.collapsed ? "›" : "⌄"}</a>`,
    ...(context.collapsed ? [] : [table(triggers)]),
    "<hr>",
    table(
      row(
        "Default formatter",
        muted(text(context.formatter || "Not configured")),
      ),
    ),
    "<hr>",
    `${context.canPause ? `<a href="${link("pause")}">${context.paused ? "Resume" : "Pause"}</a>` : muted("Pause")} &nbsp; ${muted(context.paused ? "Restore unchanged formatting preferences" : context.canPause ? "Temporarily stop automatic formatting" : "Choose Workspace or Folder to pause")}`,
    "<hr>",
    table(
      row(
        '<a href="command:formattingControls.dashboard">Open dashboard ↗</a>',
        `<a href="command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(["editor.formatOn"]))}">Settings</a>`,
      ),
    ),
  ].join("\n\n");
}
