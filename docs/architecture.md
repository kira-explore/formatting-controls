# Architecture and implementation plan

Research baseline: 25 October 2026. Empty repository; macOS arm64, Node 26.12.1, npm 11.20.0, installed VS Code 1.143.1. Target stable API 1.140+. TypeScript 7.0.2 uses ESNext language/library settings. Biome 2.6.3 is the sole formatter and linter. Bun 1.4.4 manages dependencies and scripts, with its version declared once in packageManager. Node >=24 is the development compatibility range; CI selects the latest Node 24 LTS patch. Local verification used Node 24.22.1. The extension bundle targets Node 22 syntax for the VS Code host, whose runtime is supplied by VS Code.

## Verified APIs and constraints

- [Official API](https://code.visualstudio.com/api/references/vscode-api): StatusBarItem, showQuickPick, WorkspaceConfiguration.get/inspect/update, ConfigurationTarget and language scope. Updates explicitly pass overrideInLanguage, so a language override is never selected implicitly.
- [Settings precedence](https://code.visualstudio.com/docs/configure/settings): language-specific values override ordinary settings even at a broader target. `get` is authoritative; inspection exposes individual scope values. Combined language blocks and policy can complicate attribution; show raw inspection rather than inventing an exact source.
- [Code actions](https://code.visualstudio.com/updates/v1_85): explicit/always/never replace legacy booleans. Always includes focus/window Auto Save; do not promise afterDelay behavior or arbitrary execution ordering.
- [Quick Input](https://code.visualstudio.com/api/references/vscode-api#QuickPick): native rows and buttons, no embedded HTML switches or supported arbitrary anchored popover.
- [Webviews](https://code.visualstudio.com/api/extension-guides/webview): custom dashboards possible, isolated messaging and strict CSP required. [UX guidance](https://code.visualstudio.com/api/ux-guidelines/webviews) discourages duplicating Settings and using webviews for wizards; use native onboarding and make the later dashboard explain cross-setting relationships.
- [Formatting Toggle](https://marketplace.visualstudio.com/items?itemName=tombonnike.vscode-status-bar-format-toggle): convenient grouped toggles and limited nested action support. This design adds explicit targets, individual enum controls and inspection without bulk rewriting settings.
- [ESLint integration reference](https://github.com/microsoft/vscode-eslint): source.fixAll.eslint. [Biome](https://biomejs.dev/reference/vscode/): provider-specific source fixes and import organization require installed/configured tooling. Candidate IDs are not a registry of available actions.

## Modules and data model

`model` contains pure status/action logic. `configuration` owns target-specific inspection and supported API writes. `extension` owns native UI, commands and disposable listeners. No filesystem scans, telemetry, runtime packages, remote requests or save interception. Dashboard dependencies will load only when requested. Event-driven status refresh uses the active document language and URI.

Selection = target + active resource URI + optional language ID. No persisted target that could silently affect another project. Workspace-folder editing uses the active file to disambiguate multi-root workspaces. Ordinary settings and language overrides are separate. Updating an action merges the selected target's object, never copies the effective merged object into it. Legacy arrays are rejected for manual migration. Configuration writes are not transactional across extensions: concurrent external edits between read and write remain a limitation. Reset removes one selected owned value with a concrete confirmation; no blanket reset.

ON means all three built-in formatting flags enabled; OFF means none; MIXED means a combination. These labels deliberately exclude code actions and Auto Save and do not assert a formatter will execute.

`shared/protocol.ts` defines an initial future request/response contract. Before wiring it, implement runtime discriminated-union validation, bounded strings/payloads, allowlisted setting values and resource URIs, request IDs, revisions, response errors and panel disposal. Never accept arbitrary commands, paths or URLs. CSP default-src none; nonce scripts; local resource roots only; VS Code theme tokens.

## Feature matrix

| Feature                                                       | Delivery            | Feasibility / limitation                                                                                               |
| ------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Status and quick controls                                     | Phase 1 implemented | Native Quick Pick, keyboard accessible, no custom switches                                                             |
| Save/Paste/Type, save mode, formatter ID, Auto Save and delay | Phase 1 implemented | Writes real settings; formatter ID does not prove eligibility                                                          |
| Individual source actions                                     | Phase 1 implemented | User supplies candidate ID; provider availability not asserted                                                         |
| User/workspace/folder/language selection                      | Phase 1 implemented | Folder requires active resource; files.autoSave is not language overridable                                            |
| Scope inspection and one-setting reset                        | Phase 1 implemented | Raw inspection plus effective values, confirmed deletion                                                               |
| React dashboard and welcome                                   | Phase 2 planned     | Native first-run invitation persisted once; reopen command; no forced startup panel                                    |
| Provider adapters and diagnostics                             | Phase 3 planned     | Installed extension metadata is evidence of installation, not actual registered capabilities or enabled server state   |
| Profiles/import/export                                        | Phase 3 planned     | Validate schema, preview per-key changes, snapshot only owned values, conflict-aware restore                           |
| Pause                                                         | Phase 3 exploration | Requires real setting writes; persist journal before writes, restore only unchanged values, offer recovery after crash |
| Release assets and publication                                | Phase 4 planned     | No automatic publication or credentials in local development                                                           |

## Interaction and dashboard design

Status click → target → all languages or active language → setting → typed value. Cancellation before write has no effect. Every completed write reports effective value and points to inspection for overrides. Reset previews the exact owned value. Native menus inherit editor theme, keyboard and screen reader behavior.

Phase 2 navigation: Overview (effective summary and actionable warnings), Formatting (typed inputs), Code Actions (provider evidence and run modes), Formatters & Linters (adapter capabilities), Language Rules (IDs and explicit overrides), Diagnostics (verified vs possible findings), Profiles (diff preview), Advanced (scopes, resets, logs/about). Search spans labels and setting IDs. Theme tokens, visible focus, reduced motion, responsive single-column layout and explicit loading/error states are acceptance criteria. Do not ship empty dashboard tabs as functionality.

## Tooling and validation

All authored scripts use TypeScript and ES imports. Bun runs `build.ts` and `test/run-integration.ts`; emitted bundles use `.js`. A generated `dist/package.json` marks the VS Code host/test bundle as CommonJS while the source package remains ESM. Strict TypeScript, Biome, esbuild CommonJS host bundle; Node test runner for pure regression tests. Isolated Electron extension-host tests exercise activation and real configuration precedence, language reset and action preservation. The integration runner uses temporary user data and extensions; never the developer's settings. CI runs checks and packaging; release workflow is manual and produces a VSIX only. Future tests must add protocol validation, adapter evidence, profile rollback and diagnostic false positives with their implementations.
