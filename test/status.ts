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
  await button.waitFor();
  const tabs = await page.getByRole("tab").count();
  // Cold click must work with editor focus, without first hovering the item.
  await button.click();
  await hover.waitFor({ state: "visible" });
  const clicked = await hover.boundingBox();
  assert.ok(clicked);
  assert.ok(
    clicked.width >= 360 && clicked.width <= 440,
    "The native card must retain its wider layout",
  );
  assert.equal(
    await hover.locator("input,select,button,script,style").count(),
    0,
    "The status surface must not contain disabled fake form inputs or scripts",
  );
  assert.ok((await hover.locator(".codicon-chrome-maximize").count()) > 0);

  const text = (await hover.textContent()) ?? "";
  for (const label of [
    "Format on save",
    "Format on paste",
    "Format on type",
    "Write to",
    "Language",
    "Default formatter",
  ])
    assert.ok(text.includes(label));
  assert.ok(!/save actions/i.test(text));
  assert.equal(
    await page.getByRole("tab").count(),
    tabs,
    "Click must not open an editor tab",
  );
  await page.mouse.move(5, 5);
  await page.waitForTimeout(650);
  assert.ok(await hover.isVisible(), "Clicked hover must remain pinned");
  await page.screenshot({ path: join(directory, "status-click-window.png") });
  const anchor = await button.boundingBox();
  assert.ok(anchor);
  await page.screenshot({
    path: join(directory, "status-card.png"),
    clip: {
      x: clicked.x,
      y: clicked.y,
      width: clicked.width,
      height: anchor.y + anchor.height - clicked.y,
    },
  });
  await page.evaluate(axe.source);
  const accessibility = await page.evaluate<{
    violations: unknown[];
    incomplete: unknown[];
  }>(
    "axe.run(document.querySelector('.monaco-hover'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target}))})),incomplete:r.incomplete.map(v=>v.id)}))",
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
  await page.keyboard.press("Escape");
  await hover.waitFor({ state: "hidden" });
  await button.hover();
  await hover.waitFor({ state: "visible" });
  const hovered = await hover.boundingBox();
  assert.deepEqual(
    hovered,
    clicked,
    "Hover and click must use exactly the same anchored card",
  );
  assert.equal(await hover.textContent(), text);
  await page.screenshot({ path: join(directory, "status-hover-window.png") });
  const row = hover.getByRole("row").filter({ hasText: "Format on paste" });
  const before = (await row.textContent()) ?? "";
  await row.getByRole("link").click();
  await button.click();
  await hover.waitFor({ state: "visible" });
  await row
    .getByText(before.includes("Off") ? "On" : "Off", { exact: true })
    .waitFor();
  await hover.getByRole("link", { name: /Folder:/ }).click();
  await page.getByRole("option", { name: "Workspace", exact: true }).click();
  await button.click();
  await hover.waitFor({ state: "visible" });
  await hover.getByRole("link", { name: /^Workspace/ }).waitFor();
  await hover.getByRole("link", { name: /All languages/ }).click();
  await page.getByRole("option", { name: "typescript", exact: true }).click();
  await button.click();
  await hover.waitFor({ state: "visible" });
  await hover.getByRole("link", { name: /^typescript/ }).waitFor();
  await page.keyboard.press("Escape");
  await button.focus();
  await page.keyboard.press("Enter");
  await hover.waitFor({ state: "visible" });
  assert.equal(await page.getByRole("tab").count(), tabs);
  console.log(
    "Native status verified: cold click, identical hover position/content, pinning, Escape/Enter, formatting write, scope/language pickers and no editor tabs.",
  );
}
