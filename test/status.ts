import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import axe from "axe-core";
import type { Page } from "playwright-core";
import { statusArtwork } from "../shared/status-artwork";
import { issueUrl, statusHelp } from "../shared/status-help";

export const reviewStatus = async (
  page: Page,
  directory: string,
): Promise<void> => {
  mkdirSync(directory, { recursive: true });
  const fixtures = [
    { flags: [true, true, true], paused: false },
    { flags: [false, false, false], paused: false },
    { flags: [true, false, true], paused: false },
    { flags: [false, false, false], paused: true },
    {
      flags: [true, false, true],
      paused: false,
      workspace: "formatting-controls",
    },
    {
      flags: [true, true, true],
      paused: false,
      workspace: "design-system-and-editor-productivity-tools",
    },
    {
      flags: [false, false, false],
      paused: true,
      file: `${"W".repeat(70)}.ts`,
      folder: "folder-with-an-exceptionally-long-unbroken-name",
    },
    {
      flags: [true, false, true],
      paused: false,
      workspace: "开发工作区".repeat(12),
    },
    {
      flags: [true, false, true],
      paused: false,
      workspace: "Широкое-название-рабочего-пространства".repeat(3),
    },
    {
      flags: [true, true, true],
      paused: false,
      file: "No active file",
      workspace: "🌿".repeat(30),
    },
  ].map((state) =>
    statusArtwork({
      ...(state.paused ? { folder: "second-project" } : {}),
      file: "app.ts",
      language: "typescript",
      workspace: "project",
      scope: "Workspace",
      languageScope: "All languages",
      owned: [],
      revision: 1,
      canPause: true,
      ...state,
    }),
  );
  const alignment = await page.evaluate<
    Array<{
      contextOffsetY: number;
      contextIconGap: number;
      contextFits: boolean;
      pauseOffsetX: number;
      pauseOffsetY: number;
      summaryHeadingOffsetY: number;
      summaryTop: number;
      triggerBottom: number;
      headerFits: boolean;
      pauseFits: boolean;
    }>
  >(`(fixtures => {
    const namespace = "http://www.w3.org/2000/svg";
    function mount(part) {
      const stack = [];
      let root;
      for (const match of part.svg.matchAll(/<\\/?([a-z]+)\\b([^>]*)>|([^<]+)/gi)) {
        if (match[3]) {
          if (stack.length) stack[stack.length-1].append(document.createTextNode(match[3]));
          continue;
        }
        if (match[0].startsWith("</")) { stack.pop(); continue; }
        if (!["svg","g","text","tspan","rect","circle","path","defs","clipPath"].includes(match[1])) throw new Error("Unexpected SVG node");
        const element = document.createElementNS(namespace, match[1]);
        for (const attr of match[2].matchAll(/([\\w-]+)="([^"]*)"/g)) element.setAttribute(attr[1], attr[2]);
        if (stack.length) stack[stack.length-1].append(element); else root = element;
        if (!match[0].endsWith("/>")) stack.push(element);
      }
      document.body.append(root);
      return root;
    }
    return fixtures.map(art => {
      const context = mount(art.context), pause = mount(art.pause), header = mount(art.header), summary = mount(art.summary), formatting = mount(art.formatting);
      try {
        const contextLines = Array.from(context.querySelectorAll('g[clip-path] text'));
        const file = contextLines[0].getBBox();
        const lastContextLine = contextLines.at(-1).getBBox();
        const contextIcon = context.querySelector('[data-status]').getBBox();
        const contextClip = context.querySelector("clipPath rect");
        const pauseText = pause.querySelector("text").getBBox();
        const title = header.querySelector("text").getBBox();
        const summaryText = summary.querySelectorAll("text");
        const summaryHeading = summaryText[0].getBBox();
        const triggerNote = Array.from(formatting.querySelectorAll("text")).at(-1).getBBox();
        return {
          contextOffsetY: (file.y + lastContextLine.y + lastContextLine.height)/2 - (contextIcon.y + contextIcon.height/2),
          contextIconGap: file.x - (contextIcon.x + contextIcon.width),
          contextFits: contextLines.every(text => {
            const box = text.getBBox();
            return box.x >= +contextClip.getAttribute("x") && box.x + box.width <= +contextClip.getAttribute("x") + +contextClip.getAttribute("width");
          }),
          pauseOffsetX: pauseText.x + pauseText.width/2 - art.pause.width/2,
          pauseOffsetY: pauseText.y + pauseText.height/2 - art.pause.height/2,
          summaryHeadingOffsetY: summaryHeading.y + summaryHeading.height/2 - 14,
          summaryTop: summaryHeading.y,
          triggerBottom: triggerNote.y + triggerNote.height,
          headerFits: title.x + title.width <= art.header.width,
          pauseFits: pauseText.x >= 1 && pauseText.x + pauseText.width <= art.pause.width - 1,
        };
      } finally { context.remove(); pause.remove(); header.remove(); summary.remove(); formatting.remove(); }
    });
  })(${JSON.stringify(fixtures)})`);
  writeFileSync(
    join(directory, "status-alignment.json"),
    JSON.stringify(alignment, null, 2),
  );
  for (const measurement of alignment) {
    for (const offset of [
      measurement.contextOffsetY,
      measurement.pauseOffsetX,
      measurement.pauseOffsetY,
      measurement.summaryHeadingOffsetY,
    ])
      assert.ok(
        Math.abs(offset) <= 1,
        "Status, context and Pause/Resume text stay centered",
      );
    assert.ok(measurement.headerFits, "Full extension name fits");
    assert.ok(
      measurement.contextIconGap >= 10,
      "File context clears its status icon",
    );
    assert.ok(
      measurement.contextFits,
      "Ellipsized names fit their column without clipping",
    );
    assert.ok(
      measurement.pauseFits,
      "Pause and Resume labels fit the same button",
    );
  }

  const button = page.getByRole("button", {
    name: /^Formatting: (Enabled|Disabled|Mixed)$/,
  });
  const hover = page.locator(".monaco-hover").filter({
    has: page.getByRole("img", { name: /^Kira Formatting Controls/ }),
  });
  const loaded = async () => {
    await hover.waitFor({ state: "visible" });
    const images = hover.locator("img");
    await images.nth(10).waitFor();
    assert.equal(await images.count(), 11, "All status artwork is rendered");
  };
  const captureCard = async (name: string) => {
    const bounds = await hover.boundingBox();
    assert.ok(bounds, "The card is visible before capturing it");
    // Capture the viewport region without scrolling the native hover or
    // fast-forwarding its lifecycle animations, either of which can dismiss it.
    await page.screenshot({ path: join(directory, name), clip: bounds });
    assert.ok(await hover.isVisible(), "Capturing the card keeps it visible");
  };
  const dismiss = async () => {
    // A transient hover may already have closed after a screenshot. Focus it
    // only if present so native pointer dismissal cannot race a locator wait.
    await page.evaluate(
      `document.querySelector('.monaco-hover:has(img[alt="Kira Formatting Controls"])')?.focus()`,
    );
    await page.keyboard.press("Escape");
    await page.mouse.move(10, 200);
    await hover.waitFor({ state: "hidden" });
  };
  const tabs = await page.locator(".editor-group-container .tab").count();
  const panels = await page.locator(".part.panel:visible").count();
  await button.waitFor();
  await page.mouse.move(10, 200);
  await button.hover();
  await loaded();
  const hovered = await hover.boundingBox();
  const anchor = await button.boundingBox();
  assert.ok(hovered && anchor);
  const enterPause = async () => {
    const card = await hover.boundingBox();
    const action = hover.getByRole("link", { name: "Pause", exact: true });
    const target = await action.getByRole("img").boundingBox();
    assert.ok(card && target);
    // Enter through the native bridge, then travel inside the card to its
    // header. A diagonal jump from the status bar can dismiss the hover.
    await page.mouse.move(
      Math.max(
        card.x + 8,
        Math.min(anchor.x + anchor.width / 2, card.x + card.width - 8),
      ),
      card.y + card.height - 8,
      { steps: 4 },
    );
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height / 2,
      { steps: 8 },
    );
  };
  await enterPause();
  writeFileSync(
    join(directory, "status-row-layout.json"),
    JSON.stringify(
      await hover.locator("img").evaluateAll((images) =>
        images.map((img) => {
          const box = img.getBoundingClientRect();
          const row = img.closest("tr")?.getBoundingClientRect();
          return {
            alt: img.alt,
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            row: row && { y: row.y, height: row.height },
          };
        }),
      ),
      null,
      2,
    ),
  );
  await captureCard("status-implementation-probe.png");
  writeFileSync(
    join(directory, "status-rendered.html"),
    await hover.innerHTML(),
  );
  const labels = await hover
    .locator("img")
    .evaluateAll((images) => images.map((img) => img.getAttribute("alt")));
  await page.screenshot({
    path: join(directory, "status-hover-window.png"),
  });
  const picker = page.locator(".quick-input-widget:visible");
  const reopen = async () => {
    const deadline = Date.now() + 15000;
    while (true) {
      await page.mouse.move(10, 200);
      await button.hover();
      try {
        await hover.waitFor({ state: "visible", timeout: 2500 });
        await loaded();
        return;
      } catch (error) {
        if (Date.now() >= deadline) {
          await page.screenshot({
            path: join(directory, "status-reopen-failure.png"),
          });
          writeFileSync(
            join(directory, "status-reopen-failure.html"),
            await page.locator(".part.statusbar").innerHTML(),
          );
          throw error;
        }
      }
    }
  };
  // The hover-only entry point dismisses the card before opening its picker.
  // Screenshot capture can outlive the transient hover's native grace period
  // on CI. Start a fresh hover before testing the real, non-forced click rather
  // than relying on the screenshot's older DOM and position.
  await dismiss();
  await reopen();
  await enterPause();
  await hover.getByRole("link", { name: "Pause", exact: true }).click();
  await picker.waitFor();
  await hover.waitFor({ state: "hidden" });
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden" });
  await reopen();
  assert.deepEqual(
    await hover
      .locator("img")
      .evaluateAll((images) => images.map((img) => img.getAttribute("alt"))),
    labels,
    "Cancelling Pause keeps the settings and button state",
  );
  await dismiss();
  await button.click();
  await loaded();
  assert.deepEqual(
    await hover.boundingBox(),
    hovered,
    "Hover and click have identical bounds",
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
  const scopes = hover.getByRole("img", { name: /^Scope:/ });
  const flags = hover.getByRole("img", { name: /^Format on save:/ });
  const formatter = hover.getByRole("img", { name: /^Formatter:/ });
  for (const image of [scopes, flags, formatter])
    assert.equal(
      await image.evaluate((el) => !!el.closest("a")),
      false,
      "Read-only values have no command",
    );
  await scopes.click({ position: { x: 300, y: 45 } });
  await flags.click({ position: { x: 14, y: 18 } });
  await formatter.click({ position: { x: 320, y: 26 } });
  assert.equal(await page.locator(".quick-input-widget:visible").count(), 0);
  assert.deepEqual(await hover.boundingBox(), hovered);

  const fileInfo = hover.getByRole("img", { name: /^Active file:/ });
  const fullFileLabel = await fileInfo.getAttribute("alt");
  const fileTitle = await fileInfo.getAttribute("title");
  if (fileTitle) {
    for (const label of fileTitle.split("\n"))
      assert.ok(fullFileLabel?.includes(label));
  }
  assert.equal(
    await fileInfo.evaluate((el) => !!el.closest("a")),
    false,
    "File context has no command",
  );
  const formattingInfo = hover.getByRole("img", {
    name: /^Automatic formatting$/,
  });
  assert.equal(await formattingInfo.getAttribute("title"), null);
  assert.equal(
    await formattingInfo.evaluate((el) => !!el.closest("a")),
    false,
    "Formatting heading has no command",
  );
  const settings = hover.getByRole("link", {
    name: "Open VS Code Settings",
    exact: true,
  });
  assert.equal(
    await settings
      .getByRole("img", { name: "Open VS Code Settings", exact: true })
      .count(),
    1,
  );
  writeFileSync(
    join(directory, "status-accessible-names.txt"),
    await hover.ariaSnapshot(),
  );
  const dashboard = hover.getByRole("link", { name: /^Open dashboard/ });
  const issue = hover.getByRole("link", { name: /^Report an issue/ });
  for (const action of [dashboard, issue]) {
    assert.equal(await action.getAttribute("title"), null);
    assert.equal(await action.getByRole("img").getAttribute("title"), null);
  }
  const contextBounds = await fileInfo.boundingBox();
  const dashboardBounds = await dashboard.getByRole("img").boundingBox();
  const issueBounds = await issue.getByRole("img").boundingBox();
  assert.ok(contextBounds && dashboardBounds && issueBounds);
  assert.equal(contextBounds.width, 330);
  assert.equal(
    contextBounds.width,
    Number(await fileInfo.getAttribute("width")),
    "The card widens without scaling text or icons",
  );
  assert.equal(
    dashboardBounds.x,
    contextBounds.x,
    "Footer shares the context artwork's left edge",
  );
  assert.equal(
    issueBounds.x + issueBounds.width,
    contextBounds.x + contextBounds.width,
    "Issue action shares the context artwork's right edge",
  );
  assert.equal(
    dashboardBounds.y,
    issueBounds.y,
    "Footer actions stay on the same row",
  );
  assert.equal(
    dashboardBounds.width,
    139,
    "Dashboard hit area fits its outlined button",
  );
  assert.equal(
    issueBounds.width,
    133,
    "Issue hit area fits its outlined button",
  );
  assert.equal(dashboardBounds.height, 36);
  assert.equal(issueBounds.height, 36);
  for (const [link, bounds] of [
    [dashboard, dashboardBounds],
    [issue, issueBounds],
  ] as const) {
    for (const x of [bounds.x + 3, bounds.x + bounds.width - 3]) {
      await page.mouse.move(x, bounds.y + bounds.height / 2);
      const hit = await link.evaluate(
        (element, point) => {
          const target = element.ownerDocument.elementFromPoint(
            point.x,
            point.y,
          );
          return {
            linked: target?.closest("a") === element,
            cursor: target
              ? element.ownerDocument.defaultView?.getComputedStyle(target)
                  .cursor
              : undefined,
          };
        },
        { x, y: bounds.y + bounds.height / 2 },
      );
      assert.equal(hit.linked, true, "The entire footer button is linked");
      assert.equal(
        hit.cursor,
        "pointer",
        "Footer padding uses the hand cursor",
      );
    }
  }
  const gutter = {
    x: dashboardBounds.x + dashboardBounds.width + 20,
    y: dashboardBounds.y + 21,
  };
  assert.equal(
    await hover.evaluate(
      (element, { x, y }) =>
        Boolean(element.ownerDocument.elementFromPoint(x, y)?.closest("a")),
      gutter,
    ),
    false,
    "The footer gutter is not clickable",
  );
  await page.mouse.click(gutter.x, gutter.y);
  assert.equal(
    await page.locator(".editor-group-container .tab").count(),
    tabs,
    "Clicking the footer gutter does not open the dashboard",
  );
  assert.equal(await issue.getAttribute("data-href"), issueUrl);
  const pauseLink = hover.getByRole("link", { name: "Pause", exact: true });
  assert.equal(await pauseLink.getAttribute("title"), statusHelp.pause);
  const pauseImage = pauseLink.getByRole("img", { name: "Pause", exact: true });
  assert.equal(await pauseImage.getAttribute("title"), statusHelp.pause);
  assert.equal((await pauseImage.boundingBox())?.width, 66);
  const pauseBounds = await pauseImage.boundingBox();
  const settingsBounds = await settings.getByRole("img").boundingBox();
  const headerBounds = await hover
    .getByRole("img", { name: "Kira Formatting Controls", exact: true })
    .boundingBox();
  assert.ok(pauseBounds && settingsBounds && headerBounds && hovered);
  const center = (box: { y: number; height: number }) => box.y + box.height / 2;
  assert.equal(settingsBounds.height, 24, "Settings keeps its current size");
  assert.equal(
    pauseBounds.height,
    settingsBounds.height,
    "Pause/Resume and Settings share the same height",
  );
  assert.ok(Math.abs(center(settingsBounds) - center(headerBounds)) <= 1);
  const summaryBounds = await formattingInfo.boundingBox();
  const flagBounds = await flags.boundingBox();
  assert.ok(summaryBounds && flagBounds);
  const formatterBounds = await hover
    .getByRole("img", { name: /^Formatter:/ })
    .boundingBox();
  assert.ok(formatterBounds && alignment[0]);
  const formattingTopGap =
    summaryBounds.y + alignment[0].summaryTop - (formatterBounds.y + 46);
  const formattingBottomGap =
    dashboardBounds.y + 1 - (flagBounds.y + alignment[0].triggerBottom);
  assert.ok(
    Math.abs(formattingTopGap - formattingBottomGap) <= 1,
    `Automatic formatting has balanced padding (${formattingTopGap}px above, ${formattingBottomGap}px below)`,
  );
  assert.ok(
    Math.abs(center(pauseBounds) - center(headerBounds)) <= 1,
    "Pause aligns with the title and Settings",
  );
  assert.ok(
    pauseBounds.x >= headerBounds.x + headerBounds.width &&
      pauseBounds.x + pauseBounds.width + 4 <= settingsBounds.x,
    "Pause stays between the title and Settings with a clear gap",
  );
  const scopeBounds = await scopes.boundingBox();
  assert.ok(contextBounds && scopeBounds);
  assert.ok(contextBounds.y + contextBounds.height <= scopeBounds.y);
  assert.match(
    (await fileInfo.getAttribute("alt")) ?? "",
    /Automatic formatting: (Enabled|Disabled|Mixed)/,
  );
  assert.equal(
    await hover
      .getByRole("img", {
        name: /^Automatic formatting: (Enabled|Disabled|Mixed)$/,
      })
      .count(),
    0,
    "Status is included once in the file section",
  );
  assert.equal(
    await formattingInfo.evaluate((el) => Boolean(el.closest("a"))),
    false,
  );
  await formattingInfo.click();
  assert.equal(await page.locator(".quick-input-widget:visible").count(), 0);
  assert.deepEqual(await hover.boundingBox(), hovered);
  const footerTopGap = dashboardBounds.y + 21 - (dashboardBounds.y + 1);
  const footerBottomGap =
    hovered.y + hovered.height - 1 - (dashboardBounds.y + 21);
  assert.ok(
    Math.abs(footerTopGap - footerBottomGap) <= 2,
    `Footer text stays centered (${footerTopGap}px above, ${footerBottomGap}px below)`,
  );
  const feedback = [];
  for (const link of [settings, dashboard, issue, pauseLink]) {
    await page.mouse.move(5, 5);
    const before = await link.evaluate((el) => {
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (!style) throw new Error("Missing rendered styles");
      return {
        color: style.color,
        decoration: style.textDecorationLine,
        background: style.backgroundColor,
      };
    });
    await link.hover();
    assert.equal(
      await link.evaluate(
        (el) => el.ownerDocument.defaultView?.getComputedStyle(el).cursor,
      ),
      "pointer",
      "Header and footer actions show the hand cursor",
    );
    const after = await link.evaluate((el) => {
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (!style) throw new Error("Missing rendered styles");
      return {
        color: style.color,
        decoration: style.textDecorationLine,
        background: style.backgroundColor,
      };
    });
    feedback.push({ name: await link.getAttribute("title"), before, after });
    assert.deepEqual(
      await hover.boundingBox(),
      hovered,
      "Hover feedback cannot move the card",
    );
  }
  writeFileSync(
    join(directory, "status-hover-feedback.json"),
    JSON.stringify(feedback, null, 2),
  );
  await page.mouse.move(5, 5);
  await page.waitForTimeout(650);
  assert.ok(await hover.isVisible(), "Click pins the card");
  await page.screenshot({
    path: join(directory, "status-click-window.png"),
  });
  await captureCard("status-card.png");

  await page.evaluate(axe.source);
  const accessibility = await page.evaluate<{ violations: unknown[] }>(
    `axe.run(document.querySelector('.monaco-hover'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}).then(r=>({violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))}))`,
  );
  writeFileSync(
    join(directory, "status-accessibility.json"),
    JSON.stringify(accessibility, null, 2),
  );
  assert.deepEqual(accessibility.violations, []);
  const notifications = await page
    .locator(".notifications-toasts .notification-toast")
    .count();
  for (const info of [fileInfo, formattingInfo]) {
    await info.hover();
    assert.notEqual(
      await info.evaluate(
        (el) => el.ownerDocument.defaultView?.getComputedStyle(el).cursor,
      ),
      "pointer",
    );
    await info.click();
    assert.equal(
      await hover.locator("a:focus").count(),
      0,
      "Info clicks cannot focus a link or draw a link outline",
    );
    await flags.waitFor();
    assert.deepEqual(
      await hover.boundingBox(),
      hovered,
      "Info clicks do not change the card",
    );
    assert.equal(await page.locator(".quick-input-widget:visible").count(), 0);
    assert.equal(
      await page.locator(".notifications-toasts .notification-toast").count(),
      notifications,
    );
  }

  // Pause/Resume applies only after the native picker closes the status card.
  const originalFlags = await flags.getAttribute("alt");
  for (const action of ["Pause", "Resume"]) {
    const actionLink = hover.getByRole("link", { name: action, exact: true });
    assert.equal(
      await actionLink.getAttribute("title"),
      action === "Pause" ? statusHelp.pause : statusHelp.resume,
    );
    await actionLink.click();
    await picker.waitFor();
    await hover.waitFor({ state: "hidden" });
    await picker
      .locator(".monaco-list-row")
      .filter({ hasText: `${action} automatic formatting` })
      .waitFor();
    await page.screenshot({
      path: join(directory, `status-${action.toLowerCase()}-picker.png`),
    });
    await page.keyboard.press("Enter");
    await picker.waitFor({ state: "hidden" });
    const nextAction = action === "Pause" ? "Resume" : "Pause";
    await reopen();
    await hover.getByRole("img", { name: nextAction, exact: true }).waitFor();
    assert.equal(await page.locator(".quick-input-widget:visible").count(), 0);
    assert.equal(
      await page.locator(".editor-group-container .tab").count(),
      tabs,
    );
    const bounds = await hover.boundingBox();
    assert.equal(
      bounds?.width,
      hovered?.width,
      "Pause/Resume keeps the card width",
    );
    assert.equal(
      bounds?.height,
      hovered?.height,
      "Pause/Resume keeps the card height",
    );
    assert.deepEqual(
      bounds,
      hovered,
      "The reopened card keeps its anchored position",
    );
    await captureCard(`status-${action.toLowerCase()}-complete.png`);
  }
  assert.equal(
    await flags.getAttribute("alt"),
    originalFlags,
    "Resume restores the previous formatting snapshot",
  );

  const testFiles = JSON.parse(
    readFileSync(join(directory, "status-workspace.json"), "utf8"),
  ) as { settingsFile: string; activeFile: string };
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  const openFile = async (path: string) => {
    await page.keyboard.press(`${modifier}+P`);
    await picker.locator("input").fill(path);
    await picker
      .locator(".monaco-list-row")
      .filter({ hasText: basename(path) })
      .first()
      .click();
    await picker.waitFor({ state: "hidden" });
    await page
      .locator(".tab.active")
      .filter({ hasText: basename(path) })
      .waitFor();
  };
  await dismiss();
  await openFile(testFiles.settingsFile);
  // Create the dirty buffer through the test host's public editor API;
  // this is independent of native keyboard focus and EditContext support.
  const editRequest = join(directory, "status-edit-settings");
  writeFileSync(editRequest, "edit");
  const editDeadline = Date.now() + 10000;
  while (existsSync(editRequest)) {
    assert.ok(
      Date.now() < editDeadline,
      "Test host creates the unsaved settings edit",
    );
    await delay(50);
  }
  await page
    .locator(".tab.active.dirty")
    .filter({ hasText: "settings.json" })
    .waitFor();
  await reopen();
  await hover.getByRole("link", { name: "Pause", exact: true }).click();
  await picker.waitFor();
  await page.keyboard.press("Enter");
  await picker.waitFor({ state: "hidden" });
  const warning = page.locator(".notification-toast").filter({
    hasText: "has unsaved changes. Save the file, then try again.",
  });
  await warning.waitFor();
  // Start elsewhere so the next tab transition confirms that the warning's
  // asynchronous Open action finished before saving and opening another file.
  await openFile(testFiles.activeFile);
  await warning.getByRole("button", { name: "Open settings file" }).click();
  await page
    .locator(".tab.active")
    .filter({ hasText: "settings.json" })
    .waitFor();
  await page.screenshot({
    path: join(directory, "status-unsaved-settings.png"),
  });
  // Save only the disposable test document; the extension does not save it.
  await page.keyboard.press(`${modifier}+S`);
  await openFile(testFiles.activeFile);
  await reopen();
  assert.equal(await flags.getAttribute("alt"), originalFlags);

  await dismiss();
  await openFile(testFiles.settingsFile);
  await reopen();
  const settingsFlags = await flags.getAttribute("alt");
  for (let cycle = 0; cycle < 4; cycle++) {
    for (const action of ["Pause", "Resume"]) {
      await hover.getByRole("link", { name: action, exact: true }).click();
      const choice = picker
        .locator(".monaco-list-row")
        .filter({ hasText: `${action} automatic formatting` });
      await choice.waitFor();
      if (cycle % 2) await choice.click();
      else await page.keyboard.press("Enter");
      await picker.waitFor({ state: "hidden" });
      await reopen();
      await hover
        .getByRole("img", {
          name: action === "Pause" ? "Resume" : "Pause",
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page.locator(".tab.active.dirty").count(),
        0,
        `${action} cycle ${cycle} leaves settings saved`,
      );
    }
    assert.equal(await flags.getAttribute("alt"), settingsFlags);
  }
  await dismiss();
  await openFile(testFiles.activeFile);
  await reopen();
  assert.equal(await flags.getAttribute("alt"), originalFlags);

  await dismiss();
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P",
  );
  await picker
    .locator("input")
    .fill(">Formatting Controls: Pause / Resume Automatic Formatting");
  await picker
    .locator(".monaco-list-row")
    .filter({ hasText: "Pause / Resume Automatic Formatting" })
    .waitFor();
  await page.keyboard.press("Enter");
  await picker
    .locator(".monaco-list-row")
    .filter({ hasText: "Pause automatic formatting" })
    .waitFor();
  await page.keyboard.press("Escape");
  await picker.waitFor({ state: "hidden" });
  await reopen();
  await dismiss();
  await button.focus();
  await page.keyboard.press("Enter");
  await loaded();
  await dashboard.click();
  await page
    .getByRole("tab", { name: /Formatting Controls/ })
    .first()
    .waitFor();
  console.log(
    "Status card verified: smaller text/icons, stable hover/click bounds, native Pause/Resume picker and Command Palette entry, cancellation, fixed status alignment, read-only fields, no explanatory tooltips, keyboard access and accessible descriptions.",
  );
};
