import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import type { Page } from "playwright-core";

export async function reviewStatus(
  page: Page,
  directory: string,
): Promise<void> {
  mkdirSync(directory, { recursive: true });
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
  const formatter = hover.getByRole("img", { name: /^Default formatter:/ });
  for (const image of [context, flags, formatter])
    assert.equal(
      await image.evaluate((element) => !!element.closest("a")),
      false,
      "Read-only checkbox/dropdown artwork has no command link",
    );
  await context.click({ position: { x: 330, y: 160 } });
  await flags.click({ position: { x: 14, y: 14 } });
  await formatter.click({ position: { x: 320, y: 30 } });
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
  await hover
    .getByRole("link", { name: "Automatic formatting expanded", exact: true })
    .click();
  await flags.waitFor({ state: "hidden" });
  await hover
    .getByRole("link", { name: "Automatic formatting collapsed", exact: true })
    .click();
  await flags.waitFor();
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
    "Reference-style card verified: loaded local artwork, identical hover/click bounds, pinning, read-only checkbox/dropdown displays, no picker or extra surface, disclosure, keyboard access, accessible descriptions and working dashboard navigation.",
  );
}
