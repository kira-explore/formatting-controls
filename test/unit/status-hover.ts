import assert from "node:assert/strict";
import { test } from "node:test";
import { type HoverContext, statusHover } from "../../shared/status-hover";

const context: HoverContext = {
  file: "app.ts",
  language: "typescript",
  workspace: "project",
  flags: [false, true, false],
  owned: [true, undefined, false],
  sources: [
    "Saved in Workspace",
    "Inherited from User settings",
    "Saved in Workspace",
  ],
  formatter: "Biome",
  scope: "Workspace",
  languageScope: "All languages",
  revision: 7,
  canPause: true,
};
test("anchored card offers constrained actions without fake form inputs", () => {
  const html = statusHover(context);
  assert.match(html, /<code>Mixed<\/code>/);
  assert.match(html, /Effective: Off/);
  assert.match(html, /Inherited from User settings/);
  assert.match(html, /Workspace: project/);
  assert.ok(!html.includes("formattingControls.quickControls"));
  assert.ok(
    !/save actions|codeActions|<input|<select|<button|Set here/.test(html),
  );
  assert.match(
    statusHover({ ...context, flags: [true, true, true] }),
    /<code>On<\/code>/,
  );
  assert.match(
    statusHover({ ...context, flags: [false, false, false] }),
    /<code>Off<\/code>/,
  );
});
test("only automatic formatting rows collapse; context and footer remain", () => {
  const html = statusHover({ ...context, collapsed: true });
  assert.ok(!html.includes("Format on save"));
  for (const label of [
    "Active file",
    "Default formatter",
    "Open dashboard",
    "Pause",
  ])
    assert.ok(html.includes(label));
  const actions = [
    ...html.matchAll(
      /href="command:formattingControls.statusControl\?([^"]*)"/g,
    ),
  ].map((m) => JSON.parse(decodeURIComponent(m[1] ?? "")));
  assert.deepEqual(actions, [
    [7, "scope"],
    [7, "language"],
    [7, "collapse"],
    [7, "pause"],
  ]);
});
test("untrusted file, workspace and provider text cannot inject HTML or commands", () => {
  const html = statusHover({
    ...context,
    file: '[Run](command:evil)\n<img src=x onerror="evil()">',
    workspace: "<script>evil()</script>",
    formatter: "$(zap)<script>evil()</script>",
    scope: 'User" onmouseover="evil()',
    sources: ['<img src=x onerror="evil()">'],
    overrides: ['<a href="command:evil">bad</a>'],
  });
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  assert.deepEqual(
    new Set([...html.matchAll(/href="command:([\w.]+)/g)].map((m) => m[1])),
    new Set([
      "formattingControls.statusControl",
      "formattingControls.dashboard",
      "workbench.action.openSettings",
    ]),
  );
});
