import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import type { Page } from "playwright-core";
import { statusArtwork } from "../shared/status-artwork";
import { issueUrl, statusHelp } from "../shared/status-help";

export async function reviewStatus(
  page: Page,
  directory: string,
): Promise<void> {
  mkdirSync(directory, { recursive: true });
  const fixtures = [
    { flags: [true, true, true], paused: false },
    { flags: [false, false, false], paused: false },
    { flags: [true, false, true], paused: false },
    { flags: [false, false, false], paused: true },
  ].map((state) =>
    statusArtwork({
      ...state,
      file: "app.ts",
      language: "typescript",
      workspace: "project",
      scope: "Workspace",
      languageScope: "All languages",
      owned: [],
      revision: 1,
      version: "0.5.0",
      canPause: true,
    }),
  );
  const alignment = await page.evaluate<
    Array<{
      badgeOffsetX: number;
      badgeOffsetY: number;
      contextOffsetY: number;
      pauseOffsetX: number;
      pauseOffsetY: number;
      headerFits: boolean;
      captionFits: boolean;
    }>
  >(`(fixtures => {
    const namespace = "http://www.w3.org/2000/svg";
    function mount(part) {
      const stack = [];
      let root;
      for (const match of part.svg.matchAll(/<\\/?([a-z]+)\\b([^>]*)>|([^<]+)/gi)) {
        if (match[3]) {
          if (stack.length) stack[stack.length-1].append(document.createTextNode(match[3]));
          continue;
        }
        if (match[0].startsWith("</")) { stack.pop(); continue; }
        if (!["svg","g","text","tspan","rect","circle","path"].includes(match[1])) throw new Error("Unexpected SVG node");
        const element = document.createElementNS(namespace, match[1]);
        for (const attr of match[2].matchAll(/([\\w-]+)="([^"]*)"/g)) element.setAttribute(attr[1], attr[2]);
        if (stack.length) stack[stack.length-1].append(element); else root = element;
        if (!match[0].endsWith("/>")) stack.push(element);
      }
      document.body.append(root);
      return root;
    }
    return fixtures.map(art => {
      const badge = mount(art.state), context = mount(art.context), pause = mount(art.pause), header = mount(art.header);
      try {
        const badgeText = badge.querySelector("text").getBBox();
        const file = Array.from(context.querySelectorAll("text")).find(text => text.textContent.startsWith("Active file:")).getBBox();
        const workspace = Array.from(context.querySelectorAll("text")).find(text => text.textContent.startsWith("Workspace:")).getBBox();
        const pauseText = pause.querySelector("text").getBBox();
        const caption = pause.querySelectorAll("text")[1].getBBox();
        const title = header.querySelector("text").getBBox();
        return {
          badgeOffsetX: badgeText.x + badgeText.width/2 - 39,
          badgeOffsetY: badgeText.y + badgeText.height/2 - 13,
          contextOffsetY: (file.y + workspace.y + workspace.height)/2 - 34,
          pauseOffsetX: pauseText.x + pauseText.width/2 - 34,
          pauseOffsetY: pauseText.y + pauseText.height/2 - 19,
          headerFits: title.x + title.width <= art.header.width,
          captionFits: caption.x + caption.width <= art.pause.width - 2,
        };
      } finally { badge.remove(); context.remove(); pause.remove(); header.remove(); }
    });
  })(${JSON.stringify(fixtures)})`);
  writeFileSync(
    join(directory, "status-alignment.json"),
    JSON.stringify(alignment, null, 2),
  );
  for (const measurement of alignment) {
    for (const offset of [
      measurement.badgeOffsetX,
      measurement.badgeOffsetY,
      measurement.contextOffsetY,
      measurement.pauseOffsetX,
      measurement.pauseOffsetY,
    ])
      assert.ok(
        Math.abs(offset) <= 1,
        "Status, context and Pause/Resume text stay centered",
      );
    assert.ok(measurement.headerFits, "Full extension name and version fit");
    assert.ok(measurement.captionFits, "Both Pause/Resume captions fit");
  }

  const button = page.getByRole("button", {
    name: /^Formatting: (ON|OFF|MIXED)$/,
  });
  const hover = page.locator(".monaco-hover").filter({
    has: page.getByRole("img", { name: /^Kira Formatting Controls/ }),
  });
  const loaded = async () => {
    await hover.waitFor({ state: "visible" });
    await page.waitForFunction(`(() => {
      const images = Array.from(document.querySelectorAll('.monaco-hover img'));
      return images.length >= 10 && images.every(img => img.complete && img.naturalWidth > 0);
    })()`);
  };
  const tabs = await page.locator(".editor-group-container .tab").count();
  const panels = await page.locator(".part.panel:visible").count();
  await button.waitFor();
  await page.mouse.move(10, 200);
  await button.hover();
  await loaded();
  const hovered = await hover.boundingBox();
  await hover.screenshot({
    path: join(directory, "status-implementation-probe.png"),
  });
  writeFileSync(
    join(directory, "status-rendered.html"),
    await hover.innerHTML(),
  );
  const labels = await hover
    .locator("img")
    .evaluateAll((images) => images.map((img) => img.getAttribute("alt")));
  await page.screenshot({
    animations: "disabled",
    path: join(directory, "status-hover-window.png"),
  });
  await hover.focus();
  await page.keyboard.press("Escape");
  await page.mouse.move(10, 200);
  await hover.waitFor({ state: "hidden" });
  await button.click();
  await loaded();
  assert.deepEqual(
    await hover.boundingBox(),
    hovered,
    "Hover and click have identical bounds",
  );
  assert.deepEqual(
    await hover
      .locator("img")
      .evaluateAll((images) => images.map((img) => img.getAttribute("alt"))),
    labels,
  );
  assert.equal(
    await page.locator(".editor-group-container .tab").count(),
    tabs,
  );
  assert.equal(await page.locator(".part.panel:visible").count(), panels);
  assert.equal(
    await hover.locator("input,select,button,script,style").count(),
    0,
  );
  const scopes = hover.getByRole("img", { name: /^Write to:/ });
  const flags = hover.getByRole("img", { name: /^Format on save:/ });
  const formatter = hover.getByRole("img", { name: /^Default formatter:/ });
  for (const image of [scopes, flags, formatter])
    assert.equal(
      await image.evaluate((el) => !!el.closest("a")),
      false,
      "Read-only values have no command",
    );
  await scopes.click({ position: { x: 330, y: 45 } });
  await flags.click({ position: { x: 14, y: 18 } });
  await formatter.click({ position: { x: 320, y: 26 } });
  assert.equal(await page.locator(".quick-input-widget:visible").count(), 0);
  assert.deepEqual(await hover.boundingBox(), hovered);

  const fileInfo = hover
    .getByRole("img", { name: /^Active file:/ })
    .locator("..");
  assert.equal(await fileInfo.getAttribute("title"), statusHelp.file);
  const formattingInfo = hover
    .getByRole("img", { name: "About automatic formatting", exact: true })
    .locator("..");
  assert.equal(
    await formattingInfo.getAttribute("title"),
    statusHelp.formatting,
  );
  const settings = hover.getByRole("link", {
    name: "Open VS Code Settings",
    exact: true,
  });
  assert.equal(
    await settings
      .getByRole("img", { name: "Open VS Code Settings", exact: true })
      .count(),
    1,
  );
  writeFileSync(
    join(directory, "status-accessible-names.txt"),
    await hover.ariaSnapshot(),
  );
  const dashboard = hover.getByRole("link", { name: /^Open dashboard/ });
  const issue = hover.getByRole("link", { name: /^Report an issue/ });
  assert.equal(await issue.getAttribute("data-href"), issueUrl);
  const feedback = [];
  for (const link of [settings, dashboard, issue]) {
    await page.mouse.move(5, 5);
    const before = await link.evaluate((el) => {
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (!style) throw new Error("Missing rendered styles");
      return {
        color: style.color,
        decoration: style.textDecorationLine,
        background: style.backgroundColor,
      };
    });
    await link.hover();
    const after = await link.evaluate((el) => {
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (!style) throw new Error("Missing rendered styles");
      return {
        color: style.color,
        decoration: style.textDecorationLine,
        background: style.backgroundColor,
      };
    });
    feedback.push({ name: await link.getAttribute("title"), before, after });
    assert.deepEqual(
      await hover.boundingBox(),
      hovered,
      "Hover feedback cannot move the card",
    );
  }
  writeFileSync(
    join(directory, "status-hover-feedback.json"),
    JSON.stringify(feedback, null, 2),
  );
  await page.mouse.move(5, 5);
  await page.waitForTimeout(650);
  assert.ok(await hover.isVisible(), "Click pins the card");
  await page.screenshot({
    animations: "disabled",
    path: join(directory, "status-click-window.png"),
  });
  await hover.screenshot({
    animations: "disabled",
    path: join(directory, "status-card.png"),
  });

  await page.evaluate(axe.source);
  const accessibility = await page.evaluate<{ violations: unknown[] }>(
    `axe.run(document.querySelector('.monaco-hover'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}))`,
  );
  writeFileSync(
    join(directory, "status-accessibility.json"),
    JSON.stringify(accessibility, null, 2),
  );
  assert.deepEqual(accessibility.violations, []);
  await hover
    .getByRole("img", { name: "Automatic formatting", exact: true })
    .click();
  await flags.waitFor();
  assert.deepEqual(
    await hover.boundingBox(),
    hovered,
    "Formatting stays visible",
  );

  // Exercise the unchanged confirmation workflow through its real native picker.
  const originalFlags = await flags.getAttribute("alt");
  for (const action of ["Pause", "Resume"]) {
    await hover
      .getByRole("link", { name: new RegExp(`^${action}\\.`) })
      .click();
    const picker = page.locator(".quick-input-widget:visible");
    await picker.waitFor();
    await picker.getByText("Continue", { exact: true }).click();
    await picker.waitFor({ state: "hidden" });
    await page.waitForTimeout(500);
    await button.click();
    await loaded();
    const nextAction = action === "Pause" ? "Resume" : "Pause";
    await hover
      .getByRole("img", { name: new RegExp(`^${nextAction}\\.`) })
      .waitFor();
    const bounds = await hover.boundingBox();
    assert.equal(
      bounds?.width,
      hovered?.width,
      "Pause/Resume keeps the card width",
    );
    assert.equal(
      bounds?.height,
      hovered?.height,
      "Pause/Resume keeps the card height",
    );
    await hover.screenshot({
      path: join(directory, `status-${action.toLowerCase()}-complete.png`),
    });
  }
  assert.equal(
    await flags.getAttribute("alt"),
    originalFlags,
    "Resume restores the previous formatting snapshot",
  );

  await hover.focus();
  await page.keyboard.press("Escape");
  await hover.waitFor({ state: "hidden" });
  await button.focus();
  await page.keyboard.press("Enter");
  await loaded();
  await dashboard.click();
  await page
    .getByRole("tab", { name: /Formatting Controls/ })
    .first()
    .waitFor();
  console.log(
    "Approved status card verified: full title/version, stable hover/click and Pause/Resume bounds, fixed status badge, read-only fields, stable info, native settings/issue links, hover feedback, keyboard access and accessible descriptions.",
  );
}
