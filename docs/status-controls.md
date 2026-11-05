# Formatting status card

Hover and click open the same anchored card above the Formatting status-bar item. Click focuses and pins it; Escape dismisses it. Enter on the focused status item opens it. A normal status click creates neither a docked Panel view nor an editor tab.

The padded header shows **Kira Formatting Controls**, Pause/Resume, and a two-slider Settings icon inside a fixed 26px by 24px box. The borderless Enabled/Disabled/Mixed status sits on the right of the file section, vertically centered with its text-document icon. Version details remain in the Extensions listing. The app icon appears in that listing; the card has no app logo. The package ID remains `rajudhami.formatting-controls`.

![Anchored formatting controls](assets/status-card-dark.png)

## Read-only formatting summary

The file section uses a blue text-document icon, enlarged by 5% and vertically centered across its two or three lines. Automatic formatting has no information icon or explanatory tooltip.

- The file/workspace box identifies the editor whose effective settings are shown. Multi-root workspaces also name its folder.
- **Scope** and **Language** identify the selected destination, rather than changing the file's language mode. Use the dashboard or optional Quick Controls command to change them.
- **Automatic formatting** is always visible. The plain, muted status text in the file section reports **Enabled** when all three triggers are enabled, **Disabled** when none are enabled, or **Mixed** when they differ. A pause record does not replace this truthful effective-state label.
- Checkboxes show effective Save/Paste/Type settings without redundant Enabled/Disabled text. Source notes distinguish saved values, inherited settings and defaults. Checkbox and dropdown displays are read-only and open no picker.
- **Formatter** appears directly below Language and above Automatic formatting.
- The footer provides **Open dashboard ↗** and **Report an issue ↗**. Issue reporting opens [this repository's new-issue form](https://github.com/kira-explore/formatting-controls/issues/new); it does not submit an issue or upload diagnostics automatically.

The file box and Automatic formatting heading are passive images with no explanatory tooltip or click action. Long context labels use ellipses; a hover title reveals only the full labels that were shortened. Neither row is a link or a keyboard focus target. Settings retains a descriptive tooltip, and Pause/Resume retains its action explanation. Open dashboard and Report an issue remain transparent blue borderless actions with a native hand cursor and no tooltip. Full values also remain in image alternatives.

## Manual Pause/Resume

At a workspace/folder destination, **Pause** opens a native picker to confirm disabling only Save/Paste/Type. Its tooltip is **Pause automatic formatting until you resume.** The Command Palette command **Formatting Controls: Pause / Resume Automatic Formatting** opens the same flow.

If the destination settings document is briefly dirty because a save is already running, the operation waits up to one second for it to become clean. Clean documents incur no wait. If it stays dirty, the warning still blocks the operation before its restore point changes. The extension does not save pre-existing or intervening user edits.

The card closes before the picker opens, and the status-bar item is immediately restored. Choose the displayed action to continue, or press Escape to cancel without changing settings or recovery data. Repeated requests while the picker or operation is active are ignored. Changes to the editor/settings or restore point while choosing invalidate the pending action.

A fulfilled native settings-update request is not treated as proof of persistence. Each write checks the settings document and then waits for the selected-scope configuration value to match. If the request leaves a dirty buffer, the extension may complete that save only when the document was initially clean, the requested value differs, and exactly one model version was added by the request. An owned cancelled save has at most three attempts; each attempt rechecks the same single model version. A no-op or intervening edit prevents that retry. After completing that cancelled save, the same native update refreshes configuration again, provided no additional model edit occurred; this avoids relying only on file-watcher delivery. A dirty recovery buffer cannot be mistaken for an already-restored disk value.

Settings are updated after confirmation with the hover dismissed. The tooltip is restored after cancellation, completion or error, without automatically reopening it. There is no intermediate Pausing/Resuming artwork or artificial animation delay. Reopening the card shows the completed result in the same layout, avoiding native whole-card fade restarts during an inline toggle.

After successful application, the reopened card shows **Resume**, with the tooltip **Restore your previous formatting settings.** Resume uses the same native picker and restores unchanged pre-pause preferences while preserving newer edits; it does not enable every trigger automatically. After complete restoration the button and tooltip return to Pause.

Durable recovery and rollback remain in place. A failure before settings change retains the original label and configuration; an incomplete operation retains its recovery record. A successful status-card or Command Palette Resume finishes the pause after restoring unchanged values and preserving newer edits. It clears the completed pause record even when newer edits differ from the old snapshot, so the next Pause captures the current preferences. This also finishes a conflict record left by an older version. Dashboard/profile Restore retains its conflict review. Already-disabled formatting still records a durable pause, so Pause/Resume remains a consistent pair. The status card's formatting-only pause leaves save actions and formatter selection unchanged; resuming a pause created in Profiles restores that record's unchanged values. No timer or automatic resumption is introduced.

**Enabled and Resume can appear together.** Enabled describes the active editor’s effective settings; Resume means a saved project pause record is available. Language overrides, a different active folder or later edits can leave formatting enabled. Resume restores only unchanged values from the recorded scope and clears a completed record; it preserves language overrides and newer edits.

Before changing project settings, the extension checks whether the destination settings document has unsaved edits. It stops before preparing or changing the recovery record and shows a warning with **Open settings file**. Save or resolve those edits yourself, then retry. Workspace settings in a multi-root workspace use the workspace file; folder settings use that folder’s `.vscode/settings.json`. Unrelated dirty documents do not block the operation. The extension never saves or discards edits automatically. Each write also rechecks the document; an intervening edit can still interrupt a batch and retain recovery. A blocked Resume keeps its record and Resume label.

Dashboard/profile workflows and the Restore Previous Settings command retain their existing previews and confirmations. Status-card and Command Palette Resume is restricted to project pause records; it cannot silently restore a saved profile.

## Rendering and compatibility

Read-only dropdowns use standard outlined fields with normal text and arrows. Checkboxes use neutral outlines and ticks rather than a disabled gray fill. Footer actions retain transparent, borderless 36px-high image hit areas. Blue labels and external arrows have no underline. Each complete button, including its horizontal padding, is linked and uses the hand cursor. The gap between them is unlinked artwork, so it neither shows an action cursor nor opens the dashboard. Separate image alignment preserves the footer's vertical spacing.

VS Code's public `StatusBarItem.tooltip` accepts Markdown, images and command links; arbitrary form styling is sanitized. Locally generated inert SVG images preserve the approved layout, with native links for actions and hover-only titles for action help or shortened labels. No scripts, external images, rendering network calls or rendering files are used.

The content width stays at 330px (approximately 354px including the native hover frame and insets). Each file, workspace and folder label stays on its own line; long names use an ellipsis rather than widening or wrapping the card. The title and section heading use 13.5px regular text and body/control text 12.5px. The status has a fixed right-hand column with no border or background, vertically centered with the text-document icon across two or three lines. Conservative font-width allowances keep labels clear of that column, including wide letters and emoji. The Scope, Language and Formatter rows retain 28px outlined fields. Formatting rows retain the 46px rhythm and neutral outlined checkboxes. Automatic formatting has no information icon or duplicate status. Pause/Resume stays in the header, with identical 66px by 24px dimensions and the Settings button’s height. Pause is neutral gray; Resume has a soft blue background with the same foreground text. Both keep their native picker flow and tooltip. The footer retains separate 139px and 133px borderless hit areas, separated by an unlinked 58px gutter.

Transparent artwork reveals the native hover surface. Dark, light, high-contrast and high-contrast-light palettes follow the theme kind; arbitrary custom theme colors/fonts are not available inside the image renderer. Native links follow the editor's own hover/focus styling. The public Markdown tooltip cannot reproduce Copilot's custom grey icon-button hover fill or enforce a custom hover underline. This limitation does not change layout or actions.

VS Code controls the outer frame, pointer and hover delay. Its Markdown sanitizer does not allow custom cursor CSS; read-only checkbox/dropdown images keep the host's normal cursor. Settings, Pause/Resume and footer actions use the native hand cursor. The context and formatting images retain the host’s normal image cursor because they are not clickable links. Explicit image dimensions reserve space while images load. Click-to-focus uses the built-in `workbench.action.showHover` command, checked on minimum and current editor versions; this is a compatibility dependency rather than a dedicated public status-item pinning API.

Sources: [StatusBarItem](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem), [Markdown input handling](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/base/browser/markdownRenderer.ts).

## Safety

Pause command links carry a revision. Changes to settings/editor context invalidate stale actions; equivalent notifications retain the active tooltip/revision. Setting workflows are serialized. XML/HTML text is escaped, command URIs are allowlisted and the issue URL is fixed.

The separate dashboard retains its validated message protocol and nonce-based content security policy. **Formatting Controls: Quick Controls** keeps its formatting-only native picker; **Native Quick Controls** keeps the full settings picker. No command opens a docked Formatting Controls view.
