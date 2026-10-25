# Validation — 25 October 2026

Passed strict type checking, Biome and four Node unit tests covering status states, immutable source-action merging, rejection of legacy arrays/malformed IDs and action enabled values. Passed isolated VS Code 1.143.1 extension-host assertions for activation, command registration, User/Workspace precedence, TypeScript language overrides, preservation of unrelated source actions resetting an override, two-folder isolation, preserving inherited action entries without copying them into folder settings, and rejecting stale reset previews for boolean and object values. Successfully packaged a development VSIX.

The native picker flow has not had a complete manual keyboard/screen-reader accessibility review. Combined-language blocks, remote workspaces and the minimum 1.140 host need additional integration coverage. Current integration validation used macOS arm64. No provider execution or save ordering is asserted.

Bun audit reports one high finding through development packaging dependencies @vscode/vsce → @azure/identity → @azure/msal-node (GHSA-xcx6-jx8p-x3h5). The latest stable vsce 4.0.0 resolves Azure Identity 4.14.0, which requires MSAL ^6.0.0. The patched MSAL release is >=7.1.0, outside that supported range; no compatible stable upgrade was available during this review. No cross-major override was introduced. No runtime dependencies are shipped; resolve this finding before public release. See [the upstream advisory](https://github.com/advisories/GHSA-xcx6-jx8p-x3h5). The project is MIT licensed. No Marketplace publishing or credentials configured. React dashboard and advanced features remain explicitly deferred.

Toolchain revalidated with Node 24.22.1, Bun 1.4.4, TypeScript 7.0.2 (ESNext) and Biome 2.6.3. ESLint and its configuration/dependencies were removed. Bun owns the committed lockfile; CI uses frozen installation, the latest Node 24 LTS patch and the Bun version declared in packageManager.

Code-action value cancellation now returns before the success notification. Reset captures the displayed value and rechecks it immediately before writing; VS Code does not provide an atomic compare-and-delete API for settings. External changes after that final check remain a configuration API limitation. GitHub-hosted checks remain blocked by the account billing/spending-limit restriction.


## Phase 2

Host and dashboard type checks, Biome, and nine pure unit tests pass. Protocol regression coverage rejects unsupported commands/settings, malformed scopes/revisions, oversized messages, invalid enums, formatter IDs and numeric values. Extended isolated VS Code 1.143.1 tests cover dashboard folder/language writes, stale revision rejection, folder URI allowlisting, source-action preservation, language-scope restrictions, command registration and real WebviewPanel creation.

Interactive verification used a temporary VS Code profile: Workspace format-on-save and source-action changes saved and synchronized, all main pages rendered, and provider availability caveats were visible. User-level writes correctly remained overridden by the fixture's Workspace setting. Desktop rendering was inspected in dark and light themes; high-contrast and narrow layouts were captured from the built-in high-contrast theme, and switch keyboard focus was checked. Full screen-reader testing remains outstanding. The light-theme review caught and corrected switch-track specificity so the enabled thumb remains visible.

The production React dashboard bundle is approximately 325 KB uncompressed (83 KB gzip) and loads only when opened. This is a bundle-size check, not an extension-host performance profile. No production runtime dependencies are installed from the network; React is included in the local dashboard assets. The previously documented packaging advisory remains unresolved upstream. Remote CI must be checked separately because the account billing restriction previously prevented job startup.


### Phase 2 recheck

Fixed response correlation for rejected input (which could leave controls disabled), out-of-order configuration/navigation snapshots, scope loss when a webview reloads, and resource captions that could identify a different folder from the settings being displayed. The host now restores a valid scope if a selected folder disappears while the panel is closed, and drops queued messages from disposed panels. Native formatter-ID and delay validation uses the same boundaries as the dashboard.

Nine unit tests and the extended isolated editor suite pass. Additional regressions cover error correlation, stale navigation, scope-preserving readiness, removed-folder recovery, correct resource captions and language-mode changes. An interactive test submitted an invalid action and then a valid action in the real dashboard, confirming that the error re-enabled controls and the next action saved normally. Language-mode changes already refreshed correctly; that behavior now has regression coverage.
