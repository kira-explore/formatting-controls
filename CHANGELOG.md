# Changelog

## 0.6.0 — Unreleased

- Put multi-project folder context on a separate line and show compact active-file language labels such as JS, TS, JSX, TSX, JSON and JSONC.

- Show the effective formatting status in the active-file box and place Pause/Resume beside Automatic formatting. Resume uses a subtle blue highlight; both actions retain their explanatory tooltips.

- Move the formatter directly below language and above Automatic formatting in the status card, keeping compact spacing. Use Scope, Language and Formatter labels.

- Retry a cancelled settings save up to three times, only while the document still contains the extension's single owned edit. Pre-existing and intervening edits remain protected.
- Refresh VS Code's configuration cache after completing an owned save, so Pause/Resume does not rely solely on file-watcher delivery. Save-participant formatting can complete without authorizing another write.
- Add an opt-in matrix of 1,024 saved-edit sequences covering every starting, intermediate and final Save/Paste/Type combination in paused and resumed states, including edits changed back before Resume and the next fresh cycle.
- Keep generated reports and installers out of the source history and packaged extension.

Pause/Resume still compares final saved values, not edit history. A setting that ends at the same false value Pause wrote restores its pre-pause preference. Save actions, Auto Save and formatter selection are unchanged.

## 0.5.0 — 2026-11-02

- Finish a successful Pause/Resume cycle after preserving manual edits, including inherited-to-explicit changes and conflict records from older builds. The next Pause captures current preferences instead of repeatedly resuming an old record. Failed or unsaved operations still retain recovery. Added all eight true/false combinations, saved edits before/during pause and fresh-cycle regression checks.

- Confirm settings persistence and configuration-cache refresh before completing Pause/Resume writes. If VS Code returns with a cancelled save, finish only the one versioned edit from that request; pre-existing and intervening edits remain protected. Keep recovery while a dirty buffer could contain an incomplete write. Added single-folder all-enabled stress tests and interrupted-resume coverage.

- Wait up to one second for an existing settings save before Pause/Resume or another settings write checks for unsaved edits. Genuine unsaved changes still block writes; the extension never saves or discards them automatically. Added delayed-save and repeated-toggle regression checks.

- Routed Pause/Resume through a native picker and Command Palette command. The card closes before settings change; cancellation preserves preferences and no live Pausing/Resuming redraw is used. Durable recovery and dashboard confirmations remain.
- Set card typography to 13.5px headings and 12.5px body text, with proportionally smaller settings/info glyphs, checkboxes and arrows. Pause/Resume uses a fixed-size button with a subtle gray fill.
- Detect unsaved destination settings before Pause/Resume starts, preserving edits and recovery data. An Open settings file warning helps users save the document and retry; unrelated dirty files do not block changes.
- Styled Open dashboard and Report an issue as transparent blue borderless buttons with compact hit areas, no underline and a hand cursor across each complete button.
- Kept a padded title-and-Settings header and narrower 380px card content. Pause/Resume sits beneath the three checkboxes, before Default formatter, with a visible explanation and balanced vertical spacing. Its neutral gray 66px by 28px button restores the earlier size; the explanation and padding are not clickable.
- Made both information rows hover-only images with no command links or link focus outlines. Clarified the two-line file help and the numbered Enabled/Disabled/Mixed explanations, and optically aligned the formatting info icon with its heading.
- Added the regular-VS-Code status card: hover and click share one anchored card, click pins it, and Escape dismisses it.
- Show effective formatting, scope, language, formatter and saved/inherited sources through read-only checkbox/dropdown artwork. Formatting remains visible with plain, right-aligned Enabled/Disabled/Mixed text that reserves fixed space and explanatory help.
- Added formatting-only Pause/Resume with durable recovery that preserves save actions and later edits.
- Refined typography, spacing, centered alignment, boxed Settings navigation and compact footer action targets.
- Renamed the display name to Kira Formatting Controls and added the blue/white icon on black; the extension ID remains `rajudhami.formatting-controls`.
- Prevented simultaneous-window profile loss with coordinated storage, stale-operation checks, migration and live refresh.
- Added Remote SSH scope, import/export and reconnect/recovery coverage, plus two-window and status-card UI regression checks.
- Updated Node type declarations to ^26.6.5 and packaging tooling to vsce 4.1.0. Applied a tested minimatch 11.0.3 override; dependency audits remain strict.
- Consolidated documentation around the shipped UI, current validation and recovery behavior; removed obsolete phase reports and the superseded SVG logo.

## 0.4.0 — 2026-11-02

Resolved the packaging MSAL advisory with a scoped, compatibility-tested override to 7.1.1. Removed the audit exception so PR and release checks require no vulnerabilities.

Final VSIX validation now runs after the prepublish build and checks archived contents, installer/package identity and bundle sizes. Release preparation rejects existing version tags pointing to another commit.

Added cross-platform/minimum-host CI, automated dashboard accessibility and security checks, warm snapshot CPU profiles and size budgets, verified VSIX contents/checksums, Marketplace icon/metadata, support/security documentation, and a manual release-draft workflow gated by strict dependency audit. Improved initial focus, keyboard skip navigation, control names, code contrast and narrow layouts.

## 0.3.0 — 2026-11-02

Hardened restore previews against intervening edits, preserved legacy action lists while restoring unrelated settings, and rechecked values after journal persistence before writing.

Added provider adapters and setting evidence, Diagnostics with confidence levels, Language Rules, named profiles and presets, native JSON import/export, preview/apply with a persistent per-action recovery journal, and workspace/folder pause with conflict-aware resume. Added a Restore Previous Settings command, rollback/recovery tests, and documentation of non-atomic settings limitations.

## 0.2.0 — 2026-11-02

Fixed dashboard recovery after invalid input, stale navigation updates, scope persistence across webview reloads, and folder context labels. Added removed-folder and language-mode regression coverage and aligned native input validation with dashboard limits.

React dashboard with Overview, Formatting, Code Actions, Formatters, and Getting Started pages. Includes explicit folder/language selection, effective values and scope inspection, typed controls, validated revision-aware messaging, theme tokens, responsive layouts, first-run welcome, and real-editor bridge tests. Refreshed README, screenshots, badges, and GitHub About metadata.

## 0.1.0 — 2026-11-02

Initial native control slice: explicit scopes, language overrides, effective status, source-action editing, inspection and confirmed single-setting reset.

Hardened cancellation feedback and stale reset previews, with multi-root isolation and inherited source-action preservation integration coverage.
