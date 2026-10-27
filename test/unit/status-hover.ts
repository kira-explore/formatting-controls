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
test("status card distinguishes selected-scope, inherited and effective formatting", () => {
  const html = statusHover(context);
  assert.match(html, />&nbsp;Mixed&nbsp;</);
  assert.match(html, /Turn off format on save/);
  assert.match(html, /Effective value: Off/);
  assert.match(html, /Inherited at this scope/);
  assert.ok(
    !/save actions|codeActions|quickControls|<input|<select|<button/i.test(
      html,
    ),
  );
  assert.match(
    statusHover({ ...context, flags: [true, true, true] }),
    />&nbsp;On&nbsp;</,
  );
  assert.match(
    statusHover({ ...context, flags: [false, false, false] }),
    />&nbsp;Off&nbsp;</,
  );
});
test("context text cannot introduce HTML, attributes or command links", () => {
  const html = statusHover({
    ...context,
    file: '[Run](command:evil)\n<img src=x onerror="evil()">',
    formatter: "$(zap)<script>evil()</script>",
    scope: 'User" onmouseover="evil()',
  });
  assert.ok(html.includes("&lt;img src=x onerror=&quot;evil()&quot;&gt;"));
  assert.ok(html.includes("$(zap)&lt;script&gt;evil()&lt;/script&gt;"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes(' onmouseover="'));
  const commands = [...html.matchAll(/href="command:([\w.]+)/g)].map(
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
test("each settings link carries a revision and one constrained action", () => {
  const actions = [
    ...statusHover(context).matchAll(
      /href="command:formattingControls.statusControl\?([^"]*)"/g,
    ),
  ].map((match) => JSON.parse(decodeURIComponent(match[1] ?? "")));
  assert.deepEqual(actions, [
    [7, "scope"],
    [7, "language"],
    [7, 0],
    [7, 1],
    [7, 2],
  ]);
});
