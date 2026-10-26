import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
export async function reviewStatus(
  page: Page,
  directory: string,
): Promise<void> {
  mkdirSync(directory, { recursive: true });
  const button = page.getByRole("button", {
    name: /^Formatting: (ON|OFF|MIXED)$/,
  });
  await button.waitFor();
  const tabs = await page.getByRole("tab").count();
  await button.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(directory, "sidebar-after-click.png") });
  await page.locator("iframe").first().waitFor({ state: "visible" });
  await page.screenshot({ path: join(directory, "sidebar-open-window.png") });
  assert.equal(
    await page.getByRole("tab").count(),
    tabs,
    "Status click must open a sidebar, not an editor tab",
  );
}
