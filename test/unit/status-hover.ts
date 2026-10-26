import assert from "node:assert/strict";
import { test } from "node:test";
import { quickTab, saveActions, statusHover } from "../../shared/status-hover";

test("hover reports effective triggers and counts save actions independently", () => {
  const hover = statusHover({
    file: "app.tsx",
    language: "typescriptreact",
    flags: [false, false, false],
    formatter: "biomejs.biome",
    actions: {
      "source.fixAll.biome": "explicit",
      "source.organizeImports": "never",
      "source.fixAll.eslint": true,
      invalid: "always",
    },
  });
  assert.match(hover, /Formatting Controls · Off/);
  assert.match(hover, /Format on save \| Off/);
  assert.match(hover, /2 configured to run/);
  assert.match(hover, /Separate from formatting/);
  assert.equal(saveActions(["source.fixAll"]).length, 0);
  assert.match(
    statusHover({
      file: "No editor",
      flags: [true, false, false],
      actions: [],
    }),
    /Formatting Controls · Mixed/,
  );
});
test("untrusted file and formatter text cannot introduce markdown commands or HTML", () => {
  const hover = statusHover({
    file: "[Run](command:evil)\n<img src=x>",
    flags: [false, false, false],
    formatter: "$(zap)[Other](command:evil)",
    actions: undefined,
  });
  assert.ok(hover.includes("\\[Run\\]\\(command:evil\\)"));
  assert.ok(hover.includes("\\<img src=x\\>"));
  assert.ok(hover.includes("\\$\\(zap\\)"));
  assert.ok(!hover.includes("[Run](command:evil)"));
  assert.ok(!hover.includes("<img src=x>"));
  const commands = [...hover.matchAll(/\]\(command:([\w.]+)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    new Set(commands),
    new Set([
      "formattingControls.quickControls",
      "formattingControls.dashboard",
    ]),
  );
});
test("quick controls navigation accepts only known tabs", () => {
  assert.equal(quickTab("actions"), "actions");
  for (const value of [
    null,
    undefined,
    "file:///tmp/settings",
    { tab: "actions" },
    ["actions"],
  ])
    assert.equal(quickTab(value), "formatting");
});
