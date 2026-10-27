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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
const muted = (value: string) =>
  `<span style="color:var(--vscode-descriptionForeground);">${value}</span>`;
const table = (rows: string) =>
  `<table width="360"><tbody>${rows}</tbody></table>`;
const row = (label: string, value: string, height = 32) =>
  `<tr height="${height}"><td>${label}</td><td align="right">${value}</td></tr>`;
export function statusHover(context: HoverContext): string {
  const link = (action: number | string) =>
    `command:formattingControls.statusControl?${encodeURIComponent(JSON.stringify([context.revision, action]))}`;
  const state = context.flags.every(Boolean)
    ? "On"
    : context.flags.some(Boolean)
      ? "Mixed"
      : "Off";
  const dropdown = (value: string, action: string) =>
    `<a href="${link(action)}" title="Choose ${action === "scope" ? "write scope" : "language scope"} in VS Code picker"><span style="color:var(--vscode-dropdown-foreground);background-color:var(--vscode-dropdown-background);display:inline-block;border-radius:4px;">&nbsp; ${text(value)}&nbsp; ⌄ &nbsp;</span></a>`;
  const triggers = ["Save", "Paste", "Type"]
    .map((label, i) => {
      const owned = context.owned[i];
      const checked = owned ?? context.flags[i];
      const name = `Format on ${label.toLowerCase()}`;
      const title = `Turn ${checked ? "off" : "on"} ${name.toLowerCase()} at ${context.scope} / ${context.languageScope}`;
      const icon = `<span class="codicon codicon-${checked ? "check" : "chrome-maximize"}" style="color:var(--vscode-checkbox-foreground);${checked ? "background-color:var(--vscode-checkbox-background);display:inline-block;border-radius:2px;" : ""}"></span>`;
      const control = `<a href="${link(i)}" title="${text(title)}"><span style="color:var(--vscode-foreground);">${icon}&nbsp; ${name}</span></a>`;
      const note =
        owned === undefined
          ? "Inherited at this scope"
          : owned !== context.flags[i]
            ? `Effective value: ${context.flags[i] ? "On" : "Off"} (override)`
            : "Set at this scope";
      return (
        row(control, muted(checked ? "On" : "Off"), 36) +
        `<tr height="18"><td colspan="2"><small>${muted(note)}</small></td></tr>`
      );
    })
    .join("");
  return [
    table(
      row(
        "<strong>Formatting Controls</strong>",
        `<span style="color:var(--vscode-badge-foreground);background-color:var(--vscode-badge-background);display:inline-block;border-radius:4px;">&nbsp;${state}&nbsp;</span>`,
        30,
      ),
    ),
    `<p>${muted(text(context.file))}${context.language ? `<br>${muted(text(context.language))}` : ""}</p>`,
    "<hr>",
    table(
      row("Write to", dropdown(context.scope, "scope")) +
        row("Language", dropdown(context.languageScope, "language")),
    ),
    "<hr>",
    "<p><strong>Automatic formatting</strong></p>",
    table(triggers),
    "<hr>",
    table(
      row(
        "Default formatter",
        muted(text(context.formatter || "Not configured")),
      ),
    ),
    "<hr>",
    table(
      row(
        '<a href="command:formattingControls.dashboard">Open dashboard ↗</a>',
        `<a href="command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(["editor.formatOn"]))}">VS Code Settings</a>`,
      ),
    ),
  ].join("\n\n");
}
