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
      const badge = mount(art.state), context = mount(art.context), pause = mount(art.pause), captionImage = mount(art.pauseCaption), header = mount(art.header);
      try {
        const badgeText = badge.querySelector("text").getBBox();
        const file = Array.from(context.querySelectorAll("text")).find(text => text.textContent.startsWith("Active file:")).getBBox();
        const workspace = Array.from(context.querySelectorAll("text")).find(text => text.textContent.startsWith("Workspace:")).getBBox();
        const pauseText = pause.querySelector("text").getBBox();
        const caption = captionImage.querySelector("text").getBBox();
        const title = header.querySelector("text").getBBox();
        return {
          badgeOffsetX: badgeText.x + badgeText.width/2 - 39,
          badgeOffsetY: badgeText.y + badgeText.height/2 - 13,
          contextOffsetY: (file.y + workspace.y + workspace.height)/2 - 42,
          pauseOffsetX: pauseText.x + pauseText.width/2 - 33,
          pauseOffsetY: pauseText.y + pauseText.height/2 - 14,
          headerFits: title.x + title.width <= art.header.width,
          captionFits: caption.x + caption.width <= art.pauseCaption.width - 2,
        };
      } finally { badge.remove(); context.remove(); pause.remove(); captionImage.remove(); header.remove(); }
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
    assert.ok(measurement.headerFits, "Full extension name fits");
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
    const images = hover.locator("img");
    await images.nth(12).waitFor();
    assert.equal(await images.count(), 13, "All status artwork is rendered");
  };
  const dismiss = async () => {
    // A transient hover may already have closed after a screenshot. Focus it
    // only if present so native pointer dismissal cannot race a locator wait.
    await page.evaluate(
      `document.querySelector('.monaco-hover:has(img[alt="Kira Formatting Controls"])')?.focus()`,
    );
    await page.keyboard.press("Escape");
    await page.mouse.move(10, 200);
    await hover.waitFor({ state: "hidden" });
  };
  const tabs = await page.locator(".editor-group-container .tab").count();
  const panels = await page.locator(".part.panel:visible").count();
  await button.waitFor();
  await page.mouse.move(10, 200);
  await button.hover();
  await loaded();
  const hovered = await hover.boundingBox();
  writeFileSync(
    join(directory, "status-row-layout.json"),
    JSON.stringify(
      await hover.locator("img").evaluateAll((images) =>
        images.map((img) => {
          const box = img.getBoundingClientRect();
          const row = img.closest("tr")?.getBoundingClientRect();
          return {
            alt: img.alt,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            row: row && { y: row.y, height: row.height },
          };
        }),
      ),
      null,
      2,
    ),
  );
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
  await dismiss();
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

  const fileInfo = hover.getByRole("img", { name: /^Active file:/ });
  assert.equal(await fileInfo.getAttribute("title"), statusHelp.file);
  assert.equal(
    await fileInfo.evaluate((el) => !!el.closest("a")),
    false,
    "File information is hover-only",
  );
  const formattingInfo = hover.getByRole("img", {
    name: /^Automatic formatting:/,
  });
  assert.equal(
    await formattingInfo.getAttribute("title"),
    statusHelp.formatting,
  );
  assert.equal(
    await formattingInfo.evaluate((el) => !!el.closest("a")),
    false,
    "Formatting information is hover-only",
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
  const contextBounds = await fileInfo.boundingBox();
  const dashboardBounds = await dashboard.getByRole("img").boundingBox();
  const issueBounds = await issue.getByRole("img").boundingBox();
  assert.ok(contextBounds && dashboardBounds && issueBounds);
  assert.equal(
    dashboardBounds.x,
    contextBounds.x,
    "Footer shares the context artwork's left edge",
  );
  assert.equal(
    issueBounds.x + issueBounds.width,
    contextBounds.x + contextBounds.width,
    "Issue action shares the context artwork's right edge",
  );
  assert.equal(
    dashboardBounds.y,
    issueBounds.y,
    "Footer actions stay on the same row",
  );
  assert.equal(await issue.getAttribute("data-href"), issueUrl);
  assert.equal(
    await dashboard.getAttribute("title"),
    "Open Kira Formatting Controls dashboard",
  );
  assert.equal(await issue.getAttribute("title"), "Open a new issue on GitHub");
  const pauseLink = hover.getByRole("link", { name: "Pause", exact: true });
  assert.equal(await pauseLink.getAttribute("title"), null);
  const pauseImage = pauseLink.getByRole("img", { name: "Pause", exact: true });
  assert.equal(await pauseImage.getAttribute("title"), null);
  assert.equal((await pauseImage.boundingBox())?.width, 66);
  assert.equal((await pauseImage.boundingBox())?.height, 28);
  const pauseBounds = await pauseImage.boundingBox();
  const formatterBounds = await formatter.boundingBox();
  const separatorBounds = await hover
    .locator('img[width="400"][height="11"]')
    .boundingBox();
  assert.ok(pauseBounds && formatterBounds && separatorBounds && hovered);
  const pauseTopGap = pauseBounds.y + 0.5 - (formatterBounds.y + 55);
  const pauseBottomGap =
    separatorBounds.y + 0.5 - (pauseBounds.y + pauseBounds.height - 0.5);
  assert.ok(
    Math.abs(pauseTopGap - pauseBottomGap) <= 2,
    "Pause/Resume has equal space to both separator lines",
  );
  const formatterPadding = (15 - 1 + (55 - 43)) / 2;
  assert.ok(
    Math.abs(pauseTopGap - formatterPadding) <= 2 &&
      Math.abs(pauseBottomGap - formatterPadding) <= 2,
    "Pause/Resume padding matches Default formatter",
  );
  const footerTopGap = dashboardBounds.y + 11.5 - (separatorBounds.y + 0.5);
  const footerBottomGap =
    hovered.y + hovered.height - 1 - (dashboardBounds.y + 11.5);
  assert.ok(
    Math.abs(footerTopGap - footerBottomGap) <= 2,
    "Footer text is centered between its separator and the frame",
  );
  const caption = hover.getByRole("img", {
    name: "Pause automatic formatting until you resume.",
    exact: true,
  });
  assert.equal(await caption.evaluate((el) => !!el.closest("a")), false);
  await caption.click();
  assert.equal(await page.locator(".quick-input-widget:visible").count(), 0);
  assert.deepEqual(await hover.boundingBox(), hovered);
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
  await formattingInfo.click();
  await flags.waitFor();
  assert.deepEqual(
    await hover.boundingBox(),
    hovered,
    "Formatting stays visible",
  );

  // Exercise the unchanged confirmation workflow through its real native picker.
  const originalFlags = await flags.getAttribute("alt");
  for (const action of ["Pause", "Resume"]) {
    await hover.getByRole("link", { name: action, exact: true }).click();
    const picker = page.locator(".quick-input-widget:visible");
    await picker.waitFor();
    await picker.getByText("Continue", { exact: true }).click();
    await picker.waitFor({ state: "hidden" });
    await page.waitForTimeout(500);
    await button.click();
    await loaded();
    const nextAction = action === "Pause" ? "Resume" : "Pause";
    await hover.getByRole("img", { name: nextAction, exact: true }).waitFor();
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

  await dismiss();
  await button.focus();
  await page.keyboard.press("Enter");
  await loaded();
  await dashboard.click();
  await page
    .getByRole("tab", { name: /Formatting Controls/ })
    .first()
    .waitFor();
  console.log(
    "Approved status card verified: full title, stable hover/click and Pause/Resume bounds, button-only pause action without hover text, fixed status badge, read-only fields, stable info, native settings/issue links, keyboard access and accessible descriptions.",
  );
}
