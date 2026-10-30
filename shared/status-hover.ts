import { Buffer } from "node:buffer";
import { type CardTheme, escapeText, statusArtwork } from "./status-artwork";

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
export function statusHover(
  context: HoverContext,
  theme: CardTheme = "dark",
): string {
  const art = statusArtwork(context, theme);
  const image = (part: typeof art.context) =>
    `<img width="${part.width}" height="${part.height}" alt="${escapeText(part.alt)}" src="data:image/svg+xml;base64,${Buffer.from(part.svg).toString("base64")}">`;
  const link = (action: string) =>
    `command:formattingControls.statusControl?${encodeURIComponent(JSON.stringify([context.revision, action]))}`;
  const fullRow = (contents: string) =>
    `<tr><td colspan="2">${contents}</td></tr>`;
  return `<table width="440"><tbody>${[
    fullRow(image(art.context)),
    fullRow(`<a href="${link("collapse")}">${image(art.disclosure)}</a>`),
    ...(context.collapsed ? [] : [fullRow(image(art.flags))]),
    fullRow(image(art.formatter)),
    fullRow(
      context.canPause
        ? `<a href="${link("pause")}">${image(art.pause)}</a>`
        : image(art.pause),
    ),
    `<tr><td><a href="command:formattingControls.dashboard">${image(art.dashboard)}</a></td><td><a href="command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify(["editor.formatOn"]))}">${image(art.settings)}</a></td></tr>`,
  ].join("")}</tbody></table>`;
}
