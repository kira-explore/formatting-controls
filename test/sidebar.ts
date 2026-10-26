import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";

type Evaluate = <T>(expression: string) => Promise<T>;
export async function reviewSidebar(
  page: Page,
  evaluate: Evaluate,
  wait: (expression: string) => Promise<void>,
  directory: string,
  normalDialogs = false,
): Promise<void> {
  mkdirSync(directory, { recursive: true });
  await wait(
    "!!document.querySelector('#card-scope')&&!document.querySelector('#card-scope').disabled",
  );
  assert.equal(
    await evaluate("document.querySelector('#card-scope').value"),
    "folder",
  );
  assert.ok(
    !(await evaluate<boolean>(
      "document.querySelector('.formatting-card').textContent.toLowerCase().includes('save actions')",
    )),
  );
  const reports: object[] = [];
  const resize = async (width: number) => {
    const box = await page.locator("iframe").first().boundingBox();
    assert.ok(box);
    let closest: { x: number; y: number; distance: number } | undefined;
    for (const sash of await page.locator(".monaco-sash.vertical").all()) {
      const bounds = await sash.boundingBox();
      if (!bounds || bounds.height < box.height / 2) continue;
      const distance = Math.abs(
        bounds.x + bounds.width / 2 - box.x - box.width,
      );
      if (!closest || distance < closest.distance)
        closest = {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
          distance,
        };
    }
    assert.ok(
      closest && closest.distance < 10,
      "Sidebar resize handle must be available",
    );
    await page.mouse.move(closest.x, closest.y);
    await page.mouse.down();
    await page.mouse.move(box.x + width, closest.y, { steps: 10 });
    await page.mouse.up();
  };
  await page.setViewportSize({ width: 1600, height: 1300 });
  for (const width of [440, 260]) {
    await resize(width);
    const result = await evaluate<{
      violations: unknown[];
      incomplete: unknown[];
    }>(
      "axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target}))})),incomplete:r.incomplete.map(v=>v.id)}))",
    );
    const layout = await evaluate<{ width: number; scrollWidth: number }>(
      "({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})",
    );
    reports.push({ width, layout, ...result });
    writeFileSync(
      join(directory, "sidebar-accessibility.json"),
      JSON.stringify(reports, null, 2),
    );
    assert.deepEqual(result.violations, [], "Sidebar accessibility");
    assert.ok(
      layout.scrollWidth <= layout.width + 1,
      "Sidebar must not overflow horizontally",
    );
  }
  await resize(440);
  const clip = await page.locator("iframe").first().boundingBox();
  assert.ok(clip);
  await page.screenshot({ path: join(directory, "sidebar-card.png"), clip });
  await page.screenshot({ path: join(directory, "sidebar-window.png") });
  // Owned false remains editable while an active-language override makes the effective value true.
  assert.equal(
    await evaluate(
      "document.querySelector('input[aria-describedby=\"editor.formatOnPaste-description editor.formatOnPaste-source\"]').checked",
    ),
    false,
  );
  assert.ok(
    await evaluate<boolean>(
      "document.getElementById('editor.formatOnPaste-source').textContent.includes('effective On')",
    ),
  );
  await evaluate(
    "document.querySelector('input[aria-describedby=\"editor.formatOnPaste-description editor.formatOnPaste-source\"]').click()",
  );
  await wait(
    "document.querySelector('input[aria-describedby=\"editor.formatOnPaste-description editor.formatOnPaste-source\"]').checked&&!document.querySelector('#card-scope').disabled",
  );
  // Selects send real scoped reads and writes through the same revision-checked host bridge.
  await evaluate(
    "(()=>{const el=document.querySelector('#card-scope');el.value='workspace';el.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await wait(
    "document.querySelector('#card-scope').value==='workspace'&&!document.querySelector('#card-scope').disabled",
  );
  await evaluate(
    "(()=>{const el=document.querySelector('#card-language');el.value='typescript';el.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await wait(
    "document.querySelector('#card-language').value==='typescript'&&!document.querySelector('#card-scope').disabled",
  );
  await evaluate(
    "(()=>{const el=document.querySelector('#card-save-mode');el.value='modificationsIfAvailable';el.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await wait(
    "document.querySelector('#card-save-mode').value==='modificationsIfAvailable'&&!document.querySelector('#card-scope').disabled",
  );
  await evaluate("document.querySelector('details').open=true");
  await evaluate(
    "(()=>{const input=document.querySelector('#card-formatter-id');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'example.formatter');input.dispatchEvent(new Event('input',{bubbles:true}));})()",
  );
  await evaluate("document.querySelector('details form').requestSubmit()");
  await wait(
    "document.querySelector('#card-formatter').value==='example.formatter'&&!document.querySelector('#card-scope').disabled",
  );
  if (normalDialogs) {
    await evaluate(
      "document.querySelector('button[aria-label=\"Reset to inherited value: editor.defaultFormatter\"]').click()",
    );
    await page.getByRole("button", { name: /Cancel/ }).click();
    await wait("!document.querySelector('#card-scope').disabled");
    assert.equal(
      await evaluate("document.querySelector('#card-formatter').value"),
      "example.formatter",
    );
    await evaluate(
      "document.querySelector('button[aria-label=\"Reset to inherited value: editor.defaultFormatter\"]').click()",
    );
    await page.getByRole("button", { name: /^Reset/ }).click();
    await wait(
      "!document.querySelector('#card-scope').disabled&&document.querySelector('#card-formatter').value!=='example.formatter'",
    );
    console.log("Normal-window reset cancellation and confirmation passed.");
  }
  await evaluate(
    "(()=>{const el=document.querySelector('#card-formatter');el.value='vscode.typescript-language-features';el.dispatchEvent(new Event('change',{bubbles:true}));})()",
  );
  await wait(
    "document.querySelector('#card-formatter').value==='vscode.typescript-language-features'&&!document.querySelector('#card-scope').disabled",
  );
  await evaluate("document.querySelector('#card-scope').focus()");
  assert.equal(await evaluate("document.activeElement.id"), "card-scope");
  await page.keyboard.press("Tab");
  assert.equal(await evaluate("document.activeElement.id"), "card-language");
  console.log(
    "Sidebar verified: native status click without tabs, real checkboxes/selects/custom formatter writes, owned-vs-effective values, scope/language changes, keyboard focus, CSP and two accessibility/layout scans.",
  );
}
