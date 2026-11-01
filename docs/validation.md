# Validation

This guide describes the current regular-VS-Code extension and its repeatable checks. Earlier phase reports and custom-editor experiments are available in Git history. They are not evidence for the current artifact. Check CI on the exact revision being reviewed or released.

## Local checks

Use Node 24 LTS and the Bun version declared in `package.json#packageManager`:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run security:check
bun run package
```

The unit suite covers scope/action logic, schema rejection, protocol boundaries, source attribution, diagnostic confidence, profile concurrency, journal persistence, rollback/conflict handling, status artwork, dependency compatibility and release validation. Packaging reopens the final VSIX after the build hook, checks identity/contents/budgets and writes a SHA-256 sidecar only after success.

## Real-editor checks

```sh
bun run test:integration
bun run test/run-integration.ts --empty
bun run test:multi-window
bun run test:ui
bun run test/run-integration.ts --status-ui
bun run test:remote
```

These runners use isolated profiles and temporary workspaces rather than maintainer settings. On Linux without a display, prefix each editor invocation with `xvfb-run -a`. Remote checks also require Docker and OpenSSH; see [Remote SSH setup](remote-workspace.md).

Set `VSCODE_VERSION=1.140.0` for the minimum host or `stable` for the current host. Set `FORMATTING_CONTROLS_UI_THEME` to `Dark Modern`, `Light Modern` or `Default High Contrast` for UI checks. Run one UI review at a time on debug port 9333. Reports, screenshots and CPU profiles are written to ignored `test-results/`; review private paths before sharing them.

| Suite        | Coverage                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integration  | Activation, commands, real configuration precedence, folder/language isolation, stale edits, source-action preservation, profile import/export and recovery              |
| Empty window | Activation and dashboard creation without folders, User workflows and rejected project writes                                                                            |
| Two windows  | Shared settings, simultaneous/stale profile mutations, overlapping pause and preserving another window's edits                                                           |
| Dashboard UI | All eight pages at wide/narrow sizes, axe scans, keyboard focus, reduced motion, CSP and text escaping                                                                   |
| Status UI    | Loaded artwork, identical hover/click content and bounds, pinning, keyboard/Escape, read-only fields, help text, formatting-only pause and separate dashboard navigation |
| Remote SSH   | Linux-host scopes/storage/file round trips, persisted pause and recovery after client reconnect                                                                          |

CI runs the editor suite on Linux minimum/stable, macOS stable and Windows stable. Dashboard/status UI jobs run in three themes; the Remote SSH job runs on Linux stable. Local status-card checks have also been performed on VS Code 1.144.0. Detailed remote and concurrent-window evidence and limits live in [remote-workspace.md](remote-workspace.md) and [multi-window.md](multi-window.md).

## Budgets and interpretation

Warm dashboard snapshots use 40 samples with a p95 budget of 500 ms. Archived host/UI/CSS budgets are 128/384/20 KiB; the VSIX archive budget is 2 MiB. These fixture measurements detect large regressions; they do not measure cold startup, provider execution or isolated extension memory consumption.

Zero automated axe violations does not establish complete WCAG conformance. Image alternatives describe status values, but hands-on screen-reader review of the current card, native pickers and dashboard remains a release task. Verify theme contrast, keyboard order, long labels, zoom and narrow layouts in a clean editor before publishing.

## Compatibility limits

- Settings writes and conditional restoration are not atomic. Controlled concurrency tests cannot cover every external-edit schedule.
- Installed formatter metadata does not prove that its server is enabled or eligible for the file. Tests do not guarantee formatting execution or save-action order.
- Remote SSH was reviewed across a macOS-to-Linux boundary. WSL, Dev Containers connections and other remote hosts remain untested.
- Markdown controls are read-only artwork. VS Code owns the hover frame, delay and cursors; CSS help/disabled cursors, live inline form controls and custom hover animation are unavailable through this surface.
- Strict dependency audit and verified packaging must pass on each release candidate. Current workarounds and removal conditions are in [packaging security](packaging-security.md).

See [release preparation](releasing.md) for the final manual review and publication process.
