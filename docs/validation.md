# Validation — 25 October 2026

Passed strict type checking, Biome and four Node unit tests covering status states, immutable source-action merging, rejection of legacy arrays/malformed IDs and action enabled values. Passed isolated VS Code 1.143.1 extension-host assertions for activation, command registration, User/Workspace precedence, TypeScript language overrides, preservation of unrelated source actions resetting an override, two-folder isolation, preserving inherited action entries without copying them into folder settings, and rejecting stale reset previews for boolean and object values. Successfully packaged a development VSIX.

The native picker flow has not had a complete manual keyboard/screen-reader accessibility review. Combined-language blocks, remote workspaces and the minimum 1.140 host need additional integration coverage. Current integration validation used macOS arm64. No provider execution or save ordering is asserted.

Bun audit reports one high finding through development packaging dependencies @vscode/vsce → @azure/identity → @azure/msal-node (GHSA-xcx6-jx8p-x3h5). The latest stable vsce 4.0.0 resolves Azure Identity 4.14.0, which requires MSAL ^6.0.0. The patched MSAL release is >=7.1.0, outside that supported range; no compatible stable upgrade was available during this review. No cross-major override was introduced. No runtime dependencies are shipped; resolve this finding before public release. See [the upstream advisory](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5). The project is MIT licensed. No Marketplace publishing or credentials were configured during Phase 1; the later sections record delivered dashboard and workflow features.

Toolchain revalidated with Node 24.22.1, Bun 1.4.4, TypeScript 7.0.2 (ESNext) and Biome 2.6.3. ESLint and its configuration/dependencies were removed. Bun owns the committed lockfile; CI uses frozen installation, the latest Node 24 LTS patch and the Bun version declared in packageManager.

Code-action value cancellation now returns before the success notification. Reset captures the displayed value and rechecks it immediately before writing; VS Code does not provide an atomic compare-and-delete API for settings. External changes after that final check remain a configuration API limitation. GitHub-hosted checks were blocked during Phase 1 by an account billing/spending-limit restriction; that restriction was subsequently resolved.


## Phase 2

Host and dashboard type checks, Biome, and nine pure unit tests pass. Protocol regression coverage rejects unsupported commands/settings, malformed scopes/revisions, oversized messages, invalid enums, formatter IDs and numeric values. Extended isolated VS Code 1.143.1 tests cover dashboard folder/language writes, stale revision rejection, folder URI allowlisting, source-action preservation, language-scope restrictions, command registration and real WebviewPanel creation.

Interactive verification used a temporary VS Code profile: Workspace format-on-save and source-action changes saved and synchronized, all main pages rendered, and provider availability caveats were visible. User-level writes correctly remained overridden by the fixture's Workspace setting. Desktop rendering was inspected in dark and light themes; high-contrast and narrow layouts were captured from the built-in high-contrast theme, and switch keyboard focus was checked. Full screen-reader testing remains outstanding. The light-theme review caught and corrected switch-track specificity so the enabled thumb remains visible.

The production React dashboard bundle is approximately 325 KB uncompressed (83 KB gzip) and loads only when opened. This is a bundle-size check, not an extension-host performance profile. No production runtime dependencies are installed from the network; React is included in the local dashboard assets. The previously documented packaging advisory remains unresolved upstream. Subsequent Phase 2 and badge PRs passed GitHub-hosted validation and CodeQL after the account billing restriction was resolved.


### Phase 2 recheck

Fixed response correlation for rejected input (which could leave controls disabled), out-of-order configuration/navigation snapshots, scope loss when a webview reloads, and resource captions that could identify a different folder from the settings being displayed. The host now restores a valid scope if a selected folder disappears while the panel is closed, and drops queued messages from disposed panels. Native formatter-ID and delay validation uses the same boundaries as the dashboard.

Nine unit tests and the extended isolated editor suite pass. Additional regressions cover error correlation, stale navigation, scope-preserving readiness, removed-folder recovery, correct resource captions and language-mode changes. An interactive test submitted an invalid action and then a valid action in the real dashboard, confirming that the error re-enabled controls and the next action saved normally. Language-mode changes already refreshed correctly; that behavior now has regression coverage.


## Phase 3

Strict host/browser types, Biome, 21 pure tests and isolated VS Code host tests pass. New coverage includes profile schemas, per-action merge plans, durable journals, storage failure before mutation, partial rollback, not reverting unattempted external edits, conflict-aware restoration, provider capability distinctions and diagnostic confidence. Real editor tests cover saved profiles, scoped apply/cancellation, import/export using actual JSON files, rejection of oversized/unsupported imports, pause and service-reload recovery, per-action restoration with external edits, language-rule inspection and corrupt storage isolation.

Pause uses real Workspace/Folder settings, persists until Resume, and can remain overridden by higher-priority preferences. There is no atomic configuration transaction or guaranteed crash-time deactivation hook. These limits and the single most recent restore-point behavior are explicit in the product and design documentation.

Interactive Phase 3 verification in Dark Modern passed saving a scoped profile, native preview cancellation and application, folder pause, editing a preference during pause, conflict-preserving resume, and explicit retention of current values. All eight dashboard tabs have current dark-theme screenshots in the README. The 0.3.0 VSIX packages successfully with local bundled assets. The same development-only packaging advisory remains; no dependencies were added.


### Phase 3 pre-merge recheck

Fixed three recovery edge cases: restore is limited to the entries shown in its confirmed preview; externally edited legacy/unsupported action maps no longer block restoration of unrelated formatting flags; and every application rechecks values after asynchronous journal persistence, excluding writes that never started from rollback. Added real-editor regressions for preview-time edits and legacy action recovery, plus pure regressions for approved-entry restoration and edits during persistence. The suite now has 23 pure tests.


## Phase 4

Added 26-test pure suite, real empty-window coverage, minimum-host and cross-platform CI, three-theme real-dashboard accessibility/security scans, test-only CPU profiles and package content/size/checksum checks. Local VS Code 1.140.0 and 1.143.1 tests pass; all 48 page/layout scans pass with zero automated axe violations. The accessibility report also retains incomplete checks for manual review. Warm snapshot p95 was approximately 2–3.3 ms on the local integration fixtures; this does not measure full cold startup or attribute the host's heap to this extension.

Fixed low-contrast setting IDs, light warning text, accessible-name mismatches, initial focus and small-width layout issues. Manual screen-reader, remote and concurrent-window review remains a release gate. The known packaging advisory is reported during PR validation and blocks strict release preparation. See phase-4.md and releasing.md. No public release or Marketplace publication was performed.


### Phase 4 pre-merge recheck

Added eight regression tests for final VSIX contents, embedded package and installer identity, runtime presence, archived bundle sizes, malformed icons/host markers, and absent/matching/mismatched/malformed remote tag responses. The suite now has 34 tests. Packaging validates the final ZIP after the prepublish build and creates its checksum only after validation. Release preparation verifies checkout identity and existing lightweight/annotated tag targets without creating or changing tags. Local final-archive validation and a live read-only remote-tag lookup pass; release publication remains gated as documented.


## Packaging advisory resolution

The earlier packaging advisory is now resolved through a parent/version-scoped override from Identity 4.14.0 to MSAL 7.1.1. The unfiltered Bun audit reports no vulnerabilities and the old exception has been removed. Six new regression tests exercise the actual SDK/MSAL dependency pair with an in-memory HTTP transport: resolved patched version, client-secret token acquisition/cache, client assertions, plain authorization codes, environment credentials with chain fallback, and rejected authentication. The suite now has 40 tests. No Azure account credentials or publication are used in these tests. Scope, compatibility limits and the override removal condition are documented in packaging-security.md.


## Two-window review — 26 October 2026

Reproduced two saved-profile data-loss cases in real concurrent macOS VS Code windows: stale whole-array updates after a confirmation, and simultaneous different-name saves. Added a locked private-file repository with target comparisons, legacy migration, live file notifications, focus refresh and an explicit Refresh profiles button. Six pure storage regressions cover migration, concurrent creation, stale target rejection, corrupt data preservation, storage limits/schemes and cross-instance notifications. The combined 46-test unit suite, host/browser type checks and Biome pass. Eight two-window scenarios pass locally on macOS arm64 in both VS Code 1.140.0 and stable 1.143.1. The stable real-editor suite, empty-window suite and 16 dark-theme page/layout accessibility scans also pass. See [the test scenarios and storage limitations](multi-window.md). After merging the packaging advisory resolution above, the combined suite, two-window regression, clean dependency audit and verified VSIX packaging pass.


## Remote SSH review — 26 October 2026

Real macOS-to-Linux Remote SSH checks passed for configuration scopes, existing Remote versus local User settings destinations, language and folder isolation, Linux-owned profile storage, JSON import/export and conflict-aware pause/resume. A different Linux extension-host process recovered the persisted pause after closing and reconnecting the desktop client. Hands-on native UI checks covered remote export/import dialogs, confirmation/cancellation and pause/resume. See [the review method and coverage limits](remote-workspace.md). Updated @types/node to ^26.6.5; host/browser type checks and the 46-test unit suite pass under the Node 24 build baseline.


## Formatting status card

Replaced the compact editor panel with one native formatting-only status card. Local VS Code 1.140.0 and stable 1.143.1 tests verify cold click, identical hover/click bounds and content, pinning, keyboard access, real formatting edits and native scope/language pickers without opening tabs. The 49-test Node 24 suite, type checks, Biome and empty-window suite pass. Added revision/invalid-action regressions, owned-versus-effective checks and save-action preservation. CI runs native status checks across three themes alongside the existing dashboard scans. Native appearance, pointer and hover delay remain controlled by VS Code; see [status controls](status-controls.md).


### Anchored card layout refinement

Replaced the narrow settings table with a 360px HTML content layout using the public MarkdownString supportHtml option and VS Code’s built-in sanitizer. Escaped all dynamic text and attribute content, disabled theme-icon parsing for user text, and retained constrained command links and stale-state protection. Native UI checks measure the rendered width, compare hover/click position and content, and reject form/script elements. Host syntax optimization keeps the bundle within the existing budget without changing debug names or source maps.


### Interaction follow-up from screen recordings

An inherited trigger becoming explicitly configured used to remove its helper row and shift the anchored card. Ownership notes now retain a consistent row height. Equivalent configuration/focus notifications no longer rebuild the tooltip or invalidate unchanged links. A real-editor regression starts from editor focus, opens by hover alone and toggles an inherited trigger twice without another status click; it checks ownership notes, value changes and identical bounds throughout. Scope/language labels explicitly describe opening a VS Code picker. The fields remain command links, not inline dropdown widgets.
