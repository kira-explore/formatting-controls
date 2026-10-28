# Formatting status card

Hover and click open the same native card above the Formatting status-bar item. Clicking focuses and keeps it open; moving the pointer away does not dismiss the pinned card. Escape dismisses it. Enter on the focused status item opens it. A normal status click creates neither a docked Panel view nor an editor tab.

The extension listing is **Kira Formatting Controls**. The card and dashboard use the shorter **Formatting Controls** title. The refined app icon appears in the Extensions listing; the status item and card have no app icon. The package ID remains `rajudhami.formatting-controls`.

![Anchored formatting controls](assets/status-card-dark.png)

## Quick actions

- Click an On/Off value to change Save, Paste or Type formatting at the displayed destination.
- Click the write destination or language rule to choose it with a native QuickPick.
- Expand/collapse **Automatic formatting** without leaving the card.
- Use **Pause** at a workspace/folder destination to preview disabling only Save/Paste/Type. Save actions and the formatter selection remain unchanged. **Resume** restores unchanged values while preserving newer edits. The existing native JSON preview and confirmation are shown before applying or restoring preferences.
- Open the existing dashboard for full controls, formatter selection, save actions, language rules, profiles and diagnostics, or open native Settings.

The active-file context identifies the editor language and workspace. Multi-root workspaces also name the active folder. **Write to** and **Apply to language** identify the destination being edited, rather than changing the file's language mode. Source labels distinguish saved values, inherited settings and defaults. Source and effective-override notes each reserve a row so a toggle does not move the card; long notes are shortened in the card and remain available in native hover titles. Overrides explain the effective value when it differs from the selected scope. The header reports the effective On/Off/Mixed combination.

## API boundary

These are text and command-link controls, not HTML checkbox/select widgets. VS Code’s public `StatusBarItem.tooltip` API accepts text/Markdown and disables real checkbox inputs. Inline select widgets and Copilot's internal workbench components are unavailable in extension tooltips. Full interactive controls remain in the existing dashboard. No additional docked surface is contributed.

VS Code controls the tooltip's frame, pointer, hover delay and sanitized appearance. Click-to-focus uses the built-in `workbench.action.showHover` command. This is a compatibility dependency checked on the minimum and current editor versions, rather than a dedicated public “pin this status item” API.

Sources: [StatusBarItem](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem), [Markdown input handling](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/base/browser/markdownRenderer.ts).

## Safety and compatibility

Hovering changes no preferences. Command links carry a revision and accept only constrained scope/language, formatting, disclosure and pause actions. Changed settings or editor context invalidate stale links. Equivalent notifications retain the tooltip and revision. Pending operations are serialized, source strings are HTML-escaped, and the tooltip trusts only its control command, dashboard navigation and native Settings navigation. The dashboard retains its validated message protocol and nonce-based content security policy.

**Formatting Controls: Quick Controls** retains the optional formatting-only native picker. **Native Quick Controls** retains the original full settings picker. **Open Dashboard** opens the existing editor dashboard. No command opens a docked Formatting Controls view.

## Archived experiment

The earlier internal-component experiment is preserved in [the merged prototype revision](https://github.com/kira-explore/formatting-controls/tree/eb908c364d3e6c954ed2c3edb0b426e9b2baee88/prototype/vscode). It required a custom editor and is not part of the shipping extension. The current extension has no core handshake, prototype commands or custom-editor dependency.
