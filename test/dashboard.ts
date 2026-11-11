import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import axe from "axe-core";
import { chromium } from "playwright-core";
import { reviewStatus } from "./status";

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
export const reviewDashboard = async (
  directory: string,
  statusUi = false,
): Promise<void> => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  try {
    const page = browser.contexts()[0]?.pages()[0];
    assert.ok(page);
    await page.bringToFront();
    await page.setViewportSize({ width: 1600, height: 1100 });
    if (statusUi) {
      await reviewStatus(page, directory);
      return;
    }
    const session = await browser.newBrowserCDPSession();
    let sessionId = "";
    let sequence = 0;
    const contexts: Context[] = [];
    const pending = new Map<number, (reply: Reply) => void>();
    session.on(
      "Target.receivedMessageFromTarget",
      ({ sessionId: source, message }) => {
        if (source !== sessionId) return;
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
      },
    );
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
    let contextId: number | undefined;
    const readyDeadline = Date.now() + 15000;
    while (!contextId && Date.now() < readyDeadline) {
      const { targetInfos } = await session.send("Target.getTargets");
      // Earlier integration steps open/close webviews. Inspect all matching
      // targets rather than attaching permanently to a disposed/loading one.
      for (const target of targetInfos.filter(
        (t) =>
          t.type === "iframe" &&
          t.url.includes("extensionId=rajudhami.formatting-controls"),
      )) {
        ({ sessionId } = await session.send("Target.attachToTarget", {
          targetId: target.targetId,
          flatten: false,
        }));
        contexts.length = 0;
        await send("Runtime.enable");
        const candidateDeadline = Math.min(Date.now() + 1000, readyDeadline);
        while (!contextId && Date.now() < candidateDeadline) {
          for (const context of contexts.filter((c) => c.auxData?.isDefault)) {
            const reply = await send("Runtime.evaluate", {
              contextId: context.id,
              expression: '!!document.querySelector(".app")',
              returnByValue: true,
            });
            if (reply.result?.result?.value) contextId = context.id;
          }
          if (!contextId) await delay(50);
        }
        if (contextId) break;
        await session.send("Target.detachFromTarget", {
          sessionId,
        });
      }
      if (!contextId) await delay(50);
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
    const wait = async (expression: string, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await evaluate<boolean>(expression)) return;
        await delay(50);
      }
      throw new Error(`Dashboard did not settle: ${expression}`);
    };
    const assertDiagnosticsSpacing = async () => {
      const gaps = await evaluate<number[]>(`(() => {
        const bounds = (selector) => document.querySelector(selector)?.getBoundingClientRect();
        const scope = bounds('.scope-bar');
        const run = bounds('.diagnostic-run');
        const history = bounds('.diagnostic-history-section');
        const next = bounds('#diagnostic-report') ?? bounds('.diagnostics-page > footer');
        return [
          (history ?? run).top - scope.bottom,
          ...(history ? [run.top - history.bottom] : []),
          next.top - run.bottom,
        ];
      })()`);
      const [firstGap] = gaps;
      assert.ok(
        firstGap !== undefined &&
          gaps.every((gap) => gap >= 16 && Math.abs(gap - firstGap) <= 1),
        `Diagnostics should have consistent spacing around history and the run button: ${gaps}`,
      );
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
      "Formatting",
      "Save actions",
      "Language rules",
      "Profiles",
      "Diagnostics",
      "Help & setup",
    ];
    const reports: object[] = [];
    mkdirSync(directory, { recursive: true });
    await evaluate(
      `[...document.querySelectorAll('nav button, .help-setup, .help-button')].find(b=>b.textContent.includes('Help & setup')).click()`,
    );
    await wait(`document.querySelector('h1').textContent==='Help & setup'`);
    for (const narrow of [false, true]) {
      await page.setViewportSize({ width: narrow ? 460 : 1600, height: 1100 });
      for (const name of names) {
        await evaluate(
          `[...document.querySelectorAll('nav button, .help-setup, .help-button')].find(b=>b.textContent.includes(${JSON.stringify(name)})).click()`,
        );
        await wait(
          `document.querySelector('h1').textContent===${JSON.stringify(name)}&&document.activeElement.tagName==='H1'`,
        );
        if (name === "Diagnostics") {
          await assertDiagnosticsSpacing();
          assert.equal(
            await evaluate(
              "document.querySelectorAll('.diagnostic-history-entry').length",
            ),
            narrow ? 2 : 0,
          );
          assert.equal(
            await evaluate(
              `!!document.querySelector('#diagnostic-report, .diagnostic-history-entry[aria-pressed="true"]')`,
            ),
            false,
          );
          if (!narrow) {
            assert.equal(
              await evaluate<boolean>(`new Promise(resolve => {
                const row = document.querySelector('.diagnostic-run');
                const button = row.querySelector('button');
                const observer = new MutationObserver(() => {
                  if (!row.querySelector('.diagnostic-spinner')) return;
                  observer.disconnect();
                  clearTimeout(timeout);
                  resolve(button.disabled &&
                    button.textContent.includes('Running diagnostics') &&
                    row.querySelector('[role=status]').textContent.includes('Checking formatting settings'));
                });
                const timeout = setTimeout(() => {
                  observer.disconnect();
                  resolve(false);
                }, 2000);
                observer.observe(row, { subtree: true, childList: true, characterData: true });
                button.click();
              })`),
              true,
            );
            await wait(
              "document.querySelectorAll('.diagnostic-history-entry').length === 1 && !!document.querySelector('#diagnostic-report time')",
            );
          }
          await evaluate(
            "document.querySelector('.diagnostic-run button').click()",
          );
          await wait(
            `document.querySelectorAll('.diagnostic-history-entry').length === ${narrow ? 3 : 2} && document.querySelector('.diagnostic-history-entry')?.getAttribute('aria-pressed') === 'true' && !!document.querySelector('#diagnostic-report time')`,
          );
          await evaluate(
            "document.querySelector('.diagnostic-history li:last-child .diagnostic-history-entry').click()",
          );
          await wait(
            "document.querySelector('#diagnostic-report-title').textContent.trim() === 'Selected run results'",
          );
          assert.equal(
            await evaluate(
              "document.querySelector('.diagnostic-history li:last-child .diagnostic-history-entry').getAttribute('aria-pressed')",
            ),
            "true",
          );
          assert.equal(
            await evaluate(
              "document.querySelector('.diagnostic-history-section').nextElementSibling.className",
            ),
            "diagnostic-run",
          );
          await assertDiagnosticsSpacing();
        }
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
        if (!narrow || name === "Formatting") {
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
        if (name === "Diagnostics") {
          assert.ok(
            await evaluate<boolean>(
              "document.querySelector('.diagnostics-summary').textContent.includes('of 3 triggers enabled')",
            ),
          );
          assert.ok(
            await evaluate<boolean>(
              `[...document.querySelectorAll('.diagnostic-actions dl > div')].some(row =>
                row.querySelector('dt code')?.textContent === 'source.fixAll.veryLongProviderActionForDashboardDiagnostics' &&
                row.querySelector('dd').textContent === 'Manual save' &&
                row.querySelector('.diagnostic-source').textContent.includes('Workspace') &&
                row.scrollWidth <= row.clientWidth + 1)`,
            ),
            "Long save-action IDs must show the mode and source without overflowing",
          );
          if (narrow) {
            const deleteRun =
              "document.querySelector('.diagnostic-history li:last-child .diagnostic-delete-run')";
            await evaluate(`${deleteRun}.click()`);
            await wait(
              "document.querySelector('.diagnostic-history li:last-child #diagnostic-clear-note')?.textContent.startsWith('Delete the run from')",
            );
            await assertDiagnosticsSpacing();
            await evaluate(
              "document.querySelector('.diagnostic-history-actions button:first-child').click()",
            );
            assert.equal(
              await evaluate(
                "document.querySelectorAll('.diagnostic-history-entry').length",
              ),
              3,
            );
            assert.equal(
              await evaluate(`document.activeElement === ${deleteRun}`),
              true,
            );
            await evaluate(`${deleteRun}.click()`);
            await evaluate(
              "document.querySelector('.diagnostic-history-actions button:last-child').click()",
            );
            await wait(
              `document.querySelectorAll('.diagnostic-history-entry').length === 2 && !document.querySelector('#diagnostic-report, .diagnostic-history-entry[aria-pressed="true"]')`,
            );
            await wait(
              "document.querySelector('.diagnostic-run [role=status]').textContent.startsWith('Diagnostic run deleted.')",
            );
            await assertDiagnosticsSpacing();
            await evaluate(
              "document.querySelector('.diagnostic-clear-all').click()",
            );
            await wait(
              "document.querySelector('#diagnostic-clear-note')?.textContent.startsWith('Delete all saved runs')",
            );
            await evaluate(
              "document.querySelector('.diagnostic-history-actions button:last-child').click()",
            );
            await wait(
              "!document.querySelector('#diagnostic-report') && document.querySelector('.diagnostic-run [role=status]').textContent.endsWith('No diagnostics run yet.')",
            );
            await assertDiagnosticsSpacing();

            const runDiagnostics =
              "document.querySelector('.diagnostic-run button')";
            for (const count of [1, 2]) {
              await evaluate(`${runDiagnostics}.click()`);
              await wait(
                `!${runDiagnostics}.disabled && document.querySelectorAll('.diagnostic-history-entry').length === ${count}`,
              );
            }
            for (const count of [1, 0]) {
              await evaluate(`${deleteRun}.click()`);
              await evaluate(
                "document.querySelector('.diagnostic-history-actions button:last-child').click()",
              );
              await wait(
                `!${runDiagnostics}.disabled && document.querySelectorAll('.diagnostic-history-entry').length === ${count}`,
              );
              assert.equal(
                await evaluate(
                  "!!document.querySelector('#diagnostic-report')",
                ),
                count > 0,
              );
            }
            await evaluate(`${runDiagnostics}.click()`);
            await wait(
              `!${runDiagnostics}.disabled && document.querySelectorAll('.diagnostic-history-entry').length === 1 && !!document.querySelector('#diagnostic-report')`,
            );
            // Drop the successful run reply after the host has saved it.
            await evaluate(`(() => {
              const prototype = MessageEvent.prototype;
              const descriptor = Object.getOwnPropertyDescriptor(prototype, 'data');
              Object.defineProperty(prototype, 'data', {
                ...descriptor,
                get() {
                  const data = descriptor.get.call(this);
                  if (data?.type !== 'state' || !data.id ||
                      data.state.diagnosticHistory.length !== 2) return data;
                  Object.defineProperty(prototype, 'data', descriptor);
                  return { ...data, id: undefined };
                },
              });
              ${runDiagnostics}.click();
            })()`);
            await wait(`!${runDiagnostics}.disabled`, 20000);
            assert.match(
              await evaluate<string>(
                "document.querySelector('.error[role=alert]')?.textContent ?? ''",
              ),
              /Diagnostics did not respond/,
            );
            await wait(
              "document.querySelectorAll('.diagnostic-history-entry').length === 2 && !document.querySelector('#diagnostic-report')",
            );
            await evaluate(`${runDiagnostics}.click()`);
            await wait(
              `!${runDiagnostics}.disabled && document.querySelectorAll('.diagnostic-history-entry').length === 3 && !!document.querySelector('#diagnostic-report')`,
            );
          }
        }
        if (name === "Formatting") {
          assert.equal(
            await evaluate<number>(
              "document.querySelector('.feedback').getBoundingClientRect().height",
            ),
            0,
            "An empty feedback region must not reserve a row",
          );
          for (const [index, control] of [
            [0, ".formatter-tool .button-row button"],
            [1, 'select[aria-label="Save formatting mode"]'],
          ] as const) {
            await evaluate(
              `document.querySelectorAll('.formatting-disclosure > summary')[${index}].click()`,
            );
            assert.ok(
              await evaluate<boolean>(
                `[...document.querySelectorAll(${JSON.stringify(control)})].some(control => control.getClientRects().length > 0)`,
              ),
              "The expanded section must expose its controls",
            );
            assert.ok(
              await evaluate<boolean>(
                "document.documentElement.scrollWidth <= innerWidth + 1",
              ),
              "Expanded formatting settings must fit the viewport",
            );
            if (!narrow) {
              await evaluate(
                `document.querySelectorAll('.formatting-disclosure')[${index}].scrollIntoView(); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
              );
              const clip = await page.locator("iframe").first().boundingBox();
              assert.ok(clip);
              await page.screenshot({
                path: join(
                  directory,
                  index === 0
                    ? "formatter-tools.png"
                    : "advanced-formatting.png",
                ),
                clip,
              });
            }
            if (index === 1) {
              assert.ok(
                await evaluate<boolean>(`(() => {
                  const workspace = document.querySelector('.workspace');
                  const chromeTop = (selector) => document.querySelector(selector).getBoundingClientRect().top;
                  const sidebarTop = chromeTop('.sidebar');
                  const headerTop = chromeTop('.topbar');
                  workspace.scrollTop = 0;
                  workspace.scrollTop = workspace.scrollHeight;
                  return workspace.scrollTop > 0 &&
                    chromeTop('.sidebar') === sidebarTop &&
                    chromeTop('.topbar') === headerTop &&
                    window.scrollY === 0;
                })()`),
                "Scrolling the workspace must leave the dashboard navigation and header fixed",
              );
            }
            await evaluate(
              `document.querySelectorAll('.formatting-disclosure > summary')[${index}].click()`,
            );
          }
        }
        if (narrow) {
          assert.ok(
            await evaluate<boolean>(
              `(() => {
                const heading = document.querySelector('.page-heading');
                return heading.scrollWidth <= heading.clientWidth + 1;
              })()`,
            ),
            `${name} heading must fit inside the content area`,
          );
        }
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await evaluate(
      `[...document.querySelectorAll('nav button, .help-setup, .help-button')].find(b=>b.textContent.includes('Formatting')).click()`,
    );
    assert.equal(
      await evaluate<number>('document.querySelectorAll("nav button").length'),
      5,
    );
    assert.equal(
      await evaluate<number>(
        'document.querySelectorAll(".trigger-row input[type=checkbox]").length',
      ),
      3,
    );
    assert.ok(
      await evaluate<boolean>(
        'document.querySelector(".disclosure").textContent.includes("Installed formatter tools")',
      ),
    );
    // The redesigned shared selectors must still reach the host with the
    // exact folder URI, and real checkbox changes must round-trip back.
    const choose = async (selector: string, value: string) => {
      const reply = await send("Runtime.callFunctionOn", {
        executionContextId: contextId,
        functionDeclaration: `function (selector, value) {
          const select = document.querySelector(selector);
          select.value = value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }`,
        arguments: [{ value: selector }, { value }],
      });
      assert.equal(reply.result?.exceptionDetails, undefined);
      await wait('!document.querySelector(".scope-bar select:disabled")');
    };
    const folderValue = await evaluate<string>(
      `document.querySelector('.scope-bar select option[value^="folder:"]').value`,
    );
    await choose(".scope-bar select", folderValue);
    await wait(
      `document.querySelector('.scope-description').textContent.includes('folder')`,
    );
    await choose(".scope-bar label:nth-child(2) select", "javascript");
    await wait(
      `document.querySelector('.scope-description').textContent.includes('JavaScript')`,
    );
    await evaluate("document.querySelector('.help-button').click()");
    await wait("document.querySelector('h1').textContent === 'Help & setup'");
    assert.equal(
      await evaluate<number>(
        "document.querySelectorAll('.setup-steps li').length",
      ),
      4,
    );
    assert.equal(
      await evaluate<number>(
        "document.querySelectorAll('.active-context, .scope-bar').length",
      ),
      0,
      "Help is a guide without configuration selectors",
    );
    assert.equal(
      await evaluate<number>(
        "document.querySelectorAll('.sidebar-footer p br').length",
      ),
      1,
    );
    for (const question of [1, 2, 0]) {
      await evaluate(
        `document.querySelectorAll('.common-questions summary')[${question}].click()`,
      );
      assert.ok(
        await evaluate<boolean>(
          `document.querySelectorAll('.common-questions details[open]').length === 1 && document.querySelectorAll('.common-questions details')[${question}].open`,
        ),
        "Opening a help question closes the previous answer",
      );
    }
    await evaluate("document.querySelector('.help-answer button').click()");
    await wait("document.querySelector('h1').textContent === 'Diagnostics'");
    await evaluate("document.querySelector('.help-button').click()");
    await wait("document.querySelector('h1').textContent === 'Help & setup'");
    await evaluate("document.querySelector('.setup-guide button').click()");
    await wait("document.querySelector('h1').textContent === 'Formatting'");
    assert.equal(
      await evaluate<string>(
        "document.querySelector('.scope-bar select').value",
      ),
      folderValue,
      "Help navigation preserves the selected scope",
    );
    assert.equal(
      await evaluate<string>(
        "document.querySelector('.scope-bar label:nth-child(2) select').value",
      ),
      "javascript",
      "Help navigation preserves the selected language",
    );
    const beforeChecked = await evaluate<boolean>(
      'document.querySelector(".trigger-row input").checked',
    );
    await evaluate('document.querySelector(".trigger-row input").click()');
    await wait(
      `!document.querySelector('.trigger-row input').disabled && document.querySelector('.trigger-row input').checked === ${!beforeChecked}`,
    );
    await evaluate('document.querySelector(".trigger-row input").click()');
    await wait(
      `!document.querySelector('.trigger-row input').disabled && document.querySelector('.trigger-row input').checked === ${beforeChecked}`,
    );
    await choose(".scope-bar label:nth-child(2) select", "");
    await choose(".scope-bar select", "user");
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
      `[...document.querySelectorAll('nav button, .help-setup, .help-button')].find(b=>b.textContent.includes('Profiles')).click()`,
    );
    const presetChoice = ".preset-choices button";
    await wait(
      `document.querySelector('.preset-detail h3')?.textContent === 'Save & Paste'`,
    );
    await evaluate(
      `[...document.querySelectorAll('${presetChoice}')].find(b=>b.textContent==='Save, Paste & Type').click()`,
    );
    await wait(
      `document.querySelector('.preset-detail h3')?.textContent === 'Save, Paste & Type' && document.querySelectorAll('.preset-detail article').length === 1`,
    );
    await evaluate(
      `[...document.querySelectorAll('.profile-section button')].find(b=>b.textContent==='Save current settings').click()`,
    );
    await wait(
      `document.activeElement.getAttribute('aria-label') === 'New profile name'`,
    );
    const payload = "<img src=x onerror=alert(1)>";
    await evaluate(
      `(()=>{const i=document.querySelector('[aria-label="New profile name"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(payload)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await evaluate(
      `document.querySelector('.custom-action').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`,
    );
    await wait(
      `document.querySelector('.profile-list')?.textContent.includes(${JSON.stringify(payload)})&&!document.querySelector('[aria-label="New profile name"]').disabled`,
    );
    assert.equal(
      await evaluate<number>(
        'document.querySelectorAll(".profile-list img").length',
      ),
      0,
      "Profile names must render as text",
    );
    await page.setViewportSize({ width: 1600, height: 1100 });
    await evaluate("document.querySelector('.workspace').scrollTo(0,0)");
    await page.screenshot({ path: join(directory, "text-escaping.png") });
    console.log(
      `Dashboard verification passed: ${reports.length} page/layout accessibility scans, keyboard focus, reduced motion, CSP and escaped profile names.`,
    );
  } finally {
    await browser.close();
  }
};
