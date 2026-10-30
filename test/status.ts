import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import type { Page } from "playwright-core";
import { statusArtwork } from "../shared/status-artwork";

export async function reviewStatus(
  page: Page,
  directory: string,
): Promise<void> {
  mkdirSync(directory, { recursive: true });
  const stateArtwork = [
    { label: "On", flags: [true, true, true] },
    { label: "Off", flags: [false, false, false] },
    { label: "Mixed", flags: [true, false, true] },
    { label: "Paused", flags: [false, false, false], paused: true },
  ].map((state) => ({
    label: state.label,
    svg: statusArtwork({
      ...state,
      file: "app.ts",
      language: "typescript",
      workspace: "project",
      scope: "Workspace",
      languageScope: "All languages",
      owned: [],
      revision: 1,
    }).context.svg,
  }));
  const alignment = await page.evaluate<
    Array<{
      state: string;
      badgeHorizontalOffset: number;
      badgeVerticalOffset: number;
      contextVerticalOffset: number;
    }>
  >(`(artworks => artworks.map(artwork => {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    const group = document.createElementNS(namespace, "g");
    const attributes = (element, source) => {
      for (const match of source.matchAll(/([\\w-]+)="([^"]*)"/g)) element.setAttribute(match[1], match[2]);
    };
    attributes(group, artwork.svg.match(/<g\\s([^>]+)>/i)?.[1] ?? "");
    for (const match of artwork.svg.matchAll(/<text\\s([^>]+)>([^<]*)<\\/text>/gi)) {
      const text = document.createElementNS(namespace, "text");
      attributes(text, match[1]);
      text.textContent = match[2];
      group.append(text);
    }
    svg.append(group);
    document.body.append(svg);
    try {
      const texts = Array.from(svg.querySelectorAll("text"));
      const badge = texts.find(text => text.textContent === artwork.label);
      const fileText = texts.find(text => text.textContent?.startsWith("Active file:"));
      const workspaceText = texts.find(text => text.textContent?.startsWith("Workspace:"));
      if (!badge || !fileText || !workspaceText) throw new Error("Missing alignment text");
      const file = fileText.getBBox();
      const workspace = workspaceText.getBBox();
      const bounds = badge.getBBox();
      return {
        state: artwork.label,
        badgeHorizontalOffset: bounds.x + bounds.width / 2 - 339,
        badgeVerticalOffset: bounds.y + bounds.height / 2 - 17,
        contextVerticalOffset: (file.y + workspace.y + workspace.height) / 2 - 74,
      };
    } finally { svg.remove(); }
  }))(${JSON.stringify(stateArtwork)})`);
  writeFileSync(
    join(directory, "status-alignment.json"),
    JSON.stringify(alignment, null, 2),
  );
  for (const measurement of alignment) {
    assert.ok(
      Math.abs(measurement.badgeHorizontalOffset) <= 1,
      `${measurement.state} badge text is horizontally centered`,
    );
    assert.ok(
      Math.abs(measurement.badgeVerticalOffset) <= 1,
      `${measurement.state} badge text is vertically centered`,
    );
    assert.ok(
      Math.abs(measurement.contextVerticalOffset) <= 1,
      "Active file and workspace text are vertically centered",
    );
  }
  const button = page.getByRole("button", {
    name: /^Formatting: (ON|OFF|MIXED)$/,
  });
  const hover = page
    .locator(".monaco-hover")
    .filter({ has: page.getByRole("img", { name: /^Formatting Controls\./ }) });
  const tabs = await page.locator(".editor-group-container .tab").count();
  const panels = await page.locator(".part.panel:visible").count();
  const loaded = async () => {
    await hover.waitFor({ state: "visible" });
    await page.waitForFunction(
      `(() => { const images = Array.from(document.querySelectorAll('.monaco-hover img')); return images.length >= 6 && images.every(img => img.complete && img.naturalWidth > 0); })()`,
    );
  };
  await button.waitFor();
  await page.mouse.move(10, 200);
  await button.hover();
  await loaded();
  const hovered = await hover.boundingBox();
  const labels = await hover
    .locator("img")
    .evaluateAll((images) => images.map((img) => img.getAttribute("alt")));
  await page.screenshot({
    animations: "disabled",
    path: join(directory, "status-hover-window.png"),
  });
  await page.mouse.move(10, 200);
  await page.keyboard.press("Escape");
  await hover.waitFor({ state: "hidden" });
  await button.click();
  await loaded();
  assert.deepEqual(
    await hover.boundingBox(),
    hovered,
    "Hover and click have identical bounds after images load",
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
  assert.ok(labels.some((label) => label?.includes("Active file:")));
  assert.ok(labels.some((label) => label?.includes("Format on save:")));
  const context = hover.getByRole("img", { name: /^Formatting Controls\./ });
  const flags = hover.getByRole("img", { name: /^Format on save:/ });
  for (const image of [context, flags])
    assert.equal(
      await image.evaluate((element) => !!element.closest("a")),
      false,
      "Read-only checkbox/dropdown artwork has no command link",
    );
  await context.click({ position: { x: 330, y: 160 } });
  await flags.click({ position: { x: 14, y: 14 } });
  await flags.click({ position: { x: 320, y: 170 } });
  assert.equal(
    await page.locator(".quick-input-widget:visible").count(),
    0,
    "Read-only displays do not launch pickers",
  );
  assert.deepEqual(await hover.boundingBox(), hovered);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(650);
  assert.ok(
    await hover.isVisible(),
    "Click pins the card after the pointer leaves",
  );
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
  assert.deepEqual(
    accessibility.violations,
    [],
    "Artwork has accessible names and action links",
  );
  const heading = hover.getByRole("img", {
    name: "Automatic formatting",
    exact: true,
  });
  assert.equal(
    await heading.evaluate((element) => !!element.closest("a")),
    false,
  );
  await heading.click();
  await flags.waitFor();
  assert.deepEqual(
    await hover.boundingBox(),
    hovered,
    "Formatting remains visible when its heading is clicked",
  );
  await page.keyboard.press("Escape");
  await hover.waitFor({ state: "hidden" });
  await button.focus();
  await page.keyboard.press("Enter");
  await loaded();
  await hover
    .getByRole("link", { name: "Open dashboard", exact: true })
    .click();
  await page
    .getByRole("tab", { name: /Formatting Controls/ })
    .first()
    .waitFor();
  console.log(
    "Reference-style card verified: loaded local artwork, identical hover/click bounds, pinning, read-only checkbox/dropdown displays, no picker or extra surface, always-visible formatting, keyboard access, accessible descriptions and working dashboard navigation.",
  );
}
