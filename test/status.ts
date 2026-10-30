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
  const motion = async (expanded: boolean) => {
    await page.evaluate(`(() => {
      window.cardMotion = [];
      const start = performance.now();
      const frame = () => {
        const card = Array.from(document.querySelectorAll('.monaco-hover')).find(el => el.querySelector('img[alt^="Formatting Controls."]'));
        const bounds = card?.getBoundingClientRect();
        if (bounds) window.cardMotion.push({time:performance.now()-start,x:bounds.x,width:bounds.width,height:bounds.height,bottom:bounds.bottom});
        if (performance.now()-start < 700) requestAnimationFrame(frame);
      }; requestAnimationFrame(frame);
    })()`);
    await hover
      .getByRole("link", {
        name: `Automatic formatting ${expanded ? "expanded" : "collapsed"}`,
        exact: true,
      })
      .click();
    await page.waitForTimeout(750);
    const frames =
      await page.evaluate<
        Array<{
          time: number;
          x: number;
          width: number;
          height: number;
          bottom: number;
        }>
      >("window.cardMotion");
    writeFileSync(
      join(directory, `status-${expanded ? "collapse" : "expand"}-motion.json`),
      JSON.stringify(frames, null, 2),
    );
    const heights = [...new Set(frames.map((frame) => frame.height))];
    console.log(
      `Status ${expanded ? "collapse" : "expand"} animation: ${JSON.stringify(heights)}`,
    );
    assert.ok(
      heights.length > 3,
      "Disclosure renders intermediate card heights",
    );
    assert.ok(
      frames.every(
        (frame, index) =>
          index === 0 ||
          (expanded
            ? frame.height <= (frames[index - 1]?.height ?? frame.height)
            : frame.height >= (frames[index - 1]?.height ?? frame.height)),
      ),
      "Disclosure height moves smoothly in one direction",
    );
    assert.ok(
      Math.max(...frames.map((frame) => frame.width)) -
        Math.min(...frames.map((frame) => frame.width)) <=
        1,
      "Animation keeps card width stable",
    );
    assert.ok(
      Math.max(...frames.map((frame) => frame.bottom)) -
        Math.min(...frames.map((frame) => frame.bottom)) <=
        1,
      "Animation keeps card anchored above the status bar",
    );
  };
  await motion(true);
  await flags.waitFor({ state: "hidden" });
  await motion(false);
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
    "Reference-style card verified: loaded local artwork, identical hover/click bounds, pinning, read-only checkbox/dropdown displays, no picker or extra surface, animated disclosure with stable width and bottom anchor, keyboard access, accessible descriptions and working dashboard navigation.",
  );
}
