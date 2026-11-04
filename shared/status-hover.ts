import { Buffer } from "node:buffer";
import { type CardTheme, escapeText, statusArtwork } from "./status-artwork";
import { issueUrl, statusHelp } from "./status-help";

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
  paused?: boolean;
  canPause?: boolean;
  revision: number;
}
export function statusHover(
  context: HoverContext,
  theme: CardTheme = "dark",
): string {
  const art = statusArtwork(context, theme);
  const image = (part: typeof art.context, title?: string, align = "middle") =>
    `<img align="${align}" width="${part.width}" height="${part.height}" alt="${escapeText(part.alt)}"${title ? ` title="${escapeText(title)}"` : ""} src="data:image/svg+xml;base64,${Buffer.from(part.svg).toString("base64")}">`;
  const link = (action: string) =>
    `command:formattingControls.statusControl?${encodeURIComponent(JSON.stringify([context.revision, action]))}`;
  const titled = (contents: string, title: string) =>
    contents.replace(
      " src=",
      ` title="${title.split("\n").map(escapeText).join("&#10;")}" src=`,
    );
  const fullRow = (contents: string) =>
    `<tr><td colspan="2">${contents}</td></tr>`;
  const pause = context.canPause
    ? `<a href="${link("pause")}" title="${escapeText(art.pauseCaption.alt)}">${image(art.pause, art.pauseCaption.alt)}</a>`
    : image(art.pause, art.pauseCaption.alt);
  return `<table width="${art.context.width}"><colgroup><col width="${art.header.width}"><col width="${art.context.width - art.header.width}"></colgroup><tbody>${[
    `<tr><td>${image(art.header)}</td><td align="right">${pause}&#160;&#160;<a href="command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(["editor.formatOn"]))}" title="Open VS Code Settings">${image(art.settings)}</a></td></tr>`,
    fullRow(titled(image(art.context), statusHelp.file)),
    fullRow(image(art.scopes)),
    fullRow(image(art.formatter)),
    `<tr><td>${titled(image(art.summary), statusHelp.formatting)}</td><td align="right">${titled(image(art.state), statusHelp.formatting)}</td></tr>`,
    fullRow(image(art.formatting)),
    fullRow(
      `<a href="command:formattingControls.dashboard" title="Open Kira Formatting Controls dashboard">${image(art.dashboard, undefined, "top")}</a>${image(art.footerGap, undefined, "top")}<a href="${issueUrl}" title="Open a new issue on GitHub">${image(art.issue, undefined, "top")}</a>`,
    ),
  ].join("")}</tbody></table>`;
}
