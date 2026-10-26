# Formatting status card

Hover and click use the same native Markdown card above the status-bar item. Clicking runs VS Code's built-in `workbench.action.showHover` command, which focuses and keeps the item's hover open. Escape dismisses it; Enter or Space on the focused status item opens it. Clicking does not create an editor tab. The previous Quick Controls webview has been removed.

The card contains the active file and language, formatting status, explicit write scope/language choices, Save/Paste/Type toggles, configured formatter, and dashboard/settings links. Save actions and pause/recovery controls remain in the full dashboard.

![Native formatting card above the status bar](assets/status-card-dark.png)

## Editing

The default write target follows the active file's folder, otherwise Workspace, or User without a workspace. Choosing a scope keeps that target within the window; Folder follows the active editor's folder. Unavailable targets fall back to the visibly labelled User scope. Language defaults to All languages and can be restricted to the active editor's language using the native picker.

A row shows its selected scope's owned value when present, otherwise the effective inherited value. Clicking the row's On/Off link toggles that value at the displayed scope. An `effective On/Off` note identifies a higher-priority override that differs from the owned value. The header and status item summarize effective formatting for the active language regardless of the write scope.

Links carry the current revision and accept only the three formatting flags or scope/language choices. Configuration, editor, folder and window-focus changes invalidate earlier links. Pending controls cannot overlap. File names, languages, folder names and formatter labels are escaped; HTML is disabled and only the two extension control/navigation commands and the built-in Settings navigation command are trusted. Hovering does not write settings or run a formatter. Reopen the card after a picker or edit if VS Code dismisses it.

## Native appearance and timing

This is VS Code's native Markdown hover, not the custom HTML card from the earlier mockup. The extension API does not provide an anchored webview or custom form controls inside a status hover. Native theme styling, dimensions and pointer behavior apply equally on hover and click. Scope/language links open native pickers rather than inline dropdowns.

Mouse hover follows VS Code's `workbench.hover.delay` preference. There is no per-item delay property in `StatusBarItem`, so the extension cannot make only this hover instantaneous. It does not alter the user's global hover preference. Clicking opens the card immediately. The implementation uses the registered workbench hover command, not the internal object-only status tooltip sentinels or injected workbench DOM. This behavior is regression-tested on the minimum supported host and stable host; built-in command behavior remains a compatibility dependency.

## Commands and verification

- Formatting Controls: Quick Controls opens formatting-only native toggles and scope/language pickers from the Command Palette or dashboard.
- Formatting Controls: Native Quick Controls retains the original settings picker workflow and command ID `formattingControls.open`.
- Formatting Controls: Open Dashboard contains save actions, formatter management, profiles and pause/recovery.

After building, run `bun run test/run-integration.ts --status-ui` for the actual native hover/click test and `bun run test:ui` for the full dashboard. The status test verifies a cold click with editor focus, identical hover/click bounds and content, pinning after moving the pointer away, Escape/Enter, real scoped writes, scope/language pickers, no new tabs and a focused automated accessibility scan. CI runs the status test across the three existing themes. Backend tests cover stale/invalid links, owned-versus-effective values, save-action preservation and empty-window User scope. Automated checks do not replace the outstanding screen-reader review.
