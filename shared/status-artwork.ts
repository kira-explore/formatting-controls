import type { HoverContext } from "./status-hover";

export const escapeText = (value: string): string =>
  value
    .slice(0, 500)
    .toWellFormed()
    .split("")
    .map((character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        ? " "
        : character,
    )
    .join("")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export type CardTheme = "dark" | "light" | "contrast" | "contrast-light";
const palettes = {
  dark: {
    fg: "#bfbfbf",
    muted: "#8c8c8c",
    line: "#2b2b2c",
    accent: "#47a1c7",
    focus: "#347490",
    info: "#22262a",
    input: "#181a1b",
    border: "#333536",
    checkbox: "#252526",
    checkboxBorder: "#707070",
  },
  light: {
    fg: "#242424",
    muted: "#555f6c",
    line: "#cccccc",
    accent: "#0070a8",
    focus: "#0070a8",
    info: "#eaf4fa",
    input: "#ffffff",
    border: "#929292",
    checkbox: "#ffffff",
    checkboxBorder: "#929292",
  },
  contrast: {
    fg: "#ffffff",
    muted: "#ffffff",
    line: "#ffffff",
    accent: "#5cdeff",
    focus: "#5cdeff",
    info: "#000000",
    input: "#000000",
    border: "#ffffff",
    checkbox: "#000000",
    checkboxBorder: "#ffffff",
  },
  "contrast-light": {
    fg: "#000000",
    muted: "#292929",
    line: "#000000",
    accent: "#004fa3",
    focus: "#004fa3",
    info: "#ffffff",
    input: "#ffffff",
    border: "#000000",
    checkbox: "#ffffff",
    checkboxBorder: "#000000",
  },
} as const;

const shortened = (value: string, limit: number): string => {
  let width = 0;
  let result = "";
  for (const character of value) {
    width += (character.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1;
    if (width > limit - 1) return `${result}…`;
    result += character;
  }
  return result;
};
const languageName = (id: string): string =>
  ({
    typescript: "TypeScript",
    javascript: "JavaScript",
    typescriptreact: "TypeScript React",
    javascriptreact: "JavaScript React",
    json: "JSON",
    jsonc: "JSON with Comments",
    markdown: "Markdown",
    python: "Python",
  })[id] ?? id;

/** Locally generated, inert SVG artwork. No scripts, external assets or embedded HTML. */
export function statusArtwork(
  context: HoverContext,
  theme: CardTheme = "dark",
) {
  const p = palettes[theme];
  const formattingHeight = Math.round(
    Math.max(
      0,
      Math.min(138, context.formattingHeight ?? (context.collapsed ? 0 : 138)),
    ),
  );
  const text = (
    x: number,
    y: number,
    value: string,
    size = 12,
    color: string = p.fg,
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${escapeText(value)}</text>`;
  const line = (y: number) => `<path d="M5 ${y}H365" stroke="${p.line}"/>`;
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    stroke: string = p.border,
    fill: string = p.input,
    r = 4,
  ) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" stroke="${stroke}" fill="${fill}"/>`;
  const dropdown = (y: number, value: string) =>
    rect(144, y, 221, 22) +
    text(152, y + 15, shortened(value, 33)) +
    `<path d="M350 ${y + 9}l4 4 4-4" fill="none" stroke="${p.fg}" stroke-width="1.2"/>`;
  const svg = (height: number, contents: string, width = 366) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="-apple-system, BlinkMacSystemFont, Segoe WPC, Segoe UI, system-ui, Ubuntu, Droid Sans, sans-serif" font-weight="400">${contents}</g></svg>`;
  const state = context.paused
    ? "Paused"
    : context.flags.every(Boolean)
      ? "On"
      : context.flags.some(Boolean)
        ? "Mixed"
        : "Off";
  const file =
    context.file === "No active file"
      ? context.file
      : `Active file: ${context.file}${context.language ? ` · ${languageName(context.language)}` : ""}`;
  const workspace = context.workspace
    ? `Workspace: ${context.workspace}${context.folder ? ` · Folder: ${context.folder}` : ""}`
    : "No workspace open";
  const scope = context.scope;
  const language = languageName(context.languageScope);
  const sourceNotes = ["save", "paste", "type"].map((_, i) => {
    const source =
      context.sources?.[i] ??
      (context.owned[i] === undefined
        ? "Using VS Code default"
        : `Saved in ${scope}`);
    return context.overrides?.[i]
      ? `${source} · ${context.overrides[i]}`
      : source;
  });
  const image = (
    height: number,
    contents: string,
    alt: string,
    width = 366,
  ) => ({ svg: svg(height, contents, width), alt, width, height });
  const flagContents = ["save", "paste", "type"]
    .map((label, i) => {
      const y = i * 44 + 3;
      return (
        rect(5, y + 8, 18, 18, p.checkboxBorder, p.checkbox, 3) +
        (context.flags[i]
          ? `<path d="M8 ${y + 17}l4 4 8-9" stroke="${p.muted}" stroke-width="1.4" fill="none"/>`
          : "") +
        text(28, y + 14, `Format on ${label}`) +
        text(345, y + 22, context.flags[i] ? "On" : "Off", 12, p.muted) +
        text(28, y + 33, shortened(sourceNotes[i] ?? "", 57), 12, p.muted)
      );
    })
    .join("");
  const flagDescription = ["save", "paste", "type"]
    .map(
      (label, i) =>
        `Format on ${label}: ${context.flags[i] ? "On" : "Off"}. ${sourceNotes[i]}.`,
    )
    .join(" ");
  const formatterContents =
    line(1) +
    text(5, 34, "Default formatter") +
    dropdown(19, context.formatter ?? "Not configured") +
    line(53);
  return {
    context: image(
      185,
      text(5, 23, "Formatting Controls", 13) +
        rect(313, 6, 52, 22, p.border, "none") +
        text(322, 21, state) +
        line(41) +
        rect(5, 48, 360, 52, p.focus, p.info, 6) +
        `<circle cx="22" cy="63" r="5" stroke="${p.focus}" fill="none"/>` +
        text(21, 66, "i", 9, p.focus) +
        text(34, 65, shortened(file, 52)) +
        text(34, 83, shortened(workspace, 54), 12, p.muted) +
        text(5, 129, "Write to") +
        dropdown(114, scope) +
        text(5, 161, "Apply to language") +
        dropdown(146, language) +
        line(184),
      `Formatting Controls. ${state}. ${file}. ${workspace}. Write to: ${scope}. Apply to language: ${language}. Scope and language displays are read-only.`,
    ),
    disclosure: image(
      36,
      text(5, 22, "Automatic formatting", 13) +
        `<path d="M139 16l4 4 4-4" transform="rotate(${-90 * (1 - formattingHeight / 138)} 143 18)" fill="none" stroke="${p.muted}" stroke-width="1.2"/>`,
      `Automatic formatting ${context.collapsed ? "collapsed" : "expanded"}`,
    ),
    // Keep one image row through the transition: removing an inline-image row
    // otherwise snaps its minimum line height and cell padding at the endpoint.
    formatting: image(
      formattingHeight + 54,
      `<svg width="366" height="${formattingHeight}" viewBox="0 0 366 ${Math.max(1, formattingHeight)}">${flagContents}</svg><g transform="translate(0 ${formattingHeight})">${formatterContents}</g>`,
      `${formattingHeight > 0 ? `${flagDescription} Checkbox displays are read-only. ` : ""}Default formatter: ${context.formatter ?? "Not configured"}. Read-only.`,
    ),
    pause: image(
      50,
      rect(5, 13, 58, 22, p.border, "none") +
        text(
          13,
          28,
          context.paused ? "Resume" : "Pause",
          12,
          context.canPause ? p.fg : p.muted,
        ) +
        text(
          76,
          28,
          context.paused
            ? "Restore unchanged formatting preferences"
            : context.canPause
              ? "Temporarily stop automatic formatting"
              : "Choose a project scope in the dashboard",
          12,
          p.muted,
        ) +
        line(49),
      `${context.paused ? "Resume" : "Pause"}. ${context.paused ? "Restore unchanged formatting preferences" : context.canPause ? "Temporarily stop automatic formatting" : "Choose a project scope in the dashboard"}`,
    ),
    dashboard: image(
      38,
      text(5, 24, "Open dashboard ↗", 12, p.accent),
      "Open dashboard",
      183,
    ),
    settings: image(
      38,
      text(132, 24, "Settings", 12, p.accent),
      "Settings",
      183,
    ),
  };
}
