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
    bg: "#202020",
    fg: "#eeeeee",
    muted: "#aeb7c2",
    line: "#424242",
    accent: "#00b9f4",
    info: "#1b272e",
    input: "#1c1c1c",
    border: "#555555",
  },
  light: {
    bg: "#f8f8f8",
    fg: "#242424",
    muted: "#555f6c",
    line: "#cccccc",
    accent: "#0070a8",
    info: "#eaf4fa",
    input: "#ffffff",
    border: "#929292",
  },
  contrast: {
    bg: "#000000",
    fg: "#ffffff",
    muted: "#ffffff",
    line: "#ffffff",
    accent: "#5cdeff",
    info: "#000000",
    input: "#000000",
    border: "#ffffff",
  },
  "contrast-light": {
    bg: "#ffffff",
    fg: "#000000",
    muted: "#292929",
    line: "#000000",
    accent: "#004fa3",
    info: "#ffffff",
    input: "#ffffff",
    border: "#000000",
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
    size = 14,
    color: string = p.fg,
  ) =>
    `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${escapeText(value)}</text>`;
  const line = (y: number) => `<path d="M20 ${y}H420" stroke="${p.line}"/>`;
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
    rect(208, y, 212, 34) +
    text(220, y + 22, shortened(value, 25)) +
    `<path d="M398 ${y + 14}l5 5 5-5" fill="none" stroke="${p.fg}" stroke-width="1.5"/>`;
  const svg = (height: number, contents: string, width = 440) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${p.bg}"/><g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${contents}</g></svg>`;
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
    width = 440,
  ) => ({ svg: svg(height, contents, width), alt, width, height });
  return {
    context: image(
      232,
      text(20, 35, "Formatting Controls", 20) +
        rect(350, 12, 70, 29) +
        text(362, 32, state) +
        line(55) +
        rect(20, 70, 400, 60, p.accent, p.info, 5) +
        `<circle cx="40" cy="94" r="9" stroke="${p.accent}" fill="none"/>` +
        text(38, 99, "i", 14, p.accent) +
        text(59, 94, shortened(file, 47)) +
        text(59, 116, shortened(workspace, 49), 13, p.muted) +
        text(20, 165, "Write to") +
        dropdown(143, scope) +
        text(20, 211, "Apply to language") +
        dropdown(189, language) +
        line(231),
      `Formatting Controls. ${state}. ${file}. ${workspace}. Write to: ${scope}. Apply to language: ${language}. Scope and language displays are read-only.`,
    ),
    disclosure: image(
      46,
      text(20, 29, "Automatic formatting", 15) +
        (context.collapsed
          ? `<path d="M203 21l5 5-5 5" fill="none" stroke="${p.fg}" stroke-width="1.5"/>`
          : `<path d="M201 23l5 5 5-5" fill="none" stroke="${p.fg}" stroke-width="1.5"/>`),
      `Automatic formatting ${context.collapsed ? "collapsed" : "expanded"}`,
    ),
    flags: image(
      180,
      ["save", "paste", "type"]
        .map((label, i) => {
          const y = i * 60 + 3;
          return (
            rect(20, y, 20, 20, p.muted, p.bg, 3) +
            (context.flags[i]
              ? `<path d="M24 ${y + 10}l5 5 9-10" stroke="${p.fg}" stroke-width="2" fill="none"/>`
              : "") +
            text(58, y + 16, `Format on ${label}`, 15) +
            text(397, y + 16, context.flags[i] ? "On" : "Off", 14, p.muted) +
            text(58, y + 40, shortened(sourceNotes[i] ?? "", 52), 13, p.muted)
          );
        })
        .join(""),
      `${["save", "paste", "type"]
        .map(
          (label, i) =>
            `Format on ${label}: ${context.flags[i] ? "On" : "Off"}. ${sourceNotes[i]}.`,
        )
        .join(" ")} Checkbox displays are read-only.`,
    ),
    formatter: image(
      66,
      line(1) +
        text(20, 38, "Default formatter") +
        dropdown(16, context.formatter ?? "Not configured") +
        line(65),
      `Default formatter: ${context.formatter ?? "Not configured"}. Read-only.`,
    ),
    pause: image(
      64,
      rect(20, 12, 82, 34) +
        text(
          33,
          34,
          context.paused ? "Resume" : "Pause",
          14,
          context.canPause ? p.fg : p.muted,
        ) +
        text(
          118,
          34,
          context.paused
            ? "Restore unchanged formatting preferences"
            : context.canPause
              ? "Temporarily stop automatic formatting"
              : "Choose a project scope in the dashboard",
          12,
          p.muted,
        ) +
        line(63),
      `${context.paused ? "Resume" : "Pause"}. ${context.paused ? "Restore unchanged formatting preferences" : context.canPause ? "Temporarily stop automatic formatting" : "Choose a project scope in the dashboard"}`,
    ),
    dashboard: image(
      46,
      text(20, 29, "Open dashboard ↗", 14, p.accent),
      "Open dashboard",
      220,
    ),
    settings: image(
      46,
      text(148, 29, "Settings", 14, p.accent),
      "Settings",
      220,
    ),
  };
}
