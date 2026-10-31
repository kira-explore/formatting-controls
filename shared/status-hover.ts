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
  return `<table width="400"><colgroup><col width="270"><col width="130"></colgroup><tbody>${[
    `<tr><td>${image(art.header)}</td><td align="right"><a href="command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(["editor.formatOn"]))}" title="Open VS Code Settings">${image(art.settings)}</a></td></tr>`,
    fullRow(titled(image(art.context), statusHelp.file)),
    fullRow(image(art.scopes)),
    fullRow(titled(image(art.summary), statusHelp.formatting)),
    fullRow(image(art.formatting)),
    fullRow(image(art.formatter)),
    fullRow(
      image(art.pauseInset) +
        (context.canPause
          ? `<a href="${link("pause")}">${image(art.pause)}</a>`
          : image(art.pause)) +
        image(art.pauseCaption),
    ),
    fullRow(image(art.separator)),
    fullRow(
      `<a href="command:formattingControls.dashboard" title="Open Kira Formatting Controls dashboard">${image(art.dashboard, undefined, "top")}</a>${image(art.footerGap, undefined, "top")}<a href="${issueUrl}" title="Open a new issue on GitHub">${image(art.issue, undefined, "top")}</a>`,
    ),
  ].join("")}</tbody></table>`;
}
