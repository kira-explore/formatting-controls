import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import axe from "axe-core";
import type { Page } from "playwright-core";
import { statusArtwork } from "../shared/status-artwork";
import { issueUrl, statusHelp } from "../shared/status-help";

export async function reviewStatus(
  page: Page,
  directory: string,
): Promise<void> {
  mkdirSync(directory, { recursive: true });
  const fixtures = [
    { flags: [true, true, true], paused: false },
    { flags: [false, false, false], paused: false },
    { flags: [true, false, true], paused: false },
    { flags: [false, false, false], paused: true },
  ].map((state) =>
    statusArtwork({
      ...state,
      file: "app.ts",
      language: "typescript",
      workspace: "project",
      scope: "Workspace",
      languageScope: "All languages",
      owned: [],
      revision: 1,
      canPause: true,
    }),
  );
  const alignment = await page.evaluate<
    Array<{
      stateEdgeOffsetX: number;
      stateOffsetY: number;
      contextOffsetY: number;
      pauseOffsetX: number;
      pauseOffsetY: number;
      summaryHeadingOffsetY: number;
      summaryIconOffsetY: number;
      summaryStateOffsetY: number;
      summaryFits: boolean;
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
        if (!["svg","g","text","tspan","rect","circle","path"].includes(match[1])) throw new Error("Unexpected SVG node");
        const element = document.createElementNS(namespace, match[1]);
        for (const attr of match[2].matchAll(/([\\w-]+)="([^"]*)"/g)) element.setAttribute(attr[1], attr[2]);
        if (stack.length) stack[stack.length-1].append(element); else root = element;
        if (!match[0].endsWith("/>")) stack.push(element);
      }
      document.body.append(root);
      return root;
    }
    return fixtures.map(art => {
      const stateImage = mount(art.state), context = mount(art.context), pause = mount(art.pause), header = mount(art.header), summary = mount(art.summary);
      try {
        const stateText = stateImage.querySelector("text").getBBox();
        const file = Array.from(context.querySelectorAll("text")).find(text => text.textContent.startsWith("Active file:")).getBBox();
        const workspace = Array.from(context.querySelectorAll("text")).find(text => text.textContent.startsWith("Workspace:")).getBBox();
        const pauseText = pause.querySelector("text").getBBox();
        const title = header.querySelector("text").getBBox();
        const summaryText = summary.querySelectorAll("text");
        const summaryHeading = summaryText[0].getBBox();
        const summaryState = summaryText[1].getBBox();
        const summaryIcon = summary.querySelector("circle").getBBox();
        return {
          stateEdgeOffsetX: stateText.x + stateText.width - art.state.width,
          stateOffsetY: stateText.y + stateText.height/2 - 14,
          contextOffsetY: (file.y + workspace.y + workspace.height)/2 - 42,
          pauseOffsetX: pauseText.x + pauseText.width/2 - art.pause.width/2,
          pauseOffsetY: pauseText.y + pauseText.height/2 - art.pause.height/2,
          summaryHeadingOffsetY: summaryHeading.y + summaryHeading.height/2 - 14,
          summaryIconOffsetY: summaryIcon.y + summaryIcon.height/2 - 14,
          summaryStateOffsetY: summaryState.y + summaryState.height/2 - 14,
          summaryFits: summaryHeading.x + summaryHeading.width < summaryIcon.x,
          headerFits: title.x + title.width <= art.header.width,
          pauseFits: pauseText.x >= 1 && pauseText.x + pauseText.width <= art.pause.width - 1,
        };
      } finally { stateImage.remove(); context.remove(); pause.remove(); header.remove(); summary.remove(); }
    });
  })(${JSON.stringify(fixtures)})`);
  writeFileSync(
    join(directory, "status-alignment.json"),
    JSON.stringify(alignment, null, 2),
  );
  for (const measurement of alignment) {
    for (const offset of [
      measurement.stateEdgeOffsetX,
      measurement.stateOffsetY,
      measurement.contextOffsetY,
      measurement.pauseOffsetX,
      measurement.pauseOffsetY,
      measurement.summaryHeadingOffsetY,
      measurement.summaryIconOffsetY,
      measurement.summaryStateOffsetY,
    ])
      assert.ok(
        Math.abs(offset) <= 1,
        "Status, context and Pause/Resume text stay centered",
      );
    assert.ok(measurement.headerFits, "Full extension name fits");
    assert.ok(
      measurement.pauseFits,
      "Pause and Resume labels fit the same button",
    );
    assert.ok(
      measurement.summaryFits,
      "The larger heading clears the info icon",
    );
  }

  const button = page.getByRole("button", {
    name: /^Formatting: (ON|OFF|MIXED)$/,
  });
  const hover = page.locator(".monaco-hover").filter({
    has: page.getByRole("img", { name: /^Kira Formatting Controls/ }),
  });
  const loaded = async () => {
    await hover.waitFor({ state: "visible" });
    const images = hover.locator("img");
    await images.nth(13).waitFor();
    assert.equal(await images.count(), 14, "All status artwork is rendered");
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
  // Enter through the status item's hover bridge before moving sideways to
  // an action. Jumping straight across the gap can dismiss a transient hover.
  await page.mouse.move(
    Math.max(
      hovered.x + 8,
      Math.min(anchor.x + anchor.width / 2, hovered.x + hovered.width - 8),
    ),
    hovered.y + hovered.height - 8,
    { steps: 4 },
  );
  // Keep the pointer over the actual action while collecting screenshots.
  // Resting in the bottom padding can let the native transient hover expire
  // before Playwright finishes waiting for a stable click target (notably HC).
  const hoverPauseBounds = await hover
    .getByRole("link", { name: "Pause", exact: true })
    .boundingBox();
  assert.ok(hoverPauseBounds);
  await page.mouse.move(
    hoverPauseBounds.x + hoverPauseBounds.width / 2,
    hoverPauseBounds.y + hoverPauseBounds.height / 2,
    { steps: 8 },
  );
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
  const scopes = hover.getByRole("img", { name: /^Settings scope:/ });
  const flags = hover.getByRole("img", { name: /^Format on save:/ });
  const formatter = hover.getByRole("img", { name: /^Default formatter:/ });
  for (const image of [scopes, flags, formatter])
    assert.equal(
      await image.evaluate((el) => !!el.closest("a")),
      false,
      "Read-only values have no command",
    );
  await scopes.click({ position: { x: 330, y: 45 } });
  await flags.click({ position: { x: 14, y: 18 } });
  await formatter.click({ position: { x: 320, y: 26 } });
  assert.equal(await page.locator(".quick-input-widget:visible").count(), 0);
  assert.deepEqual(await hover.boundingBox(), hovered);

  const fileInfo = hover.getByRole("img", { name: /^Active file:/ });
  assert.equal(await fileInfo.getAttribute("title"), statusHelp.file);
  assert.equal(
    await fileInfo.evaluate((el) => !!el.closest("a")),
    false,
    "File information is hover-only with no command",
  );
  const formattingInfo = hover.getByRole("img", {
    name: /^Automatic formatting:/,
  });
  assert.equal(
    await formattingInfo.getAttribute("title"),
    statusHelp.formatting,
  );
  assert.equal(
    await formattingInfo.evaluate((el) => !!el.closest("a")),
    false,
    "Formatting information is hover-only with no command",
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
  const contextBounds = await fileInfo.boundingBox();
  const dashboardBounds = await dashboard.getByRole("img").boundingBox();
  const issueBounds = await issue.getByRole("img").boundingBox();
  assert.ok(contextBounds && dashboardBounds && issueBounds);
  assert.equal(
    contextBounds.width,
    380,
    "The card uses the approved narrower content width",
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
  assert.equal(dashboardBounds.height, 28);
  assert.equal(issueBounds.height, 28);
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
    y: dashboardBounds.y + 14,
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
  assert.equal(
    await dashboard.getAttribute("title"),
    "Open Kira Formatting Controls dashboard",
  );
  assert.equal(await issue.getAttribute("title"), "Open a new issue on GitHub");
  const pauseLink = hover.getByRole("link", { name: "Pause", exact: true });
  assert.equal(await pauseLink.getAttribute("title"), null);
  const pauseImage = pauseLink.getByRole("img", { name: "Pause", exact: true });
  assert.equal(await pauseImage.getAttribute("title"), null);
  assert.equal((await pauseImage.boundingBox())?.width, 66);
  assert.equal((await pauseImage.boundingBox())?.height, 28);
  const pauseBounds = await pauseImage.boundingBox();
  const separatorBounds = await pauseLink
    .locator("xpath=ancestor::tr/following-sibling::tr[1]")
    .locator("img")
    .boundingBox();
  const settingsBounds = await settings.getByRole("img").boundingBox();
  const headerBounds = await hover
    .getByRole("img", { name: "Kira Formatting Controls", exact: true })
    .boundingBox();
  assert.ok(
    pauseBounds && separatorBounds && settingsBounds && headerBounds && hovered,
  );
  const center = (box: { y: number; height: number }) => box.y + box.height / 2;
  assert.equal(settingsBounds.height, 24, "Settings keeps its current size");
  assert.ok(Math.abs(center(settingsBounds) - center(headerBounds)) <= 1);
  const flagBounds = await flags.boundingBox();
  const caption = hover.getByRole("img", {
    name: statusHelp.pause,
    exact: true,
  });
  const captionBounds = await caption.boundingBox();
  assert.ok(flagBounds && captionBounds);
  const pauseTopGap = pauseBounds.y - (flagBounds.y + flagBounds.height);
  const pauseBottomGap =
    separatorBounds.y + 1 - (pauseBounds.y + pauseBounds.height);
  assert.ok(
    pauseTopGap >= 10 &&
      pauseTopGap <= 14 &&
      pauseBottomGap >= 10 &&
      pauseBottomGap <= 14 &&
      Math.abs(pauseTopGap - pauseBottomGap) <= 2,
    `Pause row padding stays balanced (${pauseTopGap}px above, ${pauseBottomGap}px below)`,
  );
  assert.ok(Math.abs(center(pauseBounds) - center(captionBounds)) <= 1);
  assert.equal(await caption.evaluate((el) => Boolean(el.closest("a"))), false);
  assert.equal(
    await pauseImage.evaluate(
      (el) => el.closest("tr") === el.closest("table")?.querySelector("tr"),
    ),
    false,
  );
  assert.equal(
    await hover.evaluate(
      (element, point) =>
        Boolean(
          element.ownerDocument
            .elementFromPoint(point.x, point.y)
            ?.closest("a"),
        ),
      { x: pauseBounds.x + pauseBounds.width / 2, y: pauseBounds.y - 4 },
    ),
    false,
    "Pause row padding cannot invoke an action",
  );
  await caption.click();
  assert.equal(await page.locator(".quick-input-widget:visible").count(), 0);
  assert.deepEqual(await hover.boundingBox(), hovered);
  const footerTopGap = dashboardBounds.y + 14 - (separatorBounds.y + 1);
  const footerBottomGap =
    hovered.y + hovered.height - 1 - (dashboardBounds.y + 14);
  assert.ok(
    Math.abs(footerTopGap - footerBottomGap) <= 2,
    `Footer text is centered between its separator and the frame (${footerTopGap}px above, ${footerBottomGap}px below)`,
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
    await hover.getByRole("link", { name: action, exact: true }).click();
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
  await page.keyboard.press(`${modifier}+End`);
  await page.keyboard.type(" ");
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
    "Status card verified: smaller text/icons, stable hover/click bounds, native Pause/Resume picker and Command Palette entry, cancellation, fixed status alignment, read-only fields, hover-only info, keyboard access and accessible descriptions.",
  );
}
