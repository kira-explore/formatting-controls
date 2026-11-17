import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
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
  workspaceFile: string,
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
    const attachDashboard = async () => {
      contextId = undefined;
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
            for (const context of contexts.filter(
              (c) => c.auxData?.isDefault,
            )) {
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
    };
    await attachDashboard();
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
        if (await evaluate<boolean>(`Boolean(${expression})`)) return;
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
        const report = bounds('#diagnostic-report');
        const footer = bounds('.diagnostics-page > footer');
        return [
          (history ?? run).top - scope.bottom,
          ...(history ? [run.top - history.bottom] : []),
          ...(report ? [report.top - run.bottom] : []),
          footer.top - (report ?? run).bottom,
        ];
      })()`);
      const footerGap = gaps.pop();
      assert.ok(
        footerGap !== undefined && footerGap >= 16,
        "Diagnostics footer must clear the content",
      );
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
    await wait("!!document.querySelector('#page-profiles')");
    await evaluate(`window.addEventListener("message", ({data}) => {
      if (data?.type === "state") window.pickerTestState = data.state;
    });`);
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
        if (name === "Profiles") {
          assert.equal(
            await evaluate(
              `document.querySelector('#saved-profiles [aria-label="Save current settings"]').textContent.trim()`,
            ),
            "Save",
          );
          assert.equal(
            await evaluate(
              `document.querySelector('#saved-profiles [aria-label="Import profile"]').textContent.trim()`,
            ),
            "Import",
          );
          assert.equal(
            await evaluate(
              "document.querySelector('#built-in-presets .profile-picker-actions .primary').textContent.trim()",
            ),
            "Preview",
          );
        }
        if (name === "Help & setup") {
          assert.ok(
            await evaluate<boolean>(`(() => {
              const guide = document.querySelector('.setup-guide').getBoundingClientRect();
              const questions = document.querySelector('.common-questions').getBoundingClientRect();
              return questions.top >= guide.bottom &&
                Math.abs(questions.left - guide.left) < 1 &&
                Math.abs(questions.width - guide.width) < 1;
            })()`),
            "Help should stack the guide and questions at the same width in both editor sizes",
          );
        }
        if (name === "Diagnostics") {
          await assertDiagnosticsSpacing();
          assert.equal(
            await evaluate(
              "document.querySelectorAll('.diagnostic-history-entry').length",
            ),
            narrow ? 2 : 0,
          );
          assert.equal(
            await evaluate("!!document.querySelector('#diagnostic-report')"),
            false,
          );
          assert.equal(
            await evaluate(
              `document.querySelectorAll('.diagnostic-history-entry[aria-pressed="true"]').length`,
            ),
            narrow ? 1 : 0,
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
          assert.deepEqual(
            await evaluate(`Array.from(document.querySelectorAll(
              '.diagnostic-history-heading button, .diagnostic-history-card .button-row button'
            ), button => button.textContent.trim())`),
            ["Clear", "View", "Delete"],
          );
          await evaluate(
            "document.querySelector('.diagnostic-history li:last-child .diagnostic-history-entry').click()",
          );
          await wait(
            `document.querySelector('.diagnostic-history li:last-child button[aria-pressed="true"]') &&
            document.querySelector('#diagnostic-report-title').textContent.trim() === 'Last run results'`,
          );
          await evaluate(
            "document.querySelector('.diagnostic-history-card .primary').click()",
          );
          await wait(
            "document.querySelector('#diagnostic-report-title').textContent.trim() === 'Selected run results' && document.activeElement.id === 'diagnostic-report-title'",
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
            const runDiagnostics =
              "document.querySelector('.diagnostic-run button')";
            const historyCount =
              "document.querySelectorAll('.diagnostic-history-entry').length";
            const selectLastRun =
              "document.querySelector('.diagnostic-history li:last-child button')";
            const deleteRun =
              "document.querySelector('.diagnostic-history-card .button-row button:last-child')";
            const deleteNote =
              "document.querySelector('#diagnostic-delete-note')";
            const cancelDelete =
              "document.querySelector('.diagnostic-history-card .button-row button:first-child')";
            await evaluate(`${deleteRun}.click()`);
            await wait(
              `${deleteNote}?.textContent.startsWith('Delete the run') &&
              ${deleteRun}?.textContent === 'Delete' && document.activeElement === ${cancelDelete}`,
            );
            await assertDiagnosticsSpacing();
            await evaluate(`${cancelDelete}.click()`);
            await wait(
              `!${deleteNote} && document.activeElement === ${deleteRun}`,
            );
            assert.equal(await evaluate(historyCount), 3);
            await evaluate(`${deleteRun}.click()`);
            await wait(`!!${deleteNote}`);
            await evaluate(`${deleteRun}.click()`);
            await wait(
              `${historyCount} === 2 && !document.querySelector('#diagnostic-report') &&
              document.activeElement === document.querySelector('.diagnostic-history-entry[aria-pressed="true"]')`,
            );
            await wait(
              "document.querySelector('.diagnostic-run [role=status]').textContent.startsWith('Diagnostic run deleted.')",
            );
            await assertDiagnosticsSpacing();
            await evaluate(
              `document.querySelector('[aria-label="Clear all diagnostic runs"]').click()`,
            );
            await wait(
              `${deleteNote}?.textContent.startsWith('Delete all saved runs') &&
              ${deleteRun}?.textContent === 'Delete'`,
            );
            await evaluate(`${deleteRun}.click()`);
            await wait(
              `!document.querySelector('#diagnostic-report') &&
              document.querySelector('.diagnostic-history-card').textContent.includes('No saved diagnostic runs.') &&
              document.querySelector('.diagnostic-run [role=status]').textContent.includes('Diagnostic history cleared.')`,
            );
            await assertDiagnosticsSpacing();

            for (const count of [1, 2]) {
              await evaluate(`${runDiagnostics}.click()`);
              await wait(
                `!${runDiagnostics}.disabled && ${historyCount} === ${count}`,
              );
            }
            for (const count of [1, 0]) {
              await evaluate(`${selectLastRun}.click()`);
              await evaluate(`${deleteRun}.click()`);
              await wait(`!!${deleteNote}`);
              await evaluate(`${deleteRun}.click()`);
              await wait(
                `!${runDiagnostics}.disabled && ${historyCount} === ${count}`,
              );
              assert.equal(
                await evaluate(
                  "!!document.querySelector('#diagnostic-report')",
                ),
                count > 0,
              );
              if (!count) {
                assert.ok(
                  await evaluate<boolean>(`document.querySelector('#diagnostic-history').textContent === 'Run history' &&
                    document.querySelector('.diagnostic-history-card').textContent.includes('No saved diagnostic runs.') &&
                    !document.querySelector('.diagnostic-history-section button') &&
                    document.activeElement === ${runDiagnostics}`),
                );
              }
            }
            await evaluate(`${runDiagnostics}.click()`);
            await wait(
              `!${runDiagnostics}.disabled && ${historyCount} === 1 && !!document.querySelector('#diagnostic-report')`,
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
        "document.querySelectorAll('.setup-guide .setup-steps li').length",
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
    assert.equal(
      await evaluate<number>(
        "document.querySelectorAll('.common-questions details[open]').length",
      ),
      1,
    );
    assert.equal(
      await evaluate<string>(
        "document.querySelector('.common-questions details[open] summary').textContent",
      ),
      "Why isn’t my file formatting as expected?",
    );
    assert.deepEqual(
      await evaluate(
        "[...document.querySelectorAll('.faq-group')].map(group => [group.querySelector('h3').textContent, group.querySelectorAll('details').length])",
      ),
      [
        ["Formatting and saves", 3],
        ["Pause and restore", 3],
      ],
    );
    for (const [question, openQuestions] of [
      [3, [0, 3]],
      [1, [1, 3]],
      [5, [1, 5]],
      [2, [2, 5]],
      [4, [2, 4]],
      [0, [0, 4]],
    ] as const) {
      await evaluate(
        `document.querySelectorAll('.common-questions summary')[${question}].click()`,
      );
      assert.deepEqual(
        await evaluate<number[]>(
          "[...document.querySelectorAll('.common-questions details')].flatMap((answer, index) => answer.open ? [index] : [])",
        ),
        openQuestions,
        "Opening a question only closes the previous answer in its group",
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
    const workspaceSettings = () =>
      JSON.parse(readFileSync(workspaceFile, "utf8")).settings;
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
    const presetChoice = '.preset-table input[name="formatting-preset"]';
    await wait(
      `document.querySelector('${presetChoice}:checked')?.value === 'Save & Paste'`,
    );
    assert.equal(
      await evaluate(
        `getComputedStyle(document.querySelector('${presetChoice}:checked')).opacity`,
      ),
      "0",
      "The preset input must remain available to assistive technology without a visible radio dot",
    );
    await evaluate(`document.querySelector('${presetChoice}:checked').focus()`);
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "ArrowDown",
      code: "ArrowDown",
      windowsVirtualKeyCode: 40,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "ArrowDown",
      code: "ArrowDown",
      windowsVirtualKeyCode: 40,
    });
    await wait(
      `document.querySelector('${presetChoice}:checked')?.value === 'Save & Type' &&
      getComputedStyle(document.activeElement.closest('tr')).outlineStyle === 'solid'`,
    );
    assert.deepEqual(
      await evaluate(
        `[...document.querySelectorAll('.preset-table tbody tr')].map(row => [
          row.querySelector('input').value,
          ...[...row.querySelectorAll('td')].map(cell => cell.getAttribute('aria-label'))
        ])`,
      ),
      [
        ["Manual Only", "Off", "Off", "Off"],
        ["Save Only", "On", "Off", "Off"],
        ["Paste Only", "Off", "On", "Off"],
        ["Type Only", "Off", "Off", "On"],
        ["Save & Paste", "On", "On", "Off"],
        ["Save & Type", "On", "Off", "On"],
        ["Paste & Type", "Off", "On", "On"],
        ["Save, Paste & Type", "On", "On", "On"],
      ],
    );
    const presetPanel = "#built-in-presets > .dashboard-confirmation";
    await evaluate(
      "document.querySelector('#built-in-presets [aria-label=\"Preview Save & Type\"]').click()",
    );
    await wait(
      `document.querySelector('${presetPanel}[aria-label="Apply Save & Type"] .primary')?.textContent === 'Review'`,
    );
    await evaluate(
      `document.querySelector('${presetPanel} .button-row button').click()`,
    );
    await wait(`!document.querySelector('${presetPanel}')`);
    await evaluate(
      `document.querySelector('${presetChoice}[value="Save, Paste & Type"]').click()`,
    );
    await wait(
      `document.querySelector('#built-in-presets [aria-label="Export Save, Paste & Type"]') &&
      document.querySelector('${presetChoice}:checked')?.value === 'Save, Paste & Type'`,
    );
    await evaluate(
      `document.querySelector('${presetChoice}[value="Manual Only"]').click()`,
    );
    await evaluate(
      `document.querySelector('#built-in-presets [aria-label="Preview Manual Only"]').click()`,
    );
    await wait(
      `document.querySelector('${presetPanel}[aria-label="Apply Manual Only"]') &&
      document.querySelector('${presetPanel} .primary')?.textContent === 'Review' &&
      !document.querySelector('.preset-table')`,
    );
    await evaluate(`document.querySelector('${presetPanel} .primary').click()`);
    await wait(
      `document.querySelector('${presetPanel} table th[scope="col"]') &&
      !document.querySelector('${presetPanel} .scope-bar, .preset-table') &&
      document.querySelector('${presetPanel} .primary').textContent === 'Apply'`,
    );
    await evaluate(
      `[...document.querySelectorAll('${presetPanel} button')].find(button => button.textContent === 'Cancel').click()`,
    );
    await wait(
      `!document.querySelector('${presetPanel}') &&
      document.querySelector('${presetChoice}:checked')?.value === 'Manual Only' &&
      document.activeElement === document.querySelector('#built-in-presets [aria-label="Preview Manual Only"]:not(:disabled)')`,
    );
    const saveTrigger = "#saved-profiles .section-header .primary";
    const saveForm = "#saved-profiles form";
    await evaluate(`document.querySelector('${saveTrigger}').click()`);
    await wait(
      `document.activeElement.getAttribute('aria-label') === 'New profile name' &&
      document.querySelector('${saveForm} .primary')?.textContent.trim() === 'Save'`,
    );
    const payload = "<img src=x onerror=alert(1)>";
    const fillProfileName = async (name = payload) => {
      await evaluate(
        `document.querySelector('[aria-label="New profile name"]').select()`,
      );
      await send("Input.insertText", { text: name });
    };
    const submitProfile = () =>
      evaluate(`document.querySelector('${saveForm} .primary').click()`);
    assert.ok(
      await evaluate<boolean>(`(() => {
        const scope = document.querySelector('${saveForm} .scope-bar').getBoundingClientRect();
        const name = document.querySelector('${saveForm} > label').getBoundingClientRect();
        return scope.bottom <= name.top && Math.abs(scope.width - name.width) < 1;
      })()`),
      "Scope and language must sit above the full-width profile name",
    );
    await fillProfileName();
    await submitProfile();
    await wait(
      `document.querySelector('.profile-list')?.textContent.includes(${JSON.stringify(payload)}) &&
      !document.querySelector('${saveForm}') &&
      document.querySelector('#saved-profiles [role="status"]')?.textContent.startsWith('Saved profile') &&
      document.activeElement === document.querySelector('${saveTrigger}')`,
    );
    assert.equal(
      await evaluate<number>(
        'document.querySelectorAll(".profile-list img").length',
      ),
      0,
      "Profile names must render as text",
    );
    await evaluate(`document.querySelector('${saveTrigger}').click()`);
    await wait(`document.querySelector('${saveForm} input')?.value === ''`);
    await fillProfileName();
    await submitProfile();
    const overwrite = "section.dashboard-confirmation";
    await wait(
      `document.querySelector('${overwrite} h2')?.textContent.startsWith('Overwrite saved profile')`,
    );
    await evaluate(
      `document.querySelector('${overwrite} .button-row button').click()`,
    );
    await wait(
      `!document.querySelector('${overwrite}') &&
      document.querySelector('${saveForm} input:not(:disabled)')?.value === ${JSON.stringify(payload)}`,
    );
    await submitProfile();
    await wait(
      `document.querySelector('${overwrite} h2')?.textContent.startsWith('Overwrite saved profile')`,
    );
    await evaluate(`document.querySelector('${overwrite} .primary').click()`);
    await wait(`!document.querySelector('${saveForm}')`);
    const savedChoices = '#saved-profiles input[name="saved-profile"]';
    const savedAction = "#saved-profiles .profile-picker-actions";
    await evaluate(`document.querySelector('${saveTrigger}').click()`);
    await fillProfileName("Second profile");
    await submitProfile();
    await wait(
      `document.querySelector('${savedChoices}:checked')?.value === 'Second profile' &&
      document.querySelector('${savedAction} [aria-label="Export Second profile"]')`,
    );
    await evaluate(
      `[...document.querySelectorAll('${savedChoices}')].find(choice => choice.value === ${JSON.stringify(payload)}).closest('label').click()`,
    );
    await wait(
      `document.querySelector('${savedChoices}:checked')?.value === ${JSON.stringify(payload)} &&
      document.querySelectorAll('${savedAction} button').length === 3 &&
      [...document.querySelectorAll('${savedAction} button')].some(button => button.getAttribute('aria-label') === ${JSON.stringify(`Export ${payload}`)})`,
    );
    await evaluate(`document.querySelector('${savedAction} .primary').click()`);
    const savedPanel = "#saved-profiles > .dashboard-confirmation";
    await wait(
      `document.querySelector('${savedPanel} .scope-bar') && !document.querySelector('${savedChoices}')`,
    );
    assert.equal(
      await evaluate<string>(
        `getComputedStyle(document.querySelector('${savedPanel} .scope-bar')).borderBottomStyle`,
      ),
      "none",
    );
    await evaluate(`document.querySelector('${savedPanel} .primary').click()`);
    await wait(
      `document.querySelector('${savedPanel} h2')?.textContent === 'No changes needed' && !document.querySelector('${savedPanel} .primary')`,
    );
    await evaluate(
      `[...document.querySelectorAll('${savedPanel} button')].find(button => button.textContent === 'Back').click()`,
    );
    await wait(
      `document.querySelector('${savedPanel} .primary:not(:disabled)')?.textContent === 'Review'`,
    );
    await choose(`${savedPanel} .scope-bar select`, folderValue);
    await wait(
      `document.querySelector('${savedPanel} .scope-bar select:not(:disabled)')?.value === ${JSON.stringify(folderValue)}`,
    );
    await evaluate(`document.querySelector('${savedPanel} .primary').click()`);
    await wait(
      `document.querySelector('${savedPanel} > p')?.textContent.trim().startsWith('Folder: ') &&
      document.querySelector('${savedPanel} thead')?.textContent.includes('Current at scope')`,
    );
    await evaluate(
      `[...document.querySelectorAll('${savedPanel} button')].find(button => button.textContent === 'Cancel').click()`,
    );
    await wait(
      `!document.querySelector('${savedPanel}') &&
      document.querySelector('${savedChoices}:checked:not(:disabled)')?.value === ${JSON.stringify(payload)}`,
    );
    await evaluate(
      `document.querySelector('${savedChoices}[value="Second profile"]').click()`,
    );
    await evaluate(
      `document.querySelector('${savedAction} [aria-label="Delete Second profile"]').click()`,
    );
    await wait(
      `document.querySelector('#saved-profile-delete-note')?.textContent.includes('Second profile') &&
      document.querySelector('${savedAction} .primary')?.textContent === 'Delete' &&
      document.querySelector('${savedChoices}:checked:disabled')?.value === 'Second profile' &&
      getComputedStyle(document.querySelector('${savedChoices}:checked').closest('.profile-choice')).opacity === '0.5' &&
      document.activeElement === document.querySelector('${savedAction} button')`,
    );
    await evaluate(`document.querySelector('${savedAction} button').click()`);
    await wait(
      `!document.querySelector('#saved-profile-delete-note, #saved-profiles [role="status"]') &&
      getComputedStyle(document.querySelector('${savedChoices}:checked').closest('.profile-choice')).opacity === '1' &&
      document.activeElement === document.querySelector('${savedAction} [aria-label="Delete Second profile"]')`,
    );
    await evaluate(`document.activeElement.click()`);
    await wait(`document.querySelector('#saved-profile-delete-note')`);
    await evaluate(`document.querySelector('${savedAction} .primary').click()`);
    await wait(
      `document.querySelector('${savedChoices}:checked')?.value === ${JSON.stringify(payload)} &&
      !document.querySelector('${savedChoices}[value="Second profile"]') &&
      document.querySelector('#saved-profiles [role=status]')?.textContent.includes('Deleted saved profile Second profile')`,
    );
    await page.setViewportSize({ width: 1600, height: 1100 });
    assert.ok(
      await evaluate<boolean>(`(() => {
        const name = document.querySelector('#saved-profiles .profile-identity strong').getBoundingClientRect();
        const language = document.querySelector('#saved-profiles .profile-detail').getBoundingClientRect();
        return Math.abs(language.left - name.left) < 1 && language.top >= name.bottom;
      })()`),
      "The saved profile language must sit below its name",
    );
    await evaluate("document.querySelector('.workspace').scrollTo(0,0)");
    await page.screenshot({ path: join(directory, "text-escaping.png") });
    await evaluate(
      `document.querySelector('#built-in-presets [aria-label="Preview Manual Only"]').click()`,
    );
    await wait(`document.querySelector('${presetPanel} .scope-bar')`);
    assert.equal(
      await evaluate<string>(
        `getComputedStyle(document.querySelector('${presetPanel} .scope-bar')).borderBottomStyle`,
      ),
      "none",
    );
    await choose(`${presetPanel} .scope-bar select`, "workspace");
    await wait(
      `document.querySelector('${presetPanel} .scope-bar select:not(:disabled)')?.value === 'workspace'`,
    );
    await evaluate(`document.querySelector('${presetPanel} .primary').click()`);
    await wait(
      `document.querySelector('${presetPanel} .primary')?.textContent === 'Apply'`,
    );
    await evaluate(`document.querySelector('${presetPanel} .primary').click()`);
    const restoreList = "#restore-settings .profile-picker";
    const restoreActions = "#restore-settings .profile-picker-actions";
    const restoreChoices = '#restore-settings input[name="restore-point"]';
    await wait(
      `document.querySelector('${restoreActions} button:not(:disabled)')`,
    );
    assert.equal(
      await evaluate(`document.querySelectorAll('${restoreChoices}').length`),
      0,
      "A lone restore point has no selection control",
    );
    await evaluate(
      `document.querySelector('${presetChoice}[value="Save, Paste & Type"]').click()`,
    );
    await evaluate(
      `document.querySelector('#built-in-presets [aria-label="Preview Save, Paste & Type"]').click()`,
    );
    await choose(`${presetPanel} .scope-bar select`, folderValue);
    await wait(
      `document.querySelector('${presetPanel} .scope-bar select:not(:disabled)')?.value === ${JSON.stringify(folderValue)}`,
    );
    await evaluate(`document.querySelector('${presetPanel} .primary').click()`);
    await wait(
      `document.querySelector('${presetPanel} .primary')?.textContent === 'Apply'`,
    );
    await evaluate(`document.querySelector('${presetPanel} .primary').click()`);
    await wait(
      `document.querySelectorAll('${restoreChoices}').length === 2 &&
      document.querySelector('#built-in-presets [role=status]')?.textContent.startsWith('Applied Save, Paste & Type')`,
    );
    for (const name of names.filter((name) => name !== "Profiles")) {
      await evaluate(
        `[...document.querySelectorAll('nav button, .help-setup')].find(b => b.textContent.trim() === ${JSON.stringify(name)}).click()`,
      );
      await wait(
        `document.querySelector('h1').textContent === ${JSON.stringify(name)}`,
      );
      assert.equal(
        await evaluate<boolean>(
          "document.body.textContent.includes('A profile restore point is available')",
        ),
        false,
        `The restore point banner should be absent from ${name}`,
      );
    }
    await evaluate(
      `[...document.querySelectorAll('nav button')].find(b => b.textContent.trim() === 'Profiles').click()`,
    );
    await wait(
      `document.querySelector('${restoreActions} button:not(:disabled)')`,
    );
    const restoreReview = "#restore-settings > .dashboard-confirmation";
    assert.equal(
      await evaluate(
        `document.querySelector('${restoreActions} [aria-label="Delete restore point"]').textContent.trim()`,
      ),
      "Delete",
    );
    await evaluate(
      `[...document.querySelectorAll('${restoreChoices}')].find(
        input => input.closest('label').textContent.includes('Folder:')
      ).closest('label').click()`,
    );
    await evaluate(
      `document.querySelector('${restoreActions} button:last-child').click()`,
    );
    await wait(
      `document.querySelector('#restore-point-delete-note')?.textContent.includes('Folder:') &&
      document.querySelector('${restoreChoices}:checked:disabled') &&
      getComputedStyle(document.querySelector('${restoreChoices}:checked').closest('.profile-choice')).opacity === '0.5' &&
      document.querySelector('${restoreActions} .primary')?.textContent === 'Delete'`,
    );
    await evaluate(
      `document.querySelector('${restoreActions} .primary').click()`,
    );
    await wait(
      `!document.querySelector('${restoreChoices}') &&
      document.querySelector('${restoreList} .restore-identity strong')?.textContent.startsWith('Workspace:')`,
    );
    const folderSettings = JSON.parse(
      readFileSync(
        join(
          fileURLToPath(folderValue.slice("folder:".length)),
          ".vscode",
          "settings.json",
        ),
        "utf8",
      ),
    );
    assert.equal(folderSettings["editor.formatOnType"], true);
    await evaluate(
      `document.querySelector('${restoreActions} button:last-child').click()`,
    );
    await wait(
      `document.querySelector('#restore-point-delete-note') &&
      document.querySelector('${restoreList} .restore-identity') &&
      getComputedStyle(document.querySelector('${restoreList} .profile-choice')).opacity === '0.5' &&
      document.activeElement === document.querySelector('${restoreActions} button')`,
    );
    await evaluate(
      `document.querySelector('${restoreActions} button').click()`,
    );
    await wait(
      `!document.querySelector('#restore-point-delete-note, #restore-settings [role="status"]') &&
      document.activeElement === document.querySelector('${restoreActions} [aria-label="Delete restore point"]:not(:disabled)')`,
    );
    await evaluate(
      `document.querySelector('${restoreActions} button').click()`,
    );
    await wait(
      `document.querySelector('${restoreReview} .primary')?.textContent.trim() === 'Restore' &&
      !document.querySelector('${restoreList}') && document.querySelectorAll('.dashboard-confirmation').length === 1`,
    );
    assert.ok(
      await evaluate<boolean>(`[...document.querySelectorAll('${restoreReview} tbody tr')].some(row =>
        row.cells[0].textContent === 'Format on save' &&
        row.cells[1].textContent === 'Off' && row.cells[2].textContent === 'On'
      )`),
      "The restore preview must show that applying the preset turned format on save off",
    );
    await evaluate(
      `document.querySelector('${restoreReview} .primary').click()`,
    );
    await wait(`!document.querySelector('${restoreList}, ${restoreReview}')`);
    await wait(
      "document.querySelector('#restore-settings [role=status]')?.textContent.includes('Previous settings restored for test')",
    );
    assert.equal(workspaceSettings()["editor.formatOnSave"], true);
    const pauseReview = ".profile-pause > section.dashboard-confirmation";
    const pauseStart = ".profile-pause .pause-scope";
    const pauseActive = ".profile-pause .pause-active";
    await wait(
      "document.querySelector('.profile-pause select:not(:disabled)')",
    );
    await choose(".profile-pause select", "");
    await wait(
      `document.querySelector('.profile-pause select:not(:disabled)')?.value === ''`,
    );
    assert.ok(
      await evaluate<boolean>(`(() => {
        const card = document.querySelector('${pauseStart}').getBoundingClientRect();
        const select = document.querySelector('.profile-pause select').getBoundingClientRect();
        const review = document.querySelector('.profile-pause .primary').getBoundingClientRect();
        return Math.abs(select.bottom - review.bottom) < 1 &&
          Math.abs((card.right - review.right) - (select.left - card.left)) < 1 &&
          review.left - select.right <= 12;
      })()`),
      "The pause scope selector should fill the row beside the right-aligned button",
    );
    await page.setViewportSize({ width: 380, height: 1100 });
    await wait(`(() => {
      const select = document.querySelector('${pauseStart} select').getBoundingClientRect();
      const review = document.querySelector('${pauseStart} .primary').getBoundingClientRect();
      return review.top >= select.bottom && Math.abs(review.left - select.left) < 1;
    })()`);
    await page.setViewportSize({ width: 1600, height: 1100 });
    await evaluate("document.querySelector('.profile-pause .primary').click()");
    await wait(
      `document.querySelector('${pauseReview} .primary')?.textContent === 'Apply' &&
      document.querySelectorAll('${pauseReview} tbody tr').length > 1 &&
      !document.querySelector('${pauseReview} details') &&
      !document.querySelector('${pauseStart}') &&
      document.activeElement === document.querySelector('${pauseReview}')`,
    );
    await evaluate(
      `document.querySelector('${pauseReview} .button-row button').click()`,
    );
    await wait(
      `!document.querySelector('${pauseReview}') &&
      document.querySelector('${pauseStart} button:not(:disabled)') &&
      !document.querySelector('.profile-pause [role=status]')`,
    );
    await wait(`!document.querySelector('${restoreList}')`);
    await evaluate("document.querySelector('.profile-pause .primary').click()");
    await wait(
      `document.querySelector('${pauseReview} .primary')?.textContent === 'Apply'`,
    );
    await evaluate(`document.querySelector('${pauseReview} .primary').click()`);
    await wait(
      `document.querySelector('${pauseActive}')?.textContent.includes('Pause active') &&
      document.querySelector('${pauseActive}')?.textContent.includes('save action') &&
      document.querySelector('.profile-pause [role=status]')?.textContent.includes('Paused at the selected scope') &&
      !document.querySelector('${pauseStart}') &&
      !document.querySelector('${pauseActive} button:disabled')`,
    );
    const formattingPause = ".automatic-section";
    await evaluate("document.querySelector('nav button').click()");
    await wait(
      `document.querySelector('#page-formatting') &&
      document.querySelector('${formattingPause} .workflow-note')?.textContent.includes('Pause active · Entire workspace') &&
      document.querySelector('${formattingPause} .resume-button:not(:disabled)')?.textContent === 'Review resume'`,
    );
    assert.equal(
      await evaluate("document.querySelector('.scope-bar select').value"),
      folderValue,
      "Formatting should keep the inspected folder separate from the recorded pause scope",
    );
    await evaluate(
      `document.querySelector('${formattingPause} .resume-button').click()`,
    );
    await wait(
      `document.querySelector('${formattingPause} .pause-review > p')?.textContent === 'Entire workspace' &&
      document.querySelector('${formattingPause} .pause-review .primary')?.textContent === 'Resume and restore settings' &&
      document.querySelectorAll('${formattingPause} .pause-review tbody tr').length > 1`,
    );
    await evaluate(
      `document.querySelector('${formattingPause} .pause-review .button-row button').click()`,
    );
    await wait(
      `document.querySelector('${formattingPause} .resume-button:not(:disabled)') === document.activeElement &&
      !document.querySelector('${formattingPause} .pause-review')`,
    );
    assert.equal(workspaceSettings()["editor.formatOnSave"], false);
    await evaluate(
      "[...document.querySelectorAll('nav button')].find(button => button.textContent.includes('Profiles')).click()",
    );
    await wait(`document.querySelector('${pauseActive}')`);
    for (const name of ["Save Only", "Save, Paste & Type"]) {
      await evaluate(
        `document.querySelector('${presetChoice}[value="${name}"]').click()`,
      );
      await wait(
        `document.querySelector('#built-in-presets [aria-label="Preview ${name}"]:not(:disabled)')`,
      );
    }
    await evaluate(
      `document.querySelector('#built-in-presets [aria-label="Preview Save, Paste & Type"]').click()`,
    );
    await wait(
      `document.querySelector('${presetPanel} .profile-apply-note')?.textContent.includes('pause is active')`,
    );
    assert.equal(
      await evaluate(`document.querySelector('${presetPanel} select').value`),
      folderValue,
      "Choosing the workspace for a pause must preserve the scope of profile previews",
    );
    await choose(`${presetPanel} .scope-bar select`, "workspace");
    await evaluate(`document.querySelector('${presetPanel} .primary').click()`);
    await wait(
      `document.querySelector('${presetPanel} tbody tr') &&
      document.querySelector('${presetPanel}').textContent.includes('Resolve the active pause') &&
      !document.querySelector('${presetPanel} .primary')`,
    );
    await evaluate(
      `[...document.querySelectorAll('${presetPanel} button')].find(button => button.textContent === 'Done').click()`,
    );
    await wait(
      `!document.querySelector('${presetPanel}') && document.querySelector('${pauseActive} button:not(:disabled)')`,
    );
    const actionId =
      "source.fixAll.veryLongProviderActionForDashboardDiagnostics";
    assert.equal(workspaceSettings()["editor.formatOnSave"], false);
    assert.equal(
      workspaceSettings()["editor.codeActionsOnSave"][actionId],
      "never",
    );
    await wait(
      `document.querySelector('${pauseActive} .primary:not(:disabled)')?.textContent === 'Resume'`,
    );
    await evaluate(`document.querySelector('${pauseActive} .primary').click()`);
    await wait(
      `document.querySelector('${pauseReview} .primary')?.textContent === 'Resume and restore settings'`,
    );
    assert.ok(
      await evaluate<boolean>(`[...document.querySelectorAll('${pauseReview} tbody tr')].some(row =>
        row.textContent.includes('source.fixAll.veryLongProviderActionForDashboardDiagnostics') &&
        row.cells[1].textContent === 'Never' && row.cells[2].textContent === 'Manual save'
      )`),
      "The resume preview must show that the pause disabled the configured save action",
    );
    await evaluate(`document.querySelector('${pauseReview} .primary').click()`);
    await wait(
      `document.querySelector('.profile-pause [role=status]')?.textContent.includes('Resumed. Previous settings restored for ') &&
      document.querySelector('${pauseStart} button:not(:disabled)') &&
      document.querySelector('#built-in-presets [aria-label="Preview Save, Paste & Type"]:not(:disabled)') &&
      !document.querySelector('${pauseActive}')`,
    );
    assert.equal(workspaceSettings()["editor.formatOnSave"], true);
    assert.equal(
      workspaceSettings()["editor.codeActionsOnSave"][actionId],
      "explicit",
    );
    await evaluate(`document.querySelector('${pauseStart} .primary').click()`);
    await wait(
      `document.querySelector('${pauseReview} .primary')?.textContent === 'Apply'`,
    );
    await evaluate(`document.querySelector('${pauseReview} .primary').click()`);
    await wait(
      `document.querySelector('${pauseActive} [aria-label="Keep settings and end pause"]:not(:disabled)')?.textContent === 'Keep settings'`,
    );
    await evaluate(
      `document.querySelector('${pauseActive} button:last-child').click()`,
    );
    await wait(
      `document.querySelector('${pauseReview} h2')?.textContent === 'Keep current settings and end pause?' &&
      document.querySelector('${pauseReview} .primary')?.textContent === 'Keep settings' &&
      !document.querySelector('${pauseActive}')`,
    );
    await session.send("Target.detachFromTarget", { sessionId });
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+n" : "Control+n",
    );
    await page
      .getByRole("tab", { name: /Untitled-/ })
      .first()
      .waitFor();
    await page
      .getByRole("tab", { name: /Formatting Controls/ })
      .first()
      .click();
    await attachDashboard();
    await wait(`document.querySelector('h1').textContent === 'Profiles' &&
      document.querySelector('${pauseActive} button:last-child:not(:disabled)') &&
      !document.querySelector('${pauseReview}')`);
    await evaluate(`window.addEventListener("message", ({data}) => {
      if (data?.type === "state") window.pickerTestState = data.state;
    });`);
    await evaluate(
      `document.querySelector('${pauseActive} button:last-child').click()`,
    );
    await wait(
      `document.querySelector('${pauseReview} .primary')?.textContent === 'Keep settings'`,
    );
    await evaluate(`document.querySelector('${pauseReview} .primary').click()`);
    await wait(
      `document.querySelector('.profile-pause [role=status]')?.textContent.includes('Current settings were kept') &&
      document.querySelector('${pauseStart} button:not(:disabled)')`,
    );
    assert.equal(workspaceSettings()["editor.formatOnSave"], false);
    assert.equal(
      workspaceSettings()["editor.codeActionsOnSave"][actionId],
      "never",
    );
    await evaluate(
      `document.querySelector('${presetChoice}[value="Save Only"]').click()`,
    );
    await evaluate(
      `document.querySelector('#built-in-presets [aria-label="Preview Save Only"]').click()`,
    );
    await wait(`document.querySelector('${presetPanel} .scope-bar')`);
    await choose(`${presetPanel} .scope-bar select`, "workspace");
    await evaluate(`document.querySelector('${presetPanel} .primary').click()`);
    await wait(
      `document.querySelector('${presetPanel} .primary')?.textContent === 'Apply'`,
    );
    await evaluate(`document.querySelector('${presetPanel} .primary').click()`);
    await wait(
      `document.querySelector('#built-in-presets [role=status]')?.textContent.startsWith('Applied Save Only')`,
    );
    await wait(`document.querySelector('${pauseStart} button:not(:disabled)')`);
    await evaluate(`document.querySelector('${pauseStart} .primary').click()`);
    await wait(
      `document.querySelectorAll('${pauseReview} tbody tr').length === 1 &&
      document.querySelector('${pauseReview} tbody th')?.textContent === 'Format on save' &&
      Array.from(document.querySelectorAll('${pauseReview} tbody td'), cell => cell.textContent).join(' → ') === 'On → Off' &&
      document.querySelector('${pauseReview} > p')?.textContent === 'Entire workspace' &&
      !document.querySelector('${pauseReview} details')`,
    );
    await evaluate(
      `document.querySelector('${pauseReview} .button-row button').click()`,
    );
    await wait(`document.querySelector('${pauseStart} button:not(:disabled)')`);
    assert.equal(workspaceSettings()["editor.formatOnSave"], true);
    // Exercise long lists in the rendered dashboard without adding saved data.
    await page.setViewportSize({ width: 460, height: 1100 });
    const renderPickers = (profiles: number, runs: number) =>
      evaluate(`(() => {
        const state = window.pickerTestState;
        const report = state.diagnosticHistory[0];
        const deliver = (next) => window.dispatchEvent(new MessageEvent("message", {
          data: { type: "state", state: next },
        }));
        deliver({
          ...state,
          profiles: [
            ...state.profiles.filter(profile => profile.builtin),
            ...Array.from({ length: ${profiles} }, (_, i) => ({
              name: i === 0 ? "Long saved profile name that wraps in a narrow dashboard with several words" : "Saved profile " + i,
              language: "typescript",
            })),
          ],
          diagnosticHistory: Array.from({ length: ${runs} }, (_, i) => ({
            ...report,
            id: "fixture-" + i,
            fileName: "Run " + i,
          })),
        });
      })()`);
    const checkPicker = async (listSelector: string, count: number) => {
      const list = `document.querySelector('${listSelector}')`;
      await wait(`(() => {
        const list = ${list};
        if (list?.children.length !== ${count}) return false;
        const bounds = list.getBoundingClientRect();
        return list.scrollTop === 0 &&
          Math.abs(list.children[2].getBoundingClientRect().bottom - bounds.bottom) <= 1 &&
          (list.scrollHeight > list.clientHeight) === ${count > 3} &&
          list.nextElementSibling.getBoundingClientRect().top >= bounds.bottom;
      })()`);
    };
    const savedPicker = "#saved-profiles .picker-scroll";
    await renderPickers(3, 3);
    await checkPicker(savedPicker, 3);
    await renderPickers(4, 3);
    await checkPicker(savedPicker, 4);
    await renderPickers(21, 3);
    await checkPicker(savedPicker, 21);
    await evaluate(
      `document.querySelector('${savedPicker} .profile-choice:last-child input').click()`,
    );
    await wait(`(() => {
      const list = document.querySelector('${savedPicker}');
      return list.scrollTop > 0 && list.lastElementChild.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1;
    })()`);
    await evaluate(
      "[...document.querySelectorAll('nav button')].find(button => button.textContent.includes('Diagnostics')).click()",
    );
    await checkPicker(".diagnostic-history", 3);
    await renderPickers(21, 4);
    await checkPicker(".diagnostic-history", 4);
    for (const [index, kind] of ["profile", "pause"].entries()) {
      await evaluate(`(() => {
        const state = window.pickerTestState;
        window.dispatchEvent(new MessageEvent("message", {
          data: {
            type: "state",
            state: {
              ...state, page: "profiles", navigation: state.navigation + 1,
              recovery: {
                kind: "${kind}", phase: "conflicts", scope: { target: "workspace" },
              },
            },
          },
        }));
      })()`);
      await wait(
        `document.activeElement.id === '${index === 0 ? "restore-settings-heading" : "workspace-pause-heading"}'`,
      );
      assert.equal(
        await evaluate<string>(
          "getComputedStyle(document.activeElement).outlineStyle",
        ),
        "none",
      );
    }
    console.log(
      `Dashboard verification passed: ${reports.length} page/layout accessibility scans, keyboard focus, reduced motion, CSP and escaped profile names.`,
    );
  } finally {
    await browser.close();
  }
};
