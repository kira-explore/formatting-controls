export interface HoverContext {
  file: string;
  language?: string;
  workspace?: string;
  folder?: string;
  flags: readonly boolean[];
  owned: readonly (boolean | undefined)[];
  sources?: readonly string[];
  overrides?: readonly (string | undefined)[];
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
  `<table width="440"><tbody>${rows}</tbody></table>`;
const row = (label: string, value: string, height = 32) =>
  `<tr height="${height}"><td>${label}</td><td align="right">${value}</td></tr>`;
// Keep visible notes short enough for one line; the native title retains detail.
const compact = (value: string) => {
  let width = 0;
  let result = "";
  for (const character of value) {
    width += (character.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1;
    if (width > 58) return `${result}…`;
    result += character;
  }
  return result;
};
const note = (value: string) =>
  `<tr height="22"><td width="24"></td><td colspan="2"><small><span title="${text(value)}" style="color:var(--vscode-descriptionForeground);">${value ? text(compact(value)) : "&#160;"}</span></small></td></tr>`;
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
      const checked = context.flags[i];
      const override =
        context.owned[i] !== undefined && context.owned[i] !== context.flags[i]
          ? `${context.overrides?.[i]?.replace(/ · effective:.*$/, "") ?? "Overridden"} · saved: ${context.owned[i] ? "On" : "Off"}`
          : "";
      return (
        `<tr height="28"><td width="24"><span title="Effective value for the active editor">${checked ? "☑" : "☐"}</span></td><td>Format on ${label.toLowerCase()}</td><td align="right">${checked ? "On" : "Off"}</td></tr>` +
        note(override ? `${source} · ${override}` : source)
      );
    })
    .join("");
  return [
    table(
      row(
        "<strong>Formatting Controls</strong>",
        `<span style="background-color:var(--vscode-textCodeBlock-background);display:inline-block;border-radius:4px;">&#160;${context.paused ? "Paused" : state}&#160;</span>`,
      ),
    ),
    "<hr>",
    `<blockquote>ⓘ &#160;<strong>${context.file === "No active file" ? "No active file" : `Active file: ${text(context.file)}`}${context.language ? ` · ${text(context.language)}` : ""}</strong>${context.workspace ? `<br>${muted(`Workspace: ${text(context.workspace)}${context.folder ? ` · Folder: ${text(context.folder)}` : ""}`)}` : ""}</blockquote>`,
    table(
      row(
        "Write to",
        `<a href="${link("scope")}" title="Choose where changes are saved">${text(context.scope)}</a>`,
      ) +
        row(
          "Apply to language",
          `<a href="${link("language")}" title="Choose which language rule to edit">${text(context.languageScope)}</a>`,
        ),
    ),
    "<hr>",
    `<a href="${collapse}">Automatic formatting ${context.collapsed ? "›" : "⌄"}</a>`,
    ...(context.collapsed ? [] : [table(triggers)]),
    "<hr>",
    table(
      row(
        "Default formatter",
        `<a href="${link("formatter")}" title="Choose a default formatter">${text(context.formatter || "Not configured")}</a>`,
      ),
    ),
    "<hr>",
    `<a href="${link("formatting")}">Change formatting…</a> &#160;·&#160; <a href="${link("scope")}">Change scope…</a> &#160;·&#160; ${context.canPause ? `<a href="${link("pause")}" title="${context.paused ? "Restore unchanged formatting preferences" : "Temporarily stop automatic formatting; save actions stay unchanged"}">${context.paused ? "Resume" : "Pause"}</a>` : `<span title="Choose Workspace or Folder to pause">${muted("Pause")}</span>`}`,
    "<hr>",
    table(
      row(
        '<a href="command:formattingControls.dashboard">Open dashboard ↗</a>',
        `<a href="command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(["editor.formatOn"]))}">Settings</a>`,
      ),
    ),
  ].join("\n\n");
}
