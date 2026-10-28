import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import axe from "axe-core";
import { chromium, type Page } from "playwright-core";

// The callbacks below execute in the editor renderer, not the Node test process.
declare const document: {
  querySelector(
    selector: string,
  ): { getAttribute(name: string): string | null } | null;
};

const source = resolve(process.argv[2] ?? "");
assert.ok(process.argv[2], "Provide the patched VS Code source directory.");
const theme = process.env.FORMATTING_CONTROLS_UI_THEME ?? "Dark Modern";
const report = resolve(
  "test-results/core-prototype",
  theme.replaceAll(" ", "-"),
);
mkdirSync(report, { recursive: true });
const temp = mkdtempSync(join(tmpdir(), "formatting-core-prototype-"));
mkdirSync(join(temp, "src"));
writeFileSync(
  join(temp, "src/app.ts"),
  "export const greeting = (name: string) => name.trim();\n",
);
writeFileSync(
  join(temp, "prototype.code-workspace"),
  JSON.stringify({
    folders: [{ path: "src" }],
    settings: {
      "workbench.colorTheme": theme,
      "workbench.startupEditor": "none",
    },
  }),
);
const ready = join(temp, "ready");
const done = join(temp, "done");
const probe = createServer();
await new Promise<void>((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", resolve);
});
const address = probe.address();
assert.ok(address && typeof address === "object");
const port = address.port;
await new Promise<void>((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
);
const args = [
  join(temp, "prototype.code-workspace"),
  "--user-data-dir",
  join(temp, "user"),
  "--extensions-dir",
  join(temp, "extensions"),
  `--extensionDevelopmentPath=${resolve(".")}`,
  `--extensionTestsPath=${resolve("dist/test/integration/core-prototype.js")}`,
  `--remote-debugging-port=${port}`,
  "--disable-workspace-trust",
  "--skip-welcome",
  "--skip-release-notes",
];
const child = spawn("bash", [join(source, "scripts/code.sh"), ...args], {
  cwd: source,
  env: {
    ...process.env,
    VSCODE_SKIP_PRELAUNCH: "1",
    FORMATTING_CORE_READY: ready,
    FORMATTING_CORE_DONE: done,
    FORMATTING_CORE_THEME: theme,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (data) => {
  output += String(data);
});
child.stderr.on("data", (data) => {
  output += String(data);
});
const completed = new Promise<number | null>((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
let exited = false;
void completed.then(() => {
  exited = true;
});
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function review(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.bringToFront();
  const status = page.locator('[id="kiraFormattingControls.prototype.status"]');
  await status.waitFor();
  assert.equal(
    await page
      .locator(".statusbar-item")
      .filter({ hasText: /^Formatting:/ })
      .count(),
    1,
    "Only one Formatting entry is visible.",
  );
  const card = page.locator(".kira-formatting-card");
  const hover = page.locator(".monaco-hover").filter({ has: card });
  const tabs = await page.locator(".editor-group-container .tab").count();
  await status.click();
  await card.waitFor();
  assert.equal(
    await page
      .locator(".workbench-hover-container")
      .filter({ has: card })
      .locator(".workbench-hover-pointer")
      .count(),
    1,
    "The editor supplies the anchored pointer.",
  );
  await page.mouse.move(5, 5);
  await delay(700);
  assert.equal(await card.isVisible(), true, "A click pins the actual card.");
  assert.equal(
    await page.locator(".editor-group-container .tab").count(),
    tabs,
  );
  assert.equal(await page.locator(".part.panel:visible").count(), 0);
  const bounds = await hover.boundingBox();
  assert.ok(bounds);
  assert.equal(await card.getByRole("checkbox").count(), 3);
  assert.equal(
    await card.locator("select").count(),
    3,
    "macOS uses the actual native SelectBox controls.",
  );
  assert.equal(
    await card.getByRole("button", { name: "Pause", exact: true }).count(),
    1,
  );
  assert.ok(
    (await card.locator(".kira-formatting-context").textContent())?.includes(
      "app.ts",
    ),
  );
  await page.screenshot({ path: join(report, "core-click-window.png") });
  await card.screenshot({ path: join(report, "core-card.png") });
  await page.keyboard.press("Escape");
  await card.waitFor({ state: "hidden" });
  await status.hover();
  await card.waitFor();
  assert.deepEqual(
    await hover.boundingBox(),
    bounds,
    "Hover and click use the same position and layout.",
  );
  await page.screenshot({ path: join(report, "core-hover-window.png") });
  // Pin before interacting, as Copilot does; controls must retain their nodes and geometry.
  await status.click();
  const type = card.getByRole("checkbox", {
    name: "Format on type",
    exact: true,
  });
  await type.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          '.kira-formatting-card [role="checkbox"][aria-label="Format on type"]',
        )
        ?.getAttribute("aria-checked") === "false",
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector(".kira-formatting-card")
        ?.getAttribute("aria-busy") === "false",
  );
  assert.deepEqual(
    await hover.boundingBox(),
    bounds,
    "Checkbox changes must not shift the UI.",
  );
  await type.click();
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          '.kira-formatting-card [role="checkbox"][aria-label="Format on type"]',
        )
        ?.getAttribute("aria-checked") === "true",
  );
  const language = card.getByRole("combobox", { name: "Apply to language" });
  await language.selectOption({ label: "TypeScript" });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".kira-formatting-card")
        ?.getAttribute("aria-busy") === "false",
  );
  assert.equal(
    await page.locator(".quick-input-widget:visible").count(),
    0,
    "Language selection remains inline.",
  );
  await language.selectOption({ label: "All languages" });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".kira-formatting-card")
        ?.getAttribute("aria-busy") === "false",
  );
  const scope = card.getByRole("combobox", { name: "Write to" });
  await scope.selectOption({ label: "User" });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".kira-formatting-card .monaco-button")
        ?.getAttribute("aria-disabled") === "true",
  );
  await scope.selectOption({ label: "Workspace" });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".kira-formatting-card .monaco-button")
        ?.getAttribute("aria-disabled") !== "true",
  );
  assert.equal(
    await page.locator(".quick-input-widget:visible").count(),
    0,
    "Scope selection remains inline.",
  );
  const formatter = card.getByRole("combobox", { name: "Default formatter" });
  await formatter.selectOption({ index: 0 });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".kira-formatting-card")
        ?.getAttribute("aria-busy") === "false",
  );
  await formatter.selectOption({ label: "TypeScript / JavaScript" });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".kira-formatting-card")
        ?.getAttribute("aria-busy") === "false",
  );
  await card.getByRole("button", { name: "Automatic formatting" }).click();
  assert.equal(await type.isVisible(), false);
  await card.getByRole("button", { name: "Automatic formatting" }).click();
  assert.equal(await type.isVisible(), true);
  await page.evaluate(axe.source);
  const accessibility = await page.evaluate<{ violations: unknown[] }>(
    `axe.run(document.querySelector('.kira-formatting-card'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}))`,
  );
  writeFileSync(
    join(report, "accessibility.json"),
    JSON.stringify(accessibility, null, 2),
  );
  assert.deepEqual(accessibility.violations, []);
  await card.getByRole("button", { name: "Pause", exact: true }).click();
  const confirmation = page.locator(".quick-input-widget:visible");
  await confirmation.waitFor();
  await page.keyboard.press("Enter");
  await confirmation.waitFor({ state: "hidden" });
  await status.hover();
  await card.getByRole("button", { name: "Resume", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          '.kira-formatting-card [role="checkbox"][aria-label="Format on type"]',
        )
        ?.getAttribute("aria-checked") === "false",
  );
  await card.screenshot({ path: join(report, "core-paused.png") });
  await card.getByRole("button", { name: "Resume", exact: true }).click();
  await confirmation.waitFor();
  await page.keyboard.press("Enter");
  await confirmation.waitFor({ state: "hidden" });
  await status.hover();
  await card.getByRole("button", { name: "Pause", exact: true }).waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector(
          '.kira-formatting-card [role="checkbox"][aria-label="Format on type"]',
        )
        ?.getAttribute("aria-checked") === "true",
  );
  await page.mouse.move(5, 5);
  await card.getByRole("button", { name: "Pause", exact: true }).focus();
  await page.keyboard.press("Escape");
  await card.waitFor({ state: "hidden" });
  await status.focus();
  await page.keyboard.press("Enter");
  await card.waitFor();
  await card
    .getByRole("button", { name: "Open dashboard ↗", exact: true })
    .click();
  await page
    .locator(".tab")
    .filter({ hasText: "Formatting Controls" })
    .waitFor();
  console.log(
    `Core card UI passed (${theme}): native controls, anchored hover/click, stable toggles, inline scope/language/formatter choices, collapse, keyboard and dashboard.`,
  );
}

let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
try {
  const deadline = Date.now() + 120000;
  while (!existsSync(ready)) {
    if (exited || Date.now() > deadline)
      throw new Error(
        `Custom editor did not become ready.\n${output.slice(-12000)}`,
      );
    await delay(100);
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0]?.pages()[0];
  assert.ok(page);
  await review(page);
  writeFileSync(done, "done");
  await browser.close();
  browser = undefined;
  const code = await completed;
  assert.equal(code, 0, output.slice(-12000));
} finally {
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page)
      await page
        .screenshot({ path: join(report, "failure.png") })
        .catch(() => undefined);
    await browser.close();
  }
  writeFileSync(join(report, "editor.log"), output);
  writeFileSync(done, "done");
  if (!exited) child.kill("SIGTERM");
  await Promise.race([completed, delay(5000)]);
  rmSync(temp, { recursive: true, force: true });
}
