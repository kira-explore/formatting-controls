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
    .filter({ hasText: "Formatting Controls" });
  const editorTabs = () => page.locator(".editor-group-container .tab").count();
  const panels = () => page.locator(".part.panel:visible").count();
  await button.waitFor();
  const tabs = await editorTabs();
  const panelCount = await panels();
  await button.hover();
  await hover.waitFor({ state: "visible" });
  const hovered = await hover.boundingBox();
  const hoveredText = await hover.textContent();
  await page.screenshot({
    animations: "disabled",
    path: join(directory, "status-hover-window.png"),
  });
  await page.mouse.move(10, 200);
  await hover.waitFor({ state: "hidden" });
  await button.click();
  await hover.waitFor({ state: "visible" });
  const clicked = await hover.boundingBox();
  assert.ok(clicked);
  assert.equal(
    await editorTabs(),
    tabs,
    "A cold status click must not open an editor tab",
  );
  assert.equal(
    await panels(),
    panelCount,
    "A cold status click must not open the Panel",
  );
  assert.equal(
    await hover.locator("input,select,button,script,style").count(),
    0,
  );
  const text = await hover.textContent();
  assert.deepEqual(
    clicked,
    hovered,
    "Hover and click share the same placement",
  );
  assert.equal(text, hoveredText);
  assert.ok(text?.includes("Active file:"));
  assert.ok(text?.includes("Apply to language"));
  assert.ok(!text?.includes("Set here"));
  await page.mouse.move(5, 5);
  await page.waitForTimeout(650);
  assert.ok(
    await hover.isVisible(),
    "Click pins the status hover after the pointer leaves",
  );
  await page.screenshot({
    animations: "disabled",
    path: join(directory, "status-click-window.png"),
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
    "Native status card accessibility",
  );
  const row = hover.getByRole("row").filter({ hasText: "Format on paste" });
  const before = (await row.locator("td").last().textContent())?.trim() ?? "";
  await hover
    .getByRole("link", { name: "Change formatting…", exact: true })
    .click();
  const quickInput = page.locator(".quick-input-widget");
  await quickInput.waitFor({ state: "visible" });
  await page.screenshot({
    animations: "disabled",
    path: join(directory, "formatting-picker.png"),
  });
  const typeChoice = quickInput
    .locator(".monaco-list-row")
    .filter({ hasText: "Format on paste" });
  await typeChoice.locator(".monaco-checkbox").click();
  await quickInput.getByRole("button", { name: "OK", exact: true }).click();
  await quickInput.waitFor({ state: "hidden" });
  await button.click();
  await hover.waitFor({ state: "visible" });
  await row
    .locator("td")
    .last()
    .filter({ hasText: before === "On" ? /^Off$/ : /^On$/ })
    .waitFor();
  assert.equal(
    (await row.locator("td").last().textContent())?.trim(),
    before === "On" ? "Off" : "On",
  );
  assert.deepEqual(
    await hover.boundingBox(),
    clicked,
    "Formatting changes keep the card in position",
  );
  await hover
    .getByRole("link", { name: "Change formatting…", exact: true })
    .click();
  await quickInput.waitFor({ state: "visible" });
  await typeChoice.locator(".monaco-checkbox").click();
  await quickInput.getByRole("button", { name: "OK", exact: true }).click();
  await quickInput.waitFor({ state: "hidden" });
  await button.click();
  await hover.waitFor({ state: "visible" });
  await row
    .locator("td")
    .last()
    .filter({ hasText: new RegExp(`^${before}$`) })
    .waitFor();
  assert.equal((await row.locator("td").last().textContent())?.trim(), before);
  await hover.getByRole("link", { name: /Automatic formatting/ }).click();
  await row.waitFor({ state: "hidden" });
  await hover.getByRole("link", { name: /Automatic formatting/ }).click();
  await row.waitFor();
  await page.screenshot({
    animations: "disabled",
    path: join(directory, "status-card.png"),
  });
  await hover.getByRole("link", { name: /Folder:/ }).click();
  await quickInput.waitFor({ state: "visible" });
  await page.screenshot({
    animations: "disabled",
    path: join(directory, "scope-picker.png"),
  });
  await page.getByRole("option", { name: "Workspace", exact: true }).click();
  await button.click();
  await hover.waitFor({ state: "visible" });
  await hover.getByRole("link", { name: /^Workspace/ }).waitFor();
  await hover.getByRole("link", { name: /All languages/ }).click();
  await page.getByRole("option", { name: "typescript", exact: true }).click();
  await button.click();
  await hover.waitFor({ state: "visible" });
  await hover.getByRole("link", { name: /^typescript/ }).waitFor();
  await hover
    .getByRole("link", { name: "Not configured", exact: true })
    .click();
  await page.getByRole("option", { name: /TypeScript \/ JavaScript/ }).click();
  await button.click();
  await hover.waitFor({ state: "visible" });
  await hover
    .getByRole("link", {
      name: "TypeScript / JavaScript",
      exact: true,
    })
    .waitFor();
  await hover.screenshot({
    animations: "disabled",
    path: join(directory, "status-card.png"),
  });
  await page.keyboard.press("Escape");
  await button.focus();
  await page.keyboard.press("Enter");
  await hover.waitFor({ state: "visible" });
  assert.equal(await editorTabs(), tabs);
  assert.equal(await panels(), panelCount);
  await hover
    .getByRole("link", { name: "Open dashboard ↗", exact: true })
    .click();
  await page
    .getByRole("tab", { name: /Formatting Controls/ })
    .first()
    .waitFor();
  console.log(
    "Anchored card verified: cold click, pinning, identical hover/click placement, no dock or editor tab, repeated stable toggles, disclosure, native pickers, keyboard access, accessibility and separate dashboard navigation.",
  );
}
