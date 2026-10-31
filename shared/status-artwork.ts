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
    muted: "#a0a0a0",
    line: "#2b2b2c",
    accent: "#47a1c7",
    focus: "#347490",
    info: "#22262a",
    input: "#181a1b",
    border: "#333536",
    button: "#2a2d2e",
    checkbox: "#3a3a3a",
    checkboxChecked: "#777777",
    checkboxTick: "#353535",
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
    button: "#e6e6e6",
    checkbox: "#eeeeee",
    checkboxChecked: "#b8b8b8",
    checkboxTick: "#555555",
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
    button: "#000000",
    checkbox: "#000000",
    checkboxChecked: "#000000",
    checkboxTick: "#ffffff",
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
    button: "#ffffff",
    checkbox: "#ffffff",
    checkboxChecked: "#ffffff",
    checkboxTick: "#000000",
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
  const text = (
    x: number,
    y: number,
    value: string,
    size = 12,
    color: string = p.fg,
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${escapeText(value)}</text>`;
  const centeredText = (
    x: number,
    y: number,
    value: string,
    size = 12,
    color: string = p.fg,
    anchor: "start" | "middle" = "start",
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" dominant-baseline="central">${escapeText(value)}</text>`;
  const line = (y: number) => `<path d="M5 ${y}H395" stroke="${p.line}"/>`;
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
    rect(168, y, 227, 28) +
    centeredText(178, y + 14, shortened(value, 33)) +
    `<path d="M376 ${y + 12}l4 4 4-4" fill="none" stroke="${p.fg}" stroke-width="1.2"/>`;
  const svg = (height: number, contents: string, width = 400) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g font-family="-apple-system, BlinkMacSystemFont, Segoe WPC, Segoe UI, system-ui, Ubuntu, Droid Sans, sans-serif" font-weight="400">${contents}</g></svg>`;
  const state = context.flags.every(Boolean)
    ? "Enabled"
    : context.flags.some(Boolean)
      ? "Mixed"
      : "Disabled";
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
    width = 400,
  ) => ({ svg: svg(height, contents, width), alt, width, height });
  const flagContents = ["save", "paste", "type"]
    .map((label, i) => {
      const y = i * 46;
      return (
        rect(
          5,
          y + 9,
          18,
          18,
          p.checkboxBorder,
          context.flags[i] ? p.checkboxChecked : p.checkbox,
          2,
        ) +
        (context.flags[i]
          ? `<path d="M8 ${y + 18}l4 4 8-9" stroke="${p.checkboxTick}" stroke-width="2" fill="none"/>`
          : "") +
        text(33, y + 13, `Format on ${label}`) +
        text(33, y + 30, shortened(sourceNotes[i] ?? "", 59), 12, p.muted)
      );
    })
    .join("");
  const flagDescription = ["save", "paste", "type"]
    .map(
      (label, i) =>
        `Format on ${label}: ${context.flags[i] ? "Enabled" : "Disabled"}. ${sourceNotes[i]}.`,
    )
    .join(" ");
  const pauseCaption = context.paused
    ? "Restore your previous formatting settings."
    : context.canPause
      ? "Pause automatic formatting until you resume."
      : "Choose a project scope in the dashboard";
  return {
    settings: image(
      24,
      rect(0.5, 0.5, 25, 23, p.border, p.button) +
        `<g transform="translate(5 5)" fill="none" stroke="${p.fg}" stroke-width="1"><path d="M0 2h16M0 7h16M0 12h16M5 0v4M11 5v4M7 10v4"/></g>`,
      "Open VS Code Settings",
      26,
    ),
    info: image(
      20,
      `<circle cx="8" cy="10" r="5" stroke="${p.muted}" fill="none"/>` +
        centeredText(8, 10, "i", 9, p.muted, "middle"),
      "About automatic formatting",
      16,
    ),
    header: image(
      28,
      centeredText(5, 14, "Kira Formatting Controls", 13),
      "Kira Formatting Controls",
      270,
    ),
    context: image(
      76,
      line(1) +
        rect(5, 12, 390, 60, p.focus, p.info, 6) +
        `<circle cx="25" cy="42" r="6" stroke="${p.focus}" fill="none"/>` +
        centeredText(25, 42, "i", 10, p.focus, "middle") +
        centeredText(45, 33, shortened(file, 56)) +
        centeredText(45, 51, shortened(workspace, 56), 12, p.muted),
      `${file}. ${workspace}.`,
    ),
    scopes: image(
      96,
      centeredText(5, 20, "Write to") +
        dropdown(6, scope) +
        centeredText(5, 58, "Apply to language") +
        dropdown(44, language) +
        line(95),
      `Write to: ${scope}. Apply to language: ${language}. Read-only.`,
    ),
    heading: image(
      26,
      text(5, 18, "Automatic formatting", 13),
      "Automatic formatting",
      136,
    ),
    state: image(
      26,
      rect(0, 2, 78, 22, p.border, "none") +
        centeredText(39, 13, state, 12, p.fg, "middle"),
      `Automatic formatting: ${state}`,
      78,
    ),
    summary: image(
      26,
      text(5, 18, "Automatic formatting", 13) +
        `<circle cx="156" cy="13" r="5" stroke="${p.muted}" fill="none"/>` +
        centeredText(156, 13, "i", 9, p.muted, "middle") +
        rect(317, 2, 78, 22, p.border, "none") +
        centeredText(356, 13, state, 12, p.fg, "middle"),
      `Automatic formatting: ${state}`,
    ),
    formatting: image(
      138,
      flagContents,
      `${flagDescription} Checkbox displays are read-only.`,
    ),
    formatter: image(
      56,
      line(1) +
        centeredText(5, 29, "Default formatter") +
        dropdown(15, context.formatter ?? "Not configured") +
        line(55),
      `Default formatter: ${context.formatter ?? "Not configured"}. Read-only.`,
    ),
    pause: image(
      28,
      rect(0.5, 0.5, 65, 27, p.border, p.button) +
        centeredText(
          33,
          14,
          context.paused ? "Resume" : "Pause",
          12,
          context.canPause ? p.fg : p.muted,
          "middle",
        ),
      context.paused ? "Resume" : "Pause",
      66,
    ),
    pauseInset: image(28, "", "", 5),
    pauseCaption: image(
      28,
      centeredText(12, 14, pauseCaption, 12, p.muted),
      pauseCaption,
      329,
    ),
    separator: image(1, line(0.5), ""),
    dashboard: image(
      32,
      `<text x="5" y="20" font-size="12" fill="${p.accent}" text-decoration="underline">Open dashboard ↗</text>`,
      "Open dashboard ↗",
      270,
    ),
    issue: image(
      32,
      `<text x="125" y="20" text-anchor="end" font-size="12" fill="${p.accent}" text-decoration="underline">Report an issue ↗</text>`,
      "Report an issue ↗",
      130,
    ),
  };
}
