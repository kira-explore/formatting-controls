import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import axe from "axe-core";
import { chromium } from "playwright-core";

interface Context {
  id: number;
  auxData?: { isDefault?: boolean };
}
interface Reply {
  id?: number;
  method?: string;
  params?: { context?: Context };
  result?: { result?: { value?: unknown }; exceptionDetails?: unknown };
  error?: unknown;
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function reviewDashboard(directory: string): Promise<void> {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  try {
    const page = browser.contexts()[0]?.pages()[0];
    assert.ok(page);
    await page.bringToFront();
    await page.setViewportSize({ width: 1600, height: 1100 });
    const session = await browser.newBrowserCDPSession();
    const { targetInfos } = await session.send("Target.getTargets");
    const target = targetInfos.find((t) => t.type === "iframe");
    assert.ok(target);
    const { sessionId } = await session.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: false,
    });
    let sequence = 0;
    const contexts: Context[] = [];
    const pending = new Map<number, (reply: Reply) => void>();
    session.on("Target.receivedMessageFromTarget", ({ message }) => {
      const reply: Reply = JSON.parse(message);
      if (
        reply.method === "Runtime.executionContextCreated" &&
        reply.params?.context
      )
        contexts.push(reply.params.context);
      if (reply.id) {
        pending.get(reply.id)?.(reply);
        pending.delete(reply.id);
      }
    });
    const send = (method: string, params: object = {}): Promise<Reply> =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out: ${method}`));
        }, 20000);
        pending.set(id, (r) => {
          clearTimeout(timeout);
          r.error ? reject(new Error(JSON.stringify(r.error))) : resolve(r);
        });
        session
          .send("Target.sendMessageToTarget", {
            sessionId,
            message: JSON.stringify({ id, method, params }),
          })
          .catch(reject);
      });
    await send("Runtime.enable");
    await delay(100);
    let contextId: number | undefined;
    for (const context of contexts.filter((c) => c.auxData?.isDefault)) {
      const reply = await send("Runtime.evaluate", {
        contextId: context.id,
        expression: '!!document.querySelector(".app")',
        returnByValue: true,
      });
      if (reply.result?.result?.value) contextId = context.id;
    }
    assert.ok(contextId, "Real dashboard must be mounted");
    const evaluate = async <T>(expression: string): Promise<T> => {
      const reply = await send("Runtime.evaluate", {
        contextId,
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (reply.result?.exceptionDetails)
        throw new Error(JSON.stringify(reply.result.exceptionDetails));
      return reply.result?.result?.value as T;
    };
    const wait = async (expression: string) => {
      for (let i = 0; i < 100; i++) {
        if (await evaluate<boolean>(expression)) return;
        await delay(50);
      }
      throw new Error(`Dashboard did not settle: ${expression}`);
    };
    const csp = await evaluate<string>(
      'document.querySelector("meta[http-equiv=Content-Security-Policy]").content',
    );
    assert.ok(
      csp.includes("default-src 'none'") && csp.includes("script-src 'nonce-"),
    );
    assert.ok(!/unsafe-inline|unsafe-eval/.test(csp));
    const scripts = csp
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("script-src "));
    assert.match(scripts ?? "", /^script-src 'nonce-[^']+'$/);
    await evaluate(axe.source);
    const names = [
      "Overview",
      "Formatting",
      "Code actions",
      "Formatters",
      "Language rules",
      "Diagnostics",
      "Profiles",
      "Getting started",
    ];
    const reports: object[] = [];
    mkdirSync(directory, { recursive: true });
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Getting started')).click()`,
    );
    await wait(`document.querySelector('h1').textContent==='Getting started'`);
    for (const narrow of [false, true]) {
      await page.setViewportSize({ width: narrow ? 460 : 1600, height: 1100 });
      for (const name of names) {
        await evaluate(
          `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes(${JSON.stringify(name)})).click()`,
        );
        await wait(
          `document.querySelector('h1').textContent===${JSON.stringify(name)}&&document.activeElement.tagName==='H1'`,
        );
        const result = await evaluate<{
          violations: { id: string; nodes: { target: string[] }[] }[];
          incomplete: unknown[];
        }>(
          `axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target}))})),incomplete:r.incomplete.map(v=>v.id)}))`,
        );
        const layout = await evaluate<{ width: number; scrollWidth: number }>(
          "({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})",
        );
        reports.push({ name, narrow, layout, ...result });
        writeFileSync(
          join(directory, "accessibility.json"),
          JSON.stringify(reports, null, 2),
        );
        if (!narrow || name === "Overview") {
          await evaluate(
            "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
          );
          const clip = await page.locator("iframe").first().boundingBox();
          assert.ok(clip);
          await page.screenshot({
            path: join(
              directory,
              `${narrow ? "narrow-" : ""}${name.toLowerCase().replaceAll(" ", "-")}.png`,
            ),
            clip,
          });
        }
        assert.deepEqual(
          result.violations,
          [],
          `${name} (${narrow ? "narrow" : "wide"}) accessibility violations`,
        );
        assert.ok(
          layout.scrollWidth <= layout.width + 1,
          `${name} overflows horizontally: ${JSON.stringify(layout)}`,
        );
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Formatting')).click()`,
    );
    assert.equal(
      await evaluate<string>(
        'getComputedStyle(document.querySelector(".switch span"),"::after").transitionDuration',
      ),
      "0s",
    );
    await evaluate('document.querySelector(".skip-link").focus()');
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    assert.ok(
      await evaluate<boolean>(
        'document.activeElement.classList.contains("brand")',
      ),
      "Tab must reach the dashboard brand",
    );
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Profiles')).click()`,
    );
    const payload = "<img src=x onerror=alert(1)>";
    await evaluate(
      `(()=>{const i=document.querySelector('[aria-label="New profile name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(payload)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await evaluate(
      `document.querySelector('.custom-action').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`,
    );
    await wait(
      `document.querySelector('.provider-grid').textContent.includes(${JSON.stringify(payload)})&&!document.querySelector('[aria-label="New profile name"]').disabled`,
    );
    assert.equal(
      await evaluate<number>(
        'document.querySelectorAll(".provider-grid img").length',
      ),
      0,
      "Profile names must render as text",
    );
    await page.setViewportSize({ width: 1600, height: 1100 });
    await evaluate("window.scrollTo(0,0)");
    await page.screenshot({ path: join(directory, "text-escaping.png") });
    console.log(
      `Dashboard verification passed: ${reports.length} page/layout accessibility scans, keyboard focus, reduced motion, CSP and escaped profile names.`,
    );
  } finally {
    await browser.close();
  }
}
