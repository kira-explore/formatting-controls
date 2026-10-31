# Formatting status card

Hover and click open the same anchored card above the Formatting status-bar item. Click focuses and pins it; Escape dismisses it. Enter on the focused status item opens it. A normal status click creates neither a docked Panel view nor an editor tab.

The header shows **Kira Formatting Controls** with a 12.2px three-slider Settings icon inside a fixed 26px by 24px box. Version details remain in the Extensions listing. The app icon appears in that listing; the card has no app logo. The package ID remains `rajudhami.formatting-controls`.

![Anchored formatting controls](assets/status-card-dark.png)

## Read-only formatting summary

Both information icons share the same 12px vector shape. The file-context icon is blue, the formatting icon is gray, and each is vertically centered. The formatting icon sits approximately 8px from its label.

- The file/workspace box identifies the editor whose effective settings are shown. Multi-root workspaces also name its folder.
- **Write to** and **Apply to language** identify the selected destination, rather than changing the file's language mode. Use the dashboard or optional Quick Controls command to change them.
- **Automatic formatting** is always visible. Its fixed-width badge reports **Enabled** when all three triggers are enabled, **Disabled** when none are enabled, or **Mixed** when they differ. A pause record does not replace this truthful effective-state label.
- Checkboxes show effective Save/Paste/Type settings without redundant Enabled/Disabled text. Source notes distinguish saved values, inherited settings and defaults. Checkbox and dropdown displays are read-only and open no picker.
- The default formatter is shown below the three settings.
- The footer provides **Open dashboard ↗** and **Report an issue ↗**. Issue reporting opens [this repository's new-issue form](https://github.com/kira-explore/formatting-controls/issues/new); it does not submit an issue or upload diagnostics automatically.

The complete file box and Automatic formatting summary row have stable explanatory hover text. They are information-only artwork rather than command links, so clicking them does not open a notification behind the pinned card. Dynamic values remain in the card rather than changing the help text. Settings retains a descriptive hover title. The permanently underlined footer links identify their destinations on hover. Pause/Resume has no redundant hover title because its caption is already visible. Long visible labels are shortened while full values remain in image alternatives.

## Manual Pause/Resume

At a workspace/folder destination, **Pause** previews disabling only Save/Paste/Type. Its caption is **Pause automatic formatting until you resume.**

After confirmation and successful application, the button becomes **Resume**, with **Restore your previous formatting settings.** Only the 66px by 28px button is linked; clicking its caption does nothing. Resume restores unchanged pre-pause preferences while preserving newer edits; it does not enable every trigger automatically. After successful restoration the button and caption return to Pause. Both states reserve identical dimensions. Cancellation retains the prior state.

The existing native JSON preview, confirmation and durable recovery workflow are unchanged. Save actions and the formatter selection remain unchanged. No timer or automatic resumption is introduced.

## Rendering and compatibility

Read-only dropdowns use standard outlined fields with normal text and arrows. Checkboxes use neutral outlines and ticks rather than a disabled gray fill. Footer links have text-sized hit areas with approximately 4–5px padding. The gap between them is unlinked artwork, so it neither shows an action cursor nor opens the dashboard. Separate image alignment preserves the footer's vertical spacing.

VS Code's public `StatusBarItem.tooltip` accepts Markdown, images and command links; arbitrary form styling is sanitized. Locally generated inert SVG images preserve the approved layout, with native links for navigation and help. No scripts, external images, rendering network calls or rendering files are used.

The 400px content width follows the approved reference. The title and section heading use 13px regular text and body/control text 12px. Read-only fields have 28px outlines and the fixed status badge has a 22px outline. Setting rows use a 46px rhythm with 10px between each checkbox and its text. Checked boxes show an outlined tick; unchecked boxes retain the same neutral surface. High-contrast themes retain distinct ticks and outlines. The file/workspace block and context info icon are vertically centered, with a 14px gap between the icon and text. The formatting heading, info glyph and fixed-width status badge share one hover-only image. The badge explanation remains discoverable through the visible info icon. The filled Pause/Resume button retains fixed dimensions across both states. Underlined footer artwork shares the same content width and aligns to the card edges independently of VS Code's native table-column sizing.

Transparent artwork reveals the native hover surface. Dark, light, high-contrast and high-contrast-light palettes follow the theme kind; arbitrary custom theme colors/fonts are not available inside the image renderer. Native links follow the editor's own hover/focus styling. The public Markdown tooltip cannot reproduce Copilot's custom grey icon-button hover fill or enforce a custom hover underline. This limitation does not change layout or actions.

VS Code controls the outer frame, pointer and hover delay. Its Markdown sanitizer does not allow `cursor: help` or `cursor: not-allowed`; information and read-only images keep the host's normal cursor, while command links use its action cursor. Tooltips and muted checkbox styling distinguish information and read-only values without introducing false click actions. Explicit image dimensions reserve space while images load. Click-to-focus uses the built-in `workbench.action.showHover` command, checked on minimum and current editor versions; this is a compatibility dependency rather than a dedicated public status-item pinning API.

Sources: [StatusBarItem](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem), [Markdown input handling](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/base/browser/markdownRenderer.ts).

## Safety

Pause command links carry a revision. Changes to settings/editor context invalidate stale actions; equivalent notifications retain the active tooltip/revision. Setting workflows are serialized. XML/HTML text is escaped, command URIs are allowlisted and the issue URL is fixed.

The separate dashboard retains its validated message protocol and nonce-based content security policy. **Formatting Controls: Quick Controls** keeps its formatting-only native picker; **Native Quick Controls** keeps the full settings picker. No command opens a docked Formatting Controls view.

## Archived experiment

The earlier internal-component experiment remains in [the merged prototype revision](https://github.com/kira-explore/formatting-controls/tree/eb908c364d3e6c954ed2c3edb0b426e9b2baee88/prototype/vscode). It required a custom editor and is not part of the shipping extension. The extension has no core handshake, prototype commands or custom-editor dependency.
