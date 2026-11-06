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
    [...art.formatting.svg.matchAll(/stroke-width="1.3"/g)].length,
    1,
  );
  const html = statusHover(context);
  assert.ok(!/<input|<select|<button|<script|<style/.test(html));
  const actions = [...html.matchAll(/statusControl\?([^"]*)/g)].map((match) =>
    JSON.parse(decodeURIComponent(match[1] ?? "")),
  );
  assert.deepEqual(actions, [[7, "pause"]]);
  assert.match(html, /width="330" height="76"/);
  assert.equal(art.header.alt, "Kira Formatting Controls");
  assert.match(art.summary.alt, /Automatic formatting: Mixed/);
  assert.match(art.summary.svg, /data-icon="contrast"/);
  assert.match(art.context.svg, /data-icon="file-text"/);
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
    "Scope",
    "Language",
    "Formatter",
    "Open dashboard",
    "Pause",
    "Settings",
  ])
    assert.ok(html.includes(label));
  assert.match(
    statusArtwork({ ...context, paused: true }).pauseCaption.alt,
    /Restore your previous formatting settings\./,
  );
  assert.match(
    statusArtwork({ ...context, paused: true }).pause.alt,
    /^Resume/,
  );
  assert.match(
    statusArtwork({ ...context, flags: [true, true, true] }).summary.alt,
    /formatting: Enabled/,
  );
  assert.match(
    statusArtwork({ ...context, flags: [false, false, false] }).summary.alt,
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
    { flags: [true, true, true], paused: true },
    { flags: [false, false, false], paused: true },
    { flags: [true, false, true], paused: true },
  ].map((variant) => statusArtwork({ ...context, ...variant }));
  assert.equal(
    new Set(variants.map((art) => `${art.context.width}x${art.context.height}`))
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
  for (const art of variants) {
    assert.equal(art.pause.width, 66);
    assert.equal(art.pause.height, art.settings.height);
    assert.doesNotMatch(art.summary.svg, /<rect\b/);
    assert.equal(
      art.summary.width + art.summaryGap.width + art.pause.width,
      art.context.width,
      "The status and button fit the fixed card width without shifting",
    );
  }
  assert.match(variants[4]?.summary.alt ?? "", /Disabled/);
  assert.match(variants[5]?.summary.alt ?? "", /Mixed/);
  assert.notEqual(
    variants[0]?.pause.svg,
    variants[3]?.pause.svg,
    "Resume has distinct artwork without changing its dimensions",
  );
  assert.doesNotMatch(statusHover(context), /alt="Pausing"|alt="Resuming"/);
  assert.match(
    statusArtwork(context).pauseCaption.alt,
    /Pause automatic formatting until you resume\./,
  );
  assert.equal(statusArtwork(context).context.tooltip, undefined);
});

test("actions have no tooltip while keeping their labels and click targets", () => {
  for (const paused of [false, true]) {
    const html = statusHover({ ...context, paused });
    const button = [
      ...html.matchAll(
        /<a href="command:formattingControls.statusControl\?([^"]*)"([^>]*)>(.*?)<\/a>/g,
      ),
    ].find(
      (match) => JSON.parse(decodeURIComponent(match[1] ?? ""))[1] === "pause",
    );
    assert.ok(button);
    assert.equal(button[2], "");
    assert.match(button[3] ?? "", /width="66" height="24"/);
    assert.doesNotMatch(html, /title=/);
    assert.doesNotMatch(html, /formattingControls\.statusInfo/);
    const rows = [...html.matchAll(/<tr>(.*?)<\/tr>/g)].map(
      (match) => match[1] ?? "",
    );
    assert.match(
      rows[0] ?? "",
      /alt="Kira Formatting Controls".*alt="Open VS Code Settings"/,
    );
    assert.doesNotMatch(rows[0] ?? "", /alt="(?:Pause|Resume)"/);
    assert.doesNotMatch(rows[0] ?? "", /alt="Automatic formatting:/);
    const pauseIndex = rows.findIndex((row) =>
      row.includes(`alt="${paused ? "Resume" : "Pause"}"`),
    );
    assert.ok(
      pauseIndex < rows.findIndex((row) => row.includes("Format on type:")),
    );
    assert.equal(pauseIndex, 4);
    const statusIndex = rows.findIndex((row) =>
      row.includes("Automatic formatting: Mixed."),
    );
    assert.equal(statusIndex, 4);
    assert.doesNotMatch(rows[1] ?? "", /Automatic formatting: Mixed/);
    assert.equal(pauseIndex, statusIndex);
    assert.match(
      rows[statusIndex] ?? "",
      /^<td colspan="2"><img[^>]*alt="Automatic formatting: Mixed\."/,
      "The heading remains unlinked; only the Pause/Resume button is linked",
    );
    for (const row of rows.filter((row) => /alt="Active file:/.test(row)))
      assert.doesNotMatch(row, /<a\b/);
    for (const row of rows.slice(1)) assert.doesNotMatch(row, /title=/);
    const art = statusArtwork({ ...context, paused });
    assert.equal(
      art.pauseCaption.alt,
      paused ? statusHelp.resume : statusHelp.pause,
    );
    for (const action of [art.dashboard, art.issue]) {
      assert.doesNotMatch(action.svg, /text-decoration/);
      assert.doesNotMatch(action.svg, /<rect/);
      assert.equal(action.height, 36);
    }
    assert.equal(
      art.dashboard.width + art.footerGap.width + art.issue.width,
      art.context.width,
    );
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

test("file context uses full language names and a separate folder line", () => {
  for (const [language, label] of [
    ["javascript", "JavaScript"],
    ["typescript", "TypeScript"],
    ["javascriptreact", "JavaScript React"],
    ["typescriptreact", "TypeScript React"],
    ["json", "JSON"],
    ["jsonc", "JSON with Comments"],
    ["python", "Python"],
    ["shellscript", "Shell Script"],
    ["plaintext", "Plain Text"],
    ["custom", "custom"],
  ] as const) {
    const art = statusArtwork({
      ...context,
      file: "a",
      language,
      folder: "second-project",
    });
    assert.equal(art.context.height, 94);
    assert.match(art.context.svg, /y="51"[^>]*>Workspace: project<\/text>/);
    assert.match(art.context.svg, /y="69"[^>]*>Folder: second-project<\/text>/);
    assert.ok(art.context.alt.includes(` · ${label}.`));
    assert.ok(
      art.context.svg.includes(` · ${label}</text>`) ||
        art.context.tooltip?.includes(` · ${label}`),
      `Full ${label} name appears in the card or its truncated-label tooltip`,
    );
    assert.match(
      art.context.alt,
      /Workspace: project\. Folder: second-project\./,
    );
  }
  const single = statusArtwork(context);
  assert.equal(single.context.height, 76);
  assert.doesNotMatch(single.context.svg, /Folder:/);
  assert.match(single.context.alt, /TypeScript/);
});

test("long context names keep the fixed width and expose full names only when truncated", () => {
  assert.equal(statusArtwork(context).context.tooltip, undefined);
  for (const [field, name] of [
    ["workspace", "design-system-and-editor-productivity-tools-".repeat(3)],
    ["folder", "W".repeat(90)],
    ["file", `${"longfilename".repeat(12)}.ts`],
    ["workspace", "开发工作区".repeat(20)],
  ] as const) {
    const input = { ...context, [field]: name };
    const art = statusArtwork(input);
    assert.equal(art.context.width, 330);
    assert.equal(art.context.height, field === "folder" ? 94 : 76);
    assert.match(art.context.svg, /…<\/text>/);
    assert.ok(art.context.tooltip?.includes(name));
    assert.ok(art.context.alt.includes(name));
    assert.equal(art.scopes.width, 330);
    assert.equal(art.formatter.width, 330);
    assert.equal(art.formatting.width, 330);
    assert.equal(
      art.dashboard.width + art.footerGap.width + art.issue.width,
      330,
    );
    const html = statusHover(input);
    assert.match(html, /title="(?:Workspace:|Folder:|Active file:)/);
    assert.match(art.summary.svg, /data-status="Mixed"/);
  }
});

test("heading status icons distinguish every flag combination while context keeps its document icon", () => {
  for (let mask = 0; mask < 8; mask++) {
    const flags = [0, 1, 2].map((bit) => Boolean(mask & (1 << bit)));
    const expected = mask === 7 ? "Enabled" : mask === 0 ? "Disabled" : "Mixed";
    const icon =
      mask === 7 ? "circle-check" : mask === 0 ? "circle-minus" : "contrast";
    for (const paused of [false, true]) {
      const art = statusArtwork({
        ...context,
        flags,
        paused,
        workspace: "formatting-controls",
      });
      assert.match(
        art.summary.svg,
        new RegExp(`data-icon="${icon}" data-status="${expected}"`),
      );
      assert.equal(art.summary.alt, `Automatic formatting: ${expected}.`);
      assert.match(
        art.summary.svg,
        new RegExp(`x="171" y="14"[^>]*>${expected}</text>`),
      );
      assert.match(art.summary.svg, /r="7.2"/);
      assert.match(art.context.svg, /data-icon="file-text"/);
      assert.doesNotMatch(art.context.svg, /data-status=/);
      assert.doesNotMatch(
        art.context.svg,
        />(?:Enabled|Disabled|Mixed)<\/text>/,
      );
      assert.match(art.context.svg, />Workspace: formatting-controls<\/text>/);
      assert.equal(art.context.width, 330);
      assert.equal(art.context.tooltip, undefined);
    }
  }
});
