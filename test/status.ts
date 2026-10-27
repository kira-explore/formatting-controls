import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import type { Browser, Page } from "playwright-core";
import { attachControls } from "./webview";

export async function reviewStatus(
  page: Page,
  directory: string,
  browser: Browser,
): Promise<void> {
  mkdirSync(directory, { recursive: true });
  const button = page.getByRole("button", {
    name: /^Formatting: (ON|OFF|MIXED)$/,
  });
  const hover = page
    .locator(".monaco-hover")
    .filter({ hasText: "Formatting Controls" });
  await button.waitFor();
  await button.hover();
  await hover.waitFor({ state: "visible" });
  const text = await hover.textContent();
  assert.ok(text?.includes("Active file:"));
  assert.ok(text?.includes("Apply to language"));
  assert.ok(!text?.includes("Set here"));
  assert.equal(
    await hover.locator("input,select,button,script,style").count(),
    0,
  );
  await page.screenshot({ path: join(directory, "status-hover-window.png") });
  const tabs = await page.locator(".editor-group-container .tab").count();
  await button.click();
  const controls = await attachControls(browser);
  try {
    const { evaluate, wait } = controls;
    assert.equal(
      await page.locator(".editor-group-container .tab").count(),
      tabs,
      "Status click must open a Panel view without another editor tab",
    );
    assert.equal(
      await evaluate<string>('document.querySelector("h1").textContent'),
      "Formatting Controls",
    );
    assert.equal(
      await evaluate<number>(
        'document.querySelectorAll("input[type=checkbox]").length',
      ),
      3,
    );
    assert.equal(
      await evaluate<number>(
        'document.querySelectorAll(".brand-mark,img").length',
      ),
      0,
    );
    const change = async (label: string, value: string) => {
      await evaluate(
        `(()=>{const select=document.querySelector('select[aria-label=${JSON.stringify(label)}]');select.value=${JSON.stringify(value)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`,
      );
      await wait(
        `document.querySelector('select[aria-label=${JSON.stringify(label)}]').value===${JSON.stringify(value)} && !document.querySelector('select:disabled')`,
      );
    };
    await change("Write to", "workspace");
    await change("Apply to language", "typescript");
    const before = await evaluate<{
      x: number;
      y: number;
      width: number;
      height: number;
      checked: boolean;
    }>(
      `(()=>{const e=document.querySelector('input[aria-label="Format on type"]');const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,checked:e.checked};})()`,
    );
    await evaluate(
      `document.querySelector('input[aria-label="Format on type"]').click()`,
    );
    await wait(
      `document.querySelector('input[aria-label="Format on type"]').checked===${!before.checked} && !document.querySelector('input:disabled')`,
    );
    const after = await evaluate<{
      x: number;
      y: number;
      width: number;
      height: number;
      checked: boolean;
    }>(
      `(()=>{const e=document.querySelector('input[aria-label="Format on type"]');const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,checked:e.checked};})()`,
    );
    assert.deepEqual(
      { ...after, checked: before.checked },
      before,
      "Checkbox geometry stays stable when inheritance becomes explicit",
    );
    await evaluate('document.querySelector("summary").click()');
    assert.equal(
      await evaluate<boolean>('document.querySelector("details").open'),
      false,
    );
    await evaluate('document.querySelector("summary").click()');
    const panel = await page.locator(".part.panel").boundingBox();
    if (panel) {
      const sashes = await page
        .locator(".monaco-sash.horizontal")
        .evaluateAll((elements) =>
          elements
            .map((e) => {
              const r = e.getBoundingClientRect();
              return { x: r.x, y: r.y, width: r.width, height: r.height };
            })
            .filter((r) => r.width > 300 && r.height > 0),
        );
      const sash = sashes.sort(
        (a, b) => Math.abs(a.y - panel.y) - Math.abs(b.y - panel.y),
      )[0];
      if (sash) {
        await page.mouse.move(
          sash.x + sash.width / 2,
          sash.y + sash.height / 2,
        );
        await page.mouse.down();
        await page.mouse.move(sash.x + sash.width / 2, 350, { steps: 12 });
        await page.mouse.up();
      }
    }
    await page.screenshot({
      path: join(directory, "docked-controls-window.png"),
    });
    await evaluate(axe.source);
    const reports = [];
    for (const width of [1600, 460]) {
      await page.setViewportSize({ width, height: 1100 });
      const report = await evaluate<{
        violations: unknown[];
        width: number;
        scroll: number;
      }>(
        `axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),width:innerWidth,scroll:document.documentElement.scrollWidth}))`,
      );
      reports.push(report);
      writeFileSync(
        join(directory, "controls-accessibility.json"),
        JSON.stringify(reports, null, 2),
      );
      assert.deepEqual(report.violations, [], "Docked controls accessibility");
      assert.ok(
        report.scroll <= report.width + 1,
        "Controls reflow without horizontal scrolling",
      );
    }
    await page.setViewportSize({ width: 1600, height: 1100 });
    const csp = await evaluate<string>(
      'document.querySelector("meta[http-equiv=Content-Security-Policy]").content',
    );
    assert.ok(
      csp.includes("default-src 'none'") &&
        !/unsafe-inline|unsafe-eval/.test(csp),
    );
    await evaluate(`document.querySelector('.quick-footer button').click()`);
    await page
      .getByRole("tab", { name: /Formatting Controls/ })
      .first()
      .waitFor();
    console.log(
      "Controls verified: native status summary, docked WebviewView without editor tab, inline scope/language selects, persisted checkbox write, stable geometry, disclosure, CSP, responsive accessibility and dashboard navigation.",
    );
  } finally {
    await controls.dispose();
  }
}
