import assert from "node:assert/strict";
import { test } from "node:test";
import { type HoverContext, statusHover } from "../../shared/status-hover";

const context: HoverContext = {
  file: "app.tsx",
  language: "typescriptreact",
  flags: [false, true, false],
  formatter: "Biome",
};
test("hover reports effective formatting only and opens sidebar controls", () => {
  const hover = statusHover(context);
  assert.match(hover, /Formatting Controls · Mixed/);
  assert.match(hover, /Format on save: \*\*Off/);
  assert.match(hover, /Format on paste: \*\*On/);
  assert.ok(!/save actions|codeActions/i.test(hover));
  assert.match(hover, /Open sidebar controls/);
  assert.match(
    statusHover({ ...context, flags: [true, true, true] }),
    /Controls · On/,
  );
  assert.match(
    statusHover({ ...context, flags: [false, false, false] }),
    /Controls · Off/,
  );
});
test("untrusted context cannot introduce markdown commands, HTML or codicons", () => {
  const hover = statusHover({
    ...context,
    file: "[Run](command:evil)\n<img src=x>",
    formatter: "$(zap)[Other](command:evil)",
  });
  assert.ok(hover.includes("\\[Run\\]\\(command:evil\\)"));
  assert.ok(hover.includes("\\<img src=x\\>"));
  assert.ok(hover.includes("\\$\\(zap\\)"));
  assert.ok(!hover.includes("[Run](command:evil)"));
});
test("hover contains only argument-free sidebar and dashboard navigation", () => {
  const links = [
    ...statusHover(context).matchAll(/\]\(command:([^)]*)\)/g),
  ].map((match) => match[1]);
  assert.deepEqual(links, [
    "formattingControls.quickControls",
    "formattingControls.dashboard",
  ]);
});
