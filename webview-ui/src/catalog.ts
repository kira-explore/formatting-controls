export const pages = [
  { id: "overview", name: "Overview", glyph: "◈" },
  { id: "formatting", name: "Formatting", glyph: "⌘" },
  { id: "actions", name: "Code actions", glyph: "↗" },
  { id: "formatters", name: "Formatters", glyph: "⊞" },
  { id: "welcome", name: "Getting started", glyph: "◎" },
] as const;
export const labels: Record<string, string> = {
  "editor.formatOnSave": "Format on save",
  "editor.formatOnPaste": "Format on paste",
  "editor.formatOnType": "Format on type",
  "editor.formatOnSaveMode": "Save formatting mode",
  "editor.defaultFormatter": "Default formatter",
  "files.autoSave": "Auto Save",
  "files.autoSaveDelay": "Auto Save delay",
};
export const descriptions: Record<string, string> = {
  "editor.formatOnSave":
    "Format your document when you save. Code actions run separately.",
  "editor.formatOnPaste":
    "Format pasted content when the language provider supports it.",
  "editor.formatOnType": "Format as you type with a compatible provider.",
  "editor.formatOnSaveMode":
    "Choose whether to format the entire file or modified lines.",
  "editor.defaultFormatter":
    "Choose a known installed formatter or enter an extension ID.",
  "files.autoSave": "Choose when VS Code saves your changes automatically.",
  "files.autoSaveDelay":
    "Milliseconds to wait when Auto Save is set to afterDelay.",
};
export const actionNames: Record<string, string> = {
  "source.fixAll": "Fix all",
  "source.fixAll.eslint": "ESLint fixes",
  "source.fixAll.biome": "Biome fixes",
  "source.organizeImports": "Organize imports",
  "source.organizeImports.biome": "Biome import organization",
  "source.sortImports": "Sort imports",
  "source.addMissingImports": "Add missing imports",
  "source.removeUnusedImports": "Remove unused imports",
};
export const display = (value: unknown): string =>
  value === null || value === undefined
    ? "Not configured"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
