# Formatting status card

Hover and click open the same anchored card above the Formatting status-bar item. Click focuses and pins it; Escape dismisses it. Enter on the focused status item opens it. A normal status click creates neither a docked Panel view nor an editor tab.

The header shows **Kira Formatting Controls** with a compact 16px Settings/sliders icon. Version details remain in the Extensions listing. The app icon appears in that listing; the card has no app logo. The package ID remains `rajudhami.formatting-controls`.

![Anchored formatting controls](assets/status-card-dark.png)

## Read-only formatting summary

- The file/workspace box identifies the editor whose effective settings are shown. Multi-root workspaces also name its folder.
- **Write to** and **Apply to language** identify the selected destination, rather than changing the file's language mode. Use the dashboard or optional Quick Controls command to change them.
- **Automatic formatting** is always visible. Its fixed-width badge reports **Enabled** when all three triggers are enabled, **Disabled** when none are enabled, or **Mixed** when they differ. A pause record does not replace this truthful effective-state label.
- Checkboxes show effective Save/Paste/Type settings without redundant Enabled/Disabled text. Source notes distinguish saved values, inherited settings and defaults. Checkbox and dropdown displays are read-only and open no picker.
- The default formatter is shown below the three settings.
- The footer provides **Open dashboard ↗** and **Report an issue ↗**. Issue reporting opens [this repository's new-issue form](https://github.com/kira-explore/formatting-controls/issues/new); it does not submit an issue or upload diagnostics automatically.

The file box and formatting info icon have stable explanatory hover text. Clicking either opens the same explanation in a native information message. Dynamic values remain in the card rather than changing the help text. Settings retains a descriptive hover title. Pause/Resume and footer links have no redundant hover titles; their accessible names remain available. Long visible labels are shortened while full values remain in image alternatives.

## Manual Pause/Resume

At a workspace/folder destination, **Pause** previews disabling only Save/Paste/Type. Its caption is **Pause automatic formatting until you resume.**

After confirmation and successful application, the button becomes **Resume**, with **Restore your previous formatting settings.** Only the 58px by 22px button is linked; clicking its caption does nothing. Resume restores unchanged pre-pause preferences while preserving newer edits; it does not enable every trigger automatically. After successful restoration the button and caption return to Pause. Both states reserve identical dimensions. Cancellation retains the prior state.

The existing native JSON preview, confirmation and durable recovery workflow are unchanged. Save actions and the formatter selection remain unchanged. No timer or automatic resumption is introduced.

## Rendering and compatibility

VS Code's public `StatusBarItem.tooltip` accepts Markdown, images and command links; arbitrary form styling is sanitized. Locally generated inert SVG images preserve the approved layout, with native links for navigation and help. No scripts, external images, rendering network calls or rendering files are used.

The title and section heading use 13px regular text and body/control text 12px. Read-only fields and the status badge have 22px outlines. Setting rows use a compact 38px rhythm. Checkbox and button labels are centered; the file/workspace block and enlarged 12px context info icon are vertically centered. The status badge and Pause/Resume button retain fixed dimensions across all states.

Transparent artwork reveals the native hover surface. Dark, light, high-contrast and high-contrast-light palettes follow the theme kind; arbitrary custom theme colors/fonts are not available inside the image renderer. Native links follow the editor's own hover/focus styling. The public Markdown tooltip cannot reproduce Copilot's custom grey icon-button hover fill or enforce a custom hover underline. This limitation does not change layout or actions.

VS Code controls the outer frame, pointer and hover delay. Explicit image dimensions reserve space while images load. Click-to-focus uses the built-in `workbench.action.showHover` command, checked on minimum and current editor versions; this is a compatibility dependency rather than a dedicated public status-item pinning API.

Sources: [StatusBarItem](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem), [Markdown input handling](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/base/browser/markdownRenderer.ts).

## Safety

Pause command links carry a revision. Changes to settings/editor context invalidate stale actions; equivalent notifications retain the active tooltip/revision. Setting workflows are serialized. Help accepts only the two known topics. XML/HTML text is escaped, command URIs are allowlisted and the issue URL is fixed.

The separate dashboard retains its validated message protocol and nonce-based content security policy. **Formatting Controls: Quick Controls** keeps its formatting-only native picker; **Native Quick Controls** keeps the full settings picker. No command opens a docked Formatting Controls view.

## Archived experiment

The earlier internal-component experiment remains in [the merged prototype revision](https://github.com/kira-explore/formatting-controls/tree/eb908c364d3e6c954ed2c3edb0b426e9b2baee88/prototype/vscode). It required a custom editor and is not part of the shipping extension. The extension has no core handshake, prototype commands or custom-editor dependency.
