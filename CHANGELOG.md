# Changelog

## Unreleased

Added a formatting-only status card: hovering and clicking show the same native card above the status bar, and clicking keeps it focused without opening an editor tab. Save/Paste/Type toggles have explicit scope/language choices and stale-state protection. Save actions, pause/recovery and advanced controls remain in the dashboard. Quick Controls uses native formatting pickers; Native Quick Controls retains the original settings workflow.

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
