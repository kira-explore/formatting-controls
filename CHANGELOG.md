# Changelog

## 0.5.0 — Unreleased

Implemented the approved Kira Formatting Controls card: installed version beside its full title, top-right sliders Settings icon, stable explanatory help, fixed-width Enabled/Disabled/Mixed badge beside Automatic formatting, checkbox-only states and readable source notes. Added repository issue reporting beside Open dashboard. Pause/Resume now uses the agreed manual-resume captions with identical geometry. Native links retain the editor's hover/focus styling; custom Copilot icon-button hover fills remain outside the public tooltip API.

Centered the active-file/workspace text block, context info icon and status badge labels. Automatic formatting is always visible; removed the collapse toggle and animation. Checkboxes align with the vertical center of each setting's label and source note. Pause confirmation and restoration behavior is unchanged.

Aligned the read-only status card with Copilot's compact styling: 13px regular-weight title/section heading, 12px body and controls, 22px dropdowns/buttons, smaller checkbox spacing and a narrower card. Matched the supplied reference's muted dark colours and lighter outlines. Transparent artwork now uses the native hover background instead of drawing separate opaque blocks behind image sections.

Matched the approved read-only status card using locally generated SVG artwork: outlined checkbox/dropdown displays, blue file/workspace context box, status badge, separators and typography. Hover and click have identical bounds. Values remain live; checkbox/dropdown displays open no picker. Pause/Resume and dashboard/Settings navigation remain actionable. The optional native Quick Controls command retains scope, language, checkbox and formatter pickers.

Prepared the 0.5.0 release for regular VS Code: removed the custom-editor connection, private commands, prototype sources and build/CI tooling. Hover and click use the same anchored Markdown card; interactive checkbox/dropdown controls remain in the separate dashboard. Source notes reserve space for overrides so formatting changes keep the card in position. Added a polling fallback for missed native profile notifications.

Hover and click now share one anchored Formatting Controls card, with click pinning the card instead of opening a docked view. Added clearer saved/inherited/override labels, active-file/workspace context and an always-visible formatting section. Full interactive controls remain in the existing dashboard; the docked-view draft was removed.

Added formatting-only Pause/Resume with reviewed, durable recovery that preserves save actions and newer edits. Native tooltip actions use command links; the optional Quick Controls command provides native scope/language pickers. Real checkbox/select widgets are not exposed by VS Code's tooltip API. Added cold-click, hover/click placement, pinning, keyboard, no-new-surface and pause-preservation regression coverage.

Renamed the Extensions display name to Kira Formatting Controls, retained the stable package/publisher identity, and replaced the app icon with the approved centered blue/white control symbol on a black background. The status item and card have no app icon.

Added real Remote SSH regression coverage for scopes, host-owned profiles, import/export and persisted pause recovery after client reconnect, plus native UI review notes and remote User-scope guidance. Updated Node type declarations to ^26.6.5 while retaining Node 24 compatibility.

Fixed saved-profile loss between simultaneous windows with coordinated private-file storage, stale overwrite/delete checks, live profile refresh and real two-window regression coverage. Existing profile storage migrates on first successful mutation.

## 0.4.0 — Unreleased

Resolved the packaging MSAL advisory with a scoped, compatibility-tested override to 7.1.1. Removed the audit exception so PR and release checks require no vulnerabilities.

Final VSIX validation now runs after the prepublish build and checks archived contents, installer/package identity and bundle sizes. Release preparation rejects existing version tags pointing to another commit.

Added cross-platform/minimum-host CI, automated dashboard accessibility and security checks, warm snapshot CPU profiles and size budgets, verified VSIX contents/checksums, Marketplace icon/metadata, support/security documentation, and a manual release-draft workflow gated by strict dependency audit. Improved initial focus, keyboard skip navigation, control names, code contrast and narrow layouts.

## 0.3.0 — Unreleased

Hardened restore previews against intervening edits, preserved legacy action lists while restoring unrelated settings, and rechecked values after journal persistence before writing.

Added provider adapters and setting evidence, Diagnostics with confidence levels, Language Rules, named profiles and presets, native JSON import/export, preview/apply with a persistent per-action recovery journal, and workspace/folder pause with conflict-aware resume. Added a Restore Previous Settings command, rollback/recovery tests, and documentation of non-atomic settings limitations.

## 0.2.0 — Unreleased

Fixed dashboard recovery after invalid input, stale navigation updates, scope persistence across webview reloads, and folder context labels. Added removed-folder and language-mode regression coverage and aligned native input validation with dashboard limits.

React dashboard with Overview, Formatting, Code Actions, Formatters, and Getting Started pages. Includes explicit folder/language selection, effective values and scope inspection, typed controls, validated revision-aware messaging, theme tokens, responsive layouts, first-run welcome, and real-editor bridge tests. Refreshed README, screenshots, badges, and GitHub About metadata.

## 0.1.0 — Unreleased

Initial native control slice: explicit scopes, language overrides, effective status, source-action editing, inspection and confirmed single-setting reset. Dashboard and advanced features remain planned.

Hardened cancellation feedback and stale reset previews, with multi-root isolation and inherited source-action preservation integration coverage.
