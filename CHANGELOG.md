# Changelog

## 0.5.0 — Unreleased

- Added the regular-VS-Code status card: hover and click share one anchored card, click pins it, and Escape dismisses it.
- Show effective formatting, scope, language, formatter and saved/inherited sources through read-only checkbox/dropdown artwork. Formatting remains visible with a fixed Enabled/Disabled/Mixed badge and explanatory help.
- Added formatting-only Pause/Resume with preview, confirmation and durable recovery that preserves save actions and later edits.
- Refined typography, spacing, centered alignment, boxed Settings navigation and underlined Dashboard/Report an issue links with compact click targets.
- Renamed the display name to Kira Formatting Controls and added the blue/white icon on black; the extension ID remains `rajudhami.formatting-controls`.
- Prevented simultaneous-window profile loss with coordinated storage, stale-operation checks, migration and live refresh.
- Added Remote SSH scope, import/export and reconnect/recovery coverage, plus two-window and status-card UI regression checks.
- Updated Node type declarations to ^26.6.5 and packaging tooling to vsce 4.1.0. Applied a tested minimatch 11.0.3 override; dependency audits remain strict.
- Consolidated documentation around the shipped UI, current validation and recovery behavior; removed obsolete phase reports and the superseded SVG logo.

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

Initial native control slice: explicit scopes, language overrides, effective status, source-action editing, inspection and confirmed single-setting reset.

Hardened cancellation feedback and stale reset previews, with multi-root isolation and inherited source-action preservation integration coverage.
