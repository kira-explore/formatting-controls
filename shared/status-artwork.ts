import { statusHelp } from "./status-help";
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
    resume: "#203d4b",
    resumeText: "#9dd9f6",
    resumeBorder: "#38637a",
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
    button: "#e6e6e6",
    resume: "#e3f1f8",
    resumeText: "#075378",
    resumeBorder: "#8cbcd4",
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
    button: "#000000",
    resume: "#000000",
    resumeText: "#5cdeff",
    resumeBorder: "#5cdeff",
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
    button: "#ffffff",
    resume: "#ffffff",
    resumeText: "#004fa3",
    resumeBorder: "#004fa3",
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

const languageCode = (id: string): string =>
  ({
    javascript: "JS",
    typescript: "TS",
    javascriptreact: "JSX",
    typescriptreact: "TSX",
    json: "JSON",
    jsonc: "JSONC",
    markdown: "MD",
    python: "PY",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    less: "LESS",
    yaml: "YAML",
    xml: "XML",
    shellscript: "SH",
    plaintext: "Text",
    c: "C",
    cpp: "C++",
    csharp: "C#",
    java: "Java",
    go: "Go",
    rust: "Rust",
    ruby: "Ruby",
    php: "PHP",
    sql: "SQL",
  })[id] ?? languageName(id);

/** Locally generated, inert SVG artwork. No scripts, external assets or embedded HTML. */
export function statusArtwork(
  context: HoverContext,
  theme: CardTheme = "dark",
) {
  const p = palettes[theme];
  const centeredText = (
    x: number,
    y: number,
    value: string,
    size = 12.5,
    color: string = p.fg,
    anchor: "start" | "middle" | "end" = "start",
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" dominant-baseline="central">${escapeText(value)}</text>`;
  const line = (y: number) => `<path d="M5 ${y}H375" stroke="${p.line}"/>`;
  const infoGlyph = (x: number, y: number, color: string) =>
    `<circle cx="${x}" cy="${y}" r="5" stroke="${color}" fill="none"/><circle cx="${x}" cy="${y - 2.75}" r=".55" fill="${color}"/><path d="M${x} ${y - 0.46}v3.2" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>`;
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
    rect(168, y, 207, 28) +
    centeredText(178, y + 14, shortened(value, 28)) +
    `<path d="M356.5 ${y + 12.25}l3.5 3.5 3.5-3.5" fill="none" stroke="${p.fg}" stroke-width="1.2"/>`;
  const svg = (height: number, contents: string, width = 380) =>
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
  const fileLabel =
    context.file === "No active file"
      ? context.file
      : `Active file: ${context.file}${context.language ? ` · ${languageCode(context.language)}` : ""}`;
  const workspace = context.workspace
    ? `Workspace: ${context.workspace}`
    : "No workspace open";
  const folder = context.folder ? `Folder: ${context.folder}` : undefined;
  const contextExtraHeight = folder ? 18 : 0;
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
    width = 380,
  ) => ({ svg: svg(height, contents, width), alt, width, height });
  // Keep the info gap stable when the renderer selects a wider fallback font.
  const formattingHeading = `<text x="5" y="14" dominant-baseline="central" font-size="13.5" textLength="135" lengthAdjust="spacingAndGlyphs" fill="${p.fg}">Automatic formatting</text>`;
  const flagContents = ["save", "paste", "type"]
    .map((label, i) => {
      const y = i * 46;
      return (
        rect(5.5, y + 9.5, 17, 17, p.checkboxBorder, p.checkbox, 2) +
        (context.flags[i]
          ? `<path d="M8.333 ${y + 18}l3.778 3.778 7.556-8.5" stroke="${p.muted}" stroke-width="1.3" fill="none"/>`
          : "") +
        centeredText(33, y + 9, `Format on ${label}`) +
        centeredText(
          33,
          y + 27,
          shortened(sourceNotes[i] ?? "", 51),
          12.5,
          p.muted,
        )
      );
    })
    .join("");
  const flagDescription = ["save", "paste", "type"]
    .map(
      (label, i) =>
        `Format on ${label}: ${context.flags[i] ? "Enabled" : "Disabled"}. ${sourceNotes[i]}.`,
    )
    .join(" ");
  const pauseLabel = context.paused ? "Resume" : "Pause";
  const pauseCaption = context.paused
    ? statusHelp.resume
    : context.canPause
      ? statusHelp.pause
      : "Choose a project scope in the dashboard";
  return {
    settings: image(
      24,
      rect(0.5, 0.5, 25, 23, p.border, p.button) +
        `<g transform="translate(6.6 5.6) scale(.8)" fill="none" stroke="${p.fg}" stroke-width="1.5" stroke-linecap="round"><path d="M0 4h3.5M8.5 4H16M0 12h8M13 12h3"/><circle cx="6" cy="4" r="2.5"/><circle cx="10.5" cy="12" r="2.5"/></g>`,
      "Open VS Code Settings",
      26,
    ),
    info: image(
      20,
      infoGlyph(8, 10, p.muted),
      "About automatic formatting",
      16,
    ),
    header: image(
      36,
      centeredText(5, 18, "Kira Formatting Controls", 13.5),
      "Kira Formatting Controls",
      250,
    ),
    context: image(
      76 + contextExtraHeight,
      line(1) +
        rect(5, 12, 370, 60 + contextExtraHeight, p.focus, p.info, 6) +
        infoGlyph(25, 42 + contextExtraHeight / 2, p.focus) +
        centeredText(45, 33, shortened(fileLabel, 48)) +
        centeredText(45, 51, shortened(workspace, 48), 12.5, p.muted) +
        (folder
          ? centeredText(45, 69, shortened(folder, 48), 12.5, p.muted)
          : ""),
      `${file}. ${workspace}.${folder ? ` ${folder}.` : ""}`,
    ),
    scopes: image(
      72,
      centeredText(5, 20, "Scope") +
        dropdown(6, scope) +
        centeredText(5, 58, "Language") +
        dropdown(44, language),
      `Scope: ${scope}. Language: ${language}. Read-only.`,
    ),
    heading: image(28, formattingHeading, "Automatic formatting", 153),
    state: image(
      36,
      centeredText(68, 18, state, 12.5, p.muted, "end"),
      `Automatic formatting: ${state}`,
      78,
    ),
    summary: image(
      28,
      formattingHeading + infoGlyph(153, 15, p.muted),
      "Automatic formatting",
      250,
    ),
    formatting: image(
      128,
      flagContents,
      `${flagDescription} Checkbox displays are read-only.`,
    ),
    formatter: image(
      // Separate scope and formatter details from automatic formatting.
      48,
      centeredText(5, 20, "Formatter") +
        dropdown(6, context.formatter ?? "Not configured") +
        line(46),
      `Formatter: ${context.formatter ?? "Not configured"}. Read-only.`,
    ),
    pause: image(
      28,
      rect(
        0.5,
        0.5,
        65,
        27,
        context.paused && context.canPause ? p.resumeBorder : p.border,
        context.paused && context.canPause ? p.resume : p.button,
      ) +
        centeredText(
          33,
          14,
          pauseLabel,
          12.5,
          context.canPause ? (context.paused ? p.resumeText : p.fg) : p.muted,
          "middle",
        ),
      pauseLabel,
      66,
    ),
    // Unlinked artwork centers the button and explanation without expanding
    // the button's click target into the caption or vertical padding.
    pauseInset: image(44, "", "", 5),
    pauseCaption: image(
      44,
      centeredText(12, 22, pauseCaption, 12.5, p.muted),
      pauseCaption,
      309,
    ),
    dashboard: image(
      36,
      `<path d="M5 1H139" stroke="${p.line}"/><text x="12" y="21" dominant-baseline="central" font-size="12.5" textLength="110.57" lengthAdjust="spacingAndGlyphs" fill="${p.accent}">Open dashboard ↗</text>`,
      "Open dashboard ↗",
      139,
    ),
    footerGap: image(36, `<path d="M0 1H108" stroke="${p.line}"/>`, "", 108),
    issue: image(
      36,
      `<path d="M0 1H128" stroke="${p.line}"/><text x="12" y="21" dominant-baseline="central" font-size="12.5" textLength="104.81" lengthAdjust="spacingAndGlyphs" fill="${p.accent}">Report an issue ↗</text>`,
      "Report an issue ↗",
      133,
    ),
  };
}
