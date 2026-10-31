import assert from "node:assert/strict";
import { test } from "node:test";
import { statusArtwork } from "../../shared/status-artwork";
import { issueUrl, statusHelp } from "../../shared/status-help";
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
    /Active file: app.ts · TypeScript.*Workspace: project/,
  );
  assert.match(
    art.formatting.alt,
    /Format on save: Disabled.*Overridden by User settings/,
  );
  assert.match(
    art.formatting.alt,
    /Format on paste: Enabled.*Inherited from User settings/,
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
  assert.deepEqual(actions, [[7, "pause"]]);
  assert.match(html, /width="400" height="76"/);
  assert.equal(art.header.alt, "Kira Formatting Controls");
  assert.match(art.state.alt, /Mixed/);
  assert.match(art.summary.alt, /Mixed/);
  assert.match(html, /data:image\/svg\+xml;base64,/);
});

test("formatting stays visible with context, formatter and footer actions", () => {
  const html = statusHover(context);
  for (const label of [
    "Active file",
    "Automatic formatting",
    "Format on save:",
    "Format on paste:",
    "Format on type:",
    "Default formatter",
    "Open dashboard",
    "Pause",
    "Settings",
  ])
    assert.ok(html.includes(label));
  assert.match(
    statusArtwork({ ...context, paused: true }).pauseCaption.alt,
    /Restore your previous formatting settings/,
  );
  assert.match(
    statusArtwork({ ...context, paused: true }).pause.alt,
    /^Resume/,
  );
  assert.match(
    statusArtwork({ ...context, flags: [true, true, true] }).state.alt,
    /formatting: Enabled/,
  );
  assert.match(
    statusArtwork({ ...context, flags: [false, false, false] }).state.alt,
    /formatting: Disabled/,
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
  assert.deepEqual(
    [...html.matchAll(/href="https:([^"]+)"/g)].map(
      (match) => `https:${match[1]}`,
    ),
    [issueUrl],
  );
  assert.doesNotMatch(html, /<script\b/i);
});

test("status and pause/resume reserve identical geometry and preserve truthful effective state", () => {
  const variants = [
    { flags: [true, true, true], paused: false },
    { flags: [false, false, false], paused: false },
    { flags: [true, false, true], paused: false },
    { flags: [false, false, false], paused: true },
    { flags: [true, false, true], paused: true },
  ].map((variant) => statusArtwork({ ...context, ...variant }));
  assert.equal(
    new Set(variants.map((art) => `${art.state.width}x${art.state.height}`))
      .size,
    1,
  );
  assert.equal(
    new Set(variants.map((art) => `${art.summary.width}x${art.summary.height}`))
      .size,
    1,
  );
  assert.equal(
    new Set(variants.map((art) => `${art.pause.width}x${art.pause.height}`))
      .size,
    1,
  );
  assert.match(variants[3]?.state.alt ?? "", /Disabled/);
  assert.match(variants[4]?.state.alt ?? "", /Mixed/);
  assert.match(
    variants[0]?.pauseCaption.alt ?? "",
    /Pause automatic formatting until you resume\./,
  );
  assert.ok(
    statusHover(context).includes(statusHelp.file.replaceAll("\n", "&#10;")),
  );
});

test("only actions are linked while information regions remain hover-only", () => {
  for (const paused of [false, true]) {
    const html = statusHover({ ...context, paused });
    const button = html.match(
      /<a href="command:formattingControls.statusControl\?[^"]*"([^>]*)>(.*?)<\/a>/,
    );
    assert.ok(button);
    assert.equal(button[1], "");
    assert.match(button[2] ?? "", /width="66" height="28"/);
    assert.doesNotMatch(
      button[2] ?? "",
      /until you resume|previous formatting/,
    );
    assert.doesNotMatch(html, /formattingControls\.statusInfo/);
    assert.match(
      html,
      /title="Shows the active file, its language and workspace\.&#10;Settings may differ by language or folder\."/,
    );
    assert.match(
      html,
      /title="Formatting status for save, paste and type\.&#10;1\. Enabled:/,
    );
    assert.match(html, /title="Open Kira Formatting Controls dashboard"/);
    assert.match(html, /title="Open a new issue on GitHub"/);
    const art = statusArtwork({ ...context, paused });
    assert.match(art.dashboard.svg, /text-decoration="underline"/);
    assert.match(art.issue.svg, /text-decoration="underline"/);
  }
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
