import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const upstream = "e646868227c3e3a9e3f24277c8c7220be42c0be7";
const root = resolve(import.meta.dirname, "..");
const target = resolve(process.argv[3] ?? "");
const mode = process.argv[2];
if (!["apply", "check", "patch"].includes(mode ?? "") || !process.argv[3]) {
  throw new Error(
    "Usage: bun run scripts/core-prototype.ts apply|check|patch /path/to/vscode-1.143.1-source",
  );
}
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: target, encoding: "utf8" });
if (git("rev-parse", "HEAD").trim() !== upstream)
  throw new Error(
    `Use the pinned VS Code 1.143.1 source revision ${upstream}.`,
  );
const main = "src/vs/workbench/workbench.common.main.ts";
const original = git("show", `HEAD:${main}`);
const addition =
  "\n// Isolated Kira Formatting Controls core prototype.\nimport './contrib/formattingControls/browser/formattingControls.contribution.js';\n";
const mainPath = join(target, main);
const current = readFileSync(mainPath, "utf8");
if (current !== original && current !== original + addition)
  throw new Error(
    "The workbench entry has unrelated changes; use an isolated checkout.",
  );
const modifications = new Map<string, { original: string; changed: string }>();
function modify(file: string, edits: [string, string][]): void {
  const original = git("show", `HEAD:${file}`);
  let changed = original;
  for (const [before, after] of edits) {
    if (changed.split(before).length !== 2)
      throw new Error(`Upstream patch context differs: ${file}`);
    changed = changed.replace(before, after);
  }
  const actual = readFileSync(join(target, file), "utf8");
  if (actual !== original && actual !== changed)
    throw new Error(`Refusing unrelated changes: ${file}`);
  modifications.set(file, { original, changed });
}
modify("src/vs/base/browser/ui/hover/hover.ts", [
  [
    "appearance?: Pick<IHoverAppearanceOptions, 'showHoverHint'>;",
    "appearance?: Pick<IHoverAppearanceOptions, 'showHoverHint' | 'showPointer'>;",
  ],
]);
modify("src/vs/workbench/services/statusbar/browser/statusbar.ts", [
  [
    "{ IManagedHoverTooltipHTMLElement, IManagedHoverTooltipMarkdownString }",
    "{ IManagedHoverOptions, IManagedHoverTooltipHTMLElement, IManagedHoverTooltipMarkdownString }",
  ],
  [
    "readonly tooltip?: TooltipContent | ITooltipWithCommands;",
    "readonly tooltip?: TooltipContent | ITooltipWithCommands;\n\n\t/** Optional native hover appearance for this internal workbench entry. */\n\treadonly hoverOptions?: IManagedHoverOptions;",
  ],
]);
modify("src/vs/workbench/browser/parts/statusbar/statusbarItem.ts", [
  [
    "let hoverOptions: IManagedHoverOptions | undefined;",
    "let hoverOptions: IManagedHoverOptions | undefined = entry.hoverOptions;",
  ],
  [
    "hoverOptions = {\n\t\t\t\t\tonDidShow:",
    "hoverOptions = {\n\t\t\t\t\t...entry.hoverOptions,\n\t\t\t\t\tonDidShow:",
  ],
  [
    "private isEqualTooltip({ tooltip }: IStatusbarEntry, { tooltip: otherTooltip }: IStatusbarEntry) {",
    "private isEqualTooltip({ tooltip, hoverOptions }: IStatusbarEntry, { tooltip: otherTooltip, hoverOptions: otherHoverOptions }: IStatusbarEntry) {\n\t\tif (hoverOptions !== otherHoverOptions) {\n\t\t\treturn false;\n\t\t}",
  ],
]);
const prefix = "src/vs/workbench/contrib/formattingControls/browser/";
const files = new Map<string, string>([
  ...[
    "formattingControls.contribution.ts",
    "formattingControlsCard.ts",
    "formattingControls.css",
  ].map((name): [string, string] => [
    prefix + name,
    readFileSync(join(root, "prototype/vscode", name), "utf8"),
  ]),
  [
    `${prefix}coreControlsProtocol.ts`,
    `/* Private Kira Formatting Controls prototype bridge. MIT licensed. */\n${readFileSync(join(root, "shared/core-controls.ts"), "utf8")}`,
  ],
  [
    "src/tsconfig.kira-formatting.json",
    readFileSync(join(root, "prototype/vscode/tsconfig.json"), "utf8"),
  ],
]);
const manifestPath = join(
  target,
  ".build/kira-formatting-controls-overlay.json",
);
const previous: Record<string, string> = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : {};
const hash = (content: string) =>
  createHash("sha256").update(content).digest("hex");
if (mode === "apply") {
  for (const [file, content] of files) {
    const path = join(target, file);
    if (
      existsSync(path) &&
      readFileSync(path, "utf8") !== content &&
      previous[file] !== hash(readFileSync(path, "utf8"))
    )
      throw new Error(
        `Refusing to overwrite a different file: ${file}. Remove only the previous prototype overlay before updating it.`,
      );
  }
  for (const [file, content] of files) {
    const path = join(target, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  writeFileSync(mainPath, original + addition);
  for (const [file, content] of modifications)
    writeFileSync(join(target, file), content.changed);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(
    manifestPath,
    JSON.stringify(
      Object.fromEntries(
        [...files].map(([file, content]) => [file, hash(content)]),
      ),
      null,
      2,
    ),
  );
  console.log(
    "Applied the isolated core contribution. Your installed editor is unchanged.",
  );
} else if (mode === "check") {
  for (const [file, content] of modifications)
    if (readFileSync(join(target, file), "utf8") !== content.changed)
      throw new Error(`Native hover patch missing: ${file}`);
  for (const [file, content] of files)
    if (readFileSync(join(target, file), "utf8") !== content)
      throw new Error(`Prototype overlay differs: ${file}`);
  if (current !== original + addition)
    throw new Error("Prototype import is missing.");
  console.log("Pinned upstream revision and prototype overlay verified.");
} else {
  let patch = git("diff", "--", main, ...modifications.keys());
  if (current !== original + addition)
    throw new Error("Apply the prototype before generating its patch.");
  for (const [file, content] of files) {
    if (readFileSync(join(target, file), "utf8") !== content)
      throw new Error(`Overlay differs: ${file}`);
    const lines = content.trimEnd().split("\n");
    patch += `diff --git a/${file} b/${file}\nnew file mode 100644\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n`;
  }
  writeFileSync(join(root, "prototype/vscode/vscode-1.143.1.patch"), patch);
  console.log("Wrote the portable VS Code core patch.");
}
