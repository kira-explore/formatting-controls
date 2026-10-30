import assert from "node:assert/strict";
import { test } from "node:test";
import { statusArtwork } from "../../shared/status-artwork";
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
  overrides: ["Overridden by User settings · typescript · effective: Off"],
  formatter: "Biome",
  scope: "Workspace",
  languageScope: "All languages",
  revision: 7,
  canPause: true,
};

test("reference artwork has live values, accessible descriptions and read-only form displays", () => {
  const art = statusArtwork(context);
  assert.match(
    art.context.alt,
    /Mixed.*Active file: app.ts · TypeScript.*Workspace: project/,
  );
  assert.match(
    art.formatting.alt,
    /Format on save: Off.*Overridden by User settings/,
  );
  assert.match(
    art.formatting.alt,
    /Format on paste: On.*Inherited from User settings/,
  );
  assert.equal(
    [...art.formatting.svg.matchAll(/stroke-width="1.4"/g)].length,
    1,
  );
  const html = statusHover(context);
  assert.ok(!/<input|<select|<button|<script|<style/.test(html));
  const actions = [...html.matchAll(/statusControl\?([^"]*)/g)].map((match) =>
    JSON.parse(decodeURIComponent(match[1] ?? "")),
  );
  assert.deepEqual(actions, [
    [7, "collapse"],
    [7, "pause"],
  ]);
  assert.match(html, /width="366" height="185"/);
  assert.match(html, /data:image\/svg\+xml;base64,/);
});

test("collapsing removes only the flags and keeps context, formatter and footer actions", () => {
  const html = statusHover({ ...context, collapsed: true });
  assert.ok(!html.includes("Format on save:"));
  for (const label of [
    "Active file",
    "Default formatter",
    "Open dashboard",
    "Pause",
    "Settings",
  ])
    assert.ok(html.includes(label));
  assert.match(
    statusArtwork({ ...context, paused: true }).context.alt,
    /Paused/,
  );
  assert.match(
    statusArtwork({ ...context, paused: true }).pause.alt,
    /^Resume/,
  );
  assert.match(
    statusArtwork({ ...context, flags: [true, true, true] }).context.alt,
    /Controls\. On\./,
  );
  assert.match(
    statusArtwork({ ...context, flags: [false, false, false] }).context.alt,
    /Controls\. Off\./,
  );
});

test("untrusted labels remain inert text inside SVG and HTML image descriptions", () => {
  const malicious = {
    ...context,
    file: '[Run](command:evil)\n<IMG SRC=x ONERROR="evil()">',
    workspace: "<SCRIPT>evil()</SCRIPT>",
    formatter: "$(zap)<ScRiPt>evil()</ScRiPt>",
    scope: 'User" ONMOUSEOVER="evil()',
    sources: ['<image href="https://evil.example"/>'],
    overrides: ['<A HREF="command:evil">bad</A>'],
  };
  const html = statusHover(malicious);
  for (const part of Object.values(statusArtwork(malicious))) {
    assert.ok(
      !/<(?:script|image|foreignObject|a)\b|<[^>]+\s(?:onerror|onmouseover)\s*=/i.test(
        part.svg,
      ),
    );
    assert.ok(part.svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  }
  assert.deepEqual(
    new Set(
      [...html.matchAll(/href="command:([\w.]+)/g)].map((match) => match[1]),
    ),
    new Set([
      "formattingControls.statusControl",
      "formattingControls.dashboard",
      "workbench.action.openSettings",
    ]),
  );
  assert.doesNotMatch(html, /<script\b/i);
});

test("theme palettes change the artwork and read-only User pause has no action", () => {
  assert.match(statusArtwork(context, "light").context.svg, /fill="#242424"/);
  assert.match(
    statusArtwork(context, "contrast").context.svg,
    /fill="#ffffff"/,
  );
  assert.match(
    statusArtwork(context, "contrast-light").context.svg,
    /fill="#000000"/,
  );
  assert.ok(
    !statusHover({ ...context, canPause: false }).includes(
      encodeURIComponent(JSON.stringify([7, "pause"])),
    ),
  );
});
