# Phase 4 — Production readiness

## Delivered

- Node 24/Bun validation and 40 pure regression tests, including interrupted restoration, failed batch persistence and unsafe profile action maps.
- Real editor integration matrix for Linux stable/1.140.0, macOS stable and Windows stable. Empty-window tests cover activation, all commands, User profile apply/restore, workspace-write rejection and dashboard creation.
- Automated axe-core scans of all eight actual dashboard tabs at wide/narrow layouts in Dark Modern, Light Modern and Default High Contrast. Tests also exercise keyboard Tab navigation, heading focus, reduced motion, CSP restrictions and HTML-like profile names rendered as text. Reports retain rules needing manual assessment; zero automated violations is not complete WCAG conformance.
- Fixed setting-ID contrast, light-theme warning-text contrast, visible/accessibility label mismatches, initial heading focus and small-width layout overflow. Added a keyboard skip link and contextual control names.
- Test-only Node inspector CPU profiles and 40-sample warm dashboard snapshot reports. The p95 budget is 500 ms to catch substantial regressions; host/UI/CSS budgets are 128/384/20 KiB and the archive budget is 2 MiB. These measurements describe the integration fixture, not cold startup or the extension's isolated memory consumption.
- Verified final VSIX archive entries after the packaging hook, excluded sources/tooling/environment files, emitted SHA-256 sidecars and added an authored 256px PNG icon, gallery banner and Marketplace keywords. Authored source remains TypeScript/ESNext; generated VS Code bundles retain their required CommonJS marker.
- Explicit Workspace extension placement, Restricted Mode support for configuration-only operations, and limited virtual-workspace declaration. No project execution or provider server is started by this extension.
- Support, security and conduct documents, release preparation instructions, and a manual main-only GitHub release-draft workflow that reruns the validation matrix and blocks on strict dependency audit. The workflow never publishes to Marketplace or makes a public GitHub release.

## Security and release status

The Phase 4 packaging advisory GHSA-xcx6-jx8p-x3h5 was subsequently resolved using a scoped, compatibility-tested override; see packaging-security.md. Both PR and release validation now require a clean, unfiltered audit. No Marketplace token or publisher-account change was introduced.

Automated preparation is implemented, but public-release approval is still pending hands-on screen-reader, real remote-workspace and concurrent-window reviews. No Marketplace publication, public release or release-workflow dispatch was performed during implementation. These are release gates, not a new feature phase.

## Local evidence

Validated on macOS arm64 with Node 24.22.1, Bun 1.4.4, VS Code 1.140.0 and stable 1.143.1. Forty-sample warm snapshot p95 was approximately 2–3.3 ms in these fixtures. All three themes passed 16 page/layout scans each, plus keyboard, motion, CSP and text-escaping checks. The empty-window suite and verified development packaging also passed. GitHub's matrix results must be checked on the final PR revision.

Official references are linked in [release preparation](releasing.md). Phase 3's non-atomic settings and persistent-pause limits still apply.

Pre-merge review added final archive validation (including installer/package identity, runtime files, archived bundle sizes, PNG and host marker), bounded ZIP inspection, and release-tag target checks for lightweight and annotated tags. SHA-256 is produced only after validation. Existing version tags must resolve to the exact validated workflow revision.
