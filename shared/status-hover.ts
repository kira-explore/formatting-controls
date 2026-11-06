import { Buffer } from "node:buffer";
import type { Finding } from "./diagnostics";
import { type CardTheme, escapeText, statusArtwork } from "./status-artwork";
import { issueUrl } from "./status-help";

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
  scopeInfo?: string;
  languageInfo?: string;
  formatterInfo?: string;
  diagnostic?: Finding;
  scope: string;
  languageScope: string;
  paused?: boolean;
  canPause?: boolean;
  revision: number;
}
export const statusHover = (
  context: HoverContext,
  theme: CardTheme = "dark",
): string => {
  const art = statusArtwork(context, theme);
  const image = (
    part: typeof art.context,
    title = part.tooltip,
    align = "middle",
  ) =>
    `<img align="${align}" width="${part.width}" height="${part.height}" alt="${escapeText(part.alt)}"${title ? ` title="${title.split("\n").map(escapeText).join("&#10;")}"` : ""} src="data:image/svg+xml;base64,${Buffer.from(part.svg).toString("base64")}">`;
  const link = (action: string) =>
    `command:formattingControls.statusControl?${encodeURIComponent(JSON.stringify([context.revision, action]))}`;
  const fullRow = (contents: string) =>
    `<tr><td colspan="2">${contents}</td></tr>`;
  const pause = context.canPause
    ? `<a href="${link("pause")}">${image(art.pause)}</a>`
    : image(art.pause);
  return `<table width="${art.context.width}"><colgroup><col width="${art.header.width}"><col width="${art.context.width - art.header.width}"></colgroup><tbody>${[
    `<tr><td>${image(art.header)}</td><td align="right"><a href="command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(["editor.formatOn"]))}">${image(art.settings)}</a></td></tr>`,
    fullRow(image(art.context)),
    fullRow(
      `${image(art.scopeLabel)}${image(art.scopeInfo)}${image(art.fieldGap)}${image(art.scopeValue)}`,
    ),
    fullRow(
      `${image(art.languageLabel)}${image(art.languageInfo)}${image(art.fieldGap)}${image(art.languageValue)}`,
    ),
    fullRow(
      `${image(art.formatterLabel)}${image(art.formatterInfo)}${image(art.formatterGap)}${image(art.formatterValue)}`,
    ),
    fullRow(`${image(art.summary)}${image(art.summaryGap)}${pause}`),
    fullRow(image(art.formatting)),
    ...(context.diagnostic
      ? [
          fullRow(image(art.warning)),
          fullRow(`<a href="${link("diagnostics")}">${image(art.review)}</a>`),
        ]
      : []),
    fullRow(
      `<a href="command:formattingControls.dashboard">${image(art.dashboard, undefined, "top")}</a>${image(art.footerGap, undefined, "top")}<a href="${issueUrl}">${image(art.issue, undefined, "top")}</a>`,
    ),
  ].join("")}</tbody></table>`;
};
