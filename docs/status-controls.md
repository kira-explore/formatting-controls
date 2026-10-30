# Formatting status card

Hover and click open the same native card above the Formatting status-bar item. Clicking focuses and keeps it open; moving the pointer away does not dismiss the pinned card. Escape dismisses it. Enter on the focused status item opens it. A normal status click creates neither a docked Panel view nor an editor tab.

The extension listing is **Kira Formatting Controls**. The card and dashboard use the shorter **Formatting Controls** title. The refined app icon appears in the Extensions listing; the status item and card have no app icon. The package ID remains `rajudhami.formatting-controls`.

![Anchored formatting controls](assets/status-card-dark.png)

## Quick actions

- Read the outlined checkboxes and On/Off values as effective formatting for the active editor. These are read-only visual displays.
- Read the dropdown-shaped scope, language and formatter fields as current values. Clicking them does nothing and opens no picker.
- Expand/collapse **Automatic formatting** without leaving the card.
- Use **Pause** at a workspace/folder destination to preview disabling only Save/Paste/Type. Save actions and the formatter selection remain unchanged. **Resume** restores unchanged values while preserving newer edits. The existing native JSON preview and confirmation are shown before applying or restoring preferences.
- Open the existing dashboard for full controls, formatter selection, save actions, language rules, profiles and diagnostics, or open native Settings.

The blue context box identifies the editor language and workspace. Multi-root workspaces also name the active folder. **Write to** and **Apply to language** identify the selected destination, rather than changing the file's language mode. The optional Quick Controls command can change that destination. Source labels distinguish saved values, inherited settings and defaults. Long visible labels are shortened, while full descriptions are retained in image alternatives for assistive technology. The header reports the effective On/Off/Mixed combination, or Paused during a recorded formatting pause.

## API boundary

VS Code’s public `StatusBarItem.tooltip` API accepts Markdown, images and command links; arbitrary form styling is sanitized. The approved visual design is rendered as inert SVG images embedded as data URIs in that tooltip. All values come from the live configuration snapshot. There are no scripts, external images, network calls or files written for rendering. The context box, checkboxes, dropdowns, badge, separators and typography are drawn locally. Checkbox and dropdown images have no command link; only disclosure and footer images are wrapped in allowlisted links.

This is a read-only illustration of controls, not native form widgets. Full editable controls remain in the dashboard and optional Quick Controls command. Typography and sizing follow the compact Copilot card: 13px regular-weight title/disclosure, 12px body/control text, 22px dropdowns/buttons and compact checkbox gaps. Transparent image backgrounds allow VS Code's native hover surface to show through. Dark, light, high-contrast and high-contrast-light foreground/control palettes follow VS Code's theme kind; custom theme colors and font choices cannot be read through this public API and therefore do not reproduce every custom theme exactly. Each image has descriptive alternative text with its full values. No additional docked surface is contributed.

VS Code controls the tooltip's outer frame, pointer and hover delay. Explicit image dimensions reserve the same layout before and after images load. Click-to-focus uses the built-in `workbench.action.showHover` command. This is a compatibility dependency checked on the minimum and current editor versions, rather than a dedicated public “pin this status item” API.

Sources: [StatusBarItem](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem), [Markdown input handling](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/base/browser/markdownRenderer.ts).

## Safety and compatibility

Hovering or clicking read-only fields changes no preferences. Command links carry a revision; the card exposes only disclosure and pause actions plus dashboard and Settings navigation. Changed settings or editor context invalidate stale links. Equivalent notifications retain the tooltip and revision. Pending operations are serialized, and dynamic strings are XML/HTML-escaped. The dashboard retains its validated message protocol and nonce-based content security policy.

**Formatting Controls: Quick Controls** retains the optional formatting-only native picker. **Native Quick Controls** retains the original full settings picker. **Open Dashboard** opens the existing editor dashboard. No command opens a docked Formatting Controls view.

## Archived experiment

The earlier internal-component experiment is preserved in [the merged prototype revision](https://github.com/kira-explore/formatting-controls/tree/eb908c364d3e6c954ed2c3edb0b426e9b2baee88/prototype/vscode). It required a custom editor and is not part of the shipping extension. The current extension has no core handshake, prototype commands or custom-editor dependency.
