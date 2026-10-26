import assert from "node:assert/strict";
import { test } from "node:test";
import { type HoverContext, statusHover } from "../../shared/status-hover";

const context: HoverContext = {
  file: "app.tsx",
  language: "typescriptreact",
  flags: [false, true, false],
  owned: [true, undefined, false],
  formatter: "Biome",
  scope: "Folder: project",
  languageScope: "All languages",
  revision: 7,
};
test("formatting-only hover distinguishes owned, effective and inherited values", () => {
  const hover = statusHover(context);
  assert.match(hover, /Formatting Controls · Mixed/);
  assert.match(hover, /On\].*Effective Off/);
  assert.match(hover, /On\].*Inherited/);
  assert.ok(!/save actions|codeActions|quickControls/i.test(hover));
  assert.match(
    statusHover({ ...context, flags: [true, true, true] }),
    /Controls · On/,
  );
  assert.match(
    statusHover({ ...context, flags: [false, false, false] }),
    /Controls · Off/,
  );
});
test("untrusted context text cannot introduce markdown commands, HTML or codicons", () => {
  const hover = statusHover({
    ...context,
    file: "[Run](command:evil)\n<img src=x>",
    formatter: "$(zap)[Other](command:evil)",
    scope: "[evil]",
  });
  assert.ok(hover.includes("\\[Run\\]\\(command:evil\\)"));
  assert.ok(hover.includes("\\<img src=x\\>"));
  assert.ok(hover.includes("\\$\\(zap\\)"));
  assert.ok(!hover.includes("[Run](command:evil)"));
  const commands = [...hover.matchAll(/\]\(command:([\w.]+)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    new Set(commands),
    new Set([
      "formattingControls.statusControl",
      "formattingControls.dashboard",
      "workbench.action.openSettings",
    ]),
  );
});
test("each control carries the current revision and a constrained action", () => {
  const hover = statusHover(context);
  const actions = [...hover.matchAll(/statusControl\?([^)]*)/g)].map((match) =>
    JSON.parse(decodeURIComponent(match[1] ?? "")),
  );
  assert.deepEqual(actions, [
    [7, "scope"],
    [7, "language"],
    [7, 0],
    [7, 1],
    [7, 2],
  ]);
});
