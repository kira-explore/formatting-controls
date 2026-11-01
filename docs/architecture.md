# Architecture

Kira Formatting Controls targets the public VS Code API from 1.140 onward. It reads and writes real VS Code preferences; it does not intercept saves, execute formatters, scan project files or collect telemetry. The editor supplies the extension-host runtime.

## Modules

| Module                                                             | Responsibility                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `src/extension.ts`                                                 | Activation, commands, welcome and disposable event listeners    |
| `src/configuration.ts`, `src/model.ts`                             | Scope-aware inspection, validation, individual writes and reset |
| `src/status-controls.ts`, `src/status-hover.ts`                    | Status selection, pinned hover and guarded actions              |
| `shared/status-*.ts`                                               | Read-only artwork, explanatory text and Markdown construction   |
| `src/dashboard.ts`, `webview-ui/src`                               | Webview lifecycle, host bridge and React dashboard              |
| `src/providers.ts`, `shared/providers.ts`, `shared/diagnostics.ts` | Known provider evidence and diagnostic findings                 |
| `src/workflows.ts`, `shared/workflows.ts`                          | Preview, apply, durable journals and conditional restoration    |
| `src/profile-store.ts`                                             | Coordinated private profile storage across windows              |
| `shared/protocol.ts`, `shared/state.ts`                            | Runtime-validated messages and state contracts                  |

## Settings and selection

A selection contains a User, Workspace or Workspace Folder target, a resource URI and an optional language ID. The dashboard persists a valid selection across its reloads and recovers if a folder is removed. The last active text document remains the reference while the dashboard has focus. Native Quick Controls uses an explicit scope/language selection for each operation.

Effective values come from `WorkspaceConfiguration.get`; `inspect` exposes individual source values. Writes explicitly select whether to use a language override. Language-specific settings can override ordinary settings at broader targets. Combined-language blocks and policy can make exact attribution ambiguous; raw inspection remains available.

Source-action writes merge only the selected target's object and preserve unrelated entries. They never copy the complete effective object into that target. Legacy arrays require manual migration. Reset previews one owned value and rejects removal if that value changed before confirmation. Settings have no atomic compare-and-update API; an external edit can still race the final comparison and write.

## Status card and dashboard

Hover and click show the same anchored Markdown card; click focuses and pins it using the built-in hover command. Inert SVG artwork shows effective values, read-only checkboxes/dropdowns and source notes. Settings, Dashboard, Report an issue and reviewed Pause/Resume are real links. No status click creates a docked view or editor tab. [Status controls](status-controls.md) documents rendering, accessibility and public API limits.

The status bar's ON/OFF/MIXED and the card's Enabled/Disabled/Mixed summarize only Save/Paste/Type formatting. They do not guarantee formatter availability or source-action execution. The status-card pause preserves save actions; the Profiles pause includes them. [Workflows and recovery](workflows.md) explains both and their restoration limits.

The dashboard is an editor `WebviewPanel` with Overview, Formatting, Code Actions, Formatters, Language Rules, Diagnostics, Profiles and Getting Started pages. It uses typed controls and explicit scope/language selection. First activation opens Getting Started once; opening it changes no preferences. Test mode suppresses that automatic opening.

## Host/browser boundary

Every dashboard request uses a bounded, runtime-validated discriminated union. Configuration keys, typed values, language IDs, destinations and workspace-folder URIs are allowlisted. Settings requests carry an exact scope and revision; stale requests are rejected and refreshed state follows. Requests are serialized. No arbitrary command, path or URL is accepted from the webview.

The content security policy denies resources by default, permits nonce-bearing bundled scripts and local assets, and limits resource roots to the dashboard build directory. React escapes dynamic text. There are no CDN assets or runtime UI network requests. Explicit documentation/GitHub actions open fixed external destinations. Native file dialogs choose profile import/export locations.

Configuration, editor, folder, theme, installed-extension and profile events refresh state. Panel listeners dispose with the panel. Profiles use extension-owned storage and cross-process locking; recovery journals remain workspace-local. See [multi-window coordination](multi-window.md) and [remote execution](remote-workspace.md).

## Tooling and checks

Node >=24 and the Bun version in `package.json#packageManager` are development tools. Authored code uses TypeScript, ES imports and ESNext language/library settings. Biome handles formatting, linting and imports. React/Vite assets load only when the dashboard opens. The host bundle targets Node 22 syntax for VS Code compatibility; a generated `dist/package.json` marks host/test `.js` bundles as CommonJS while authored sources remain ESM.

Pure tests run in Node. Isolated real-editor suites exercise configuration, the dashboard, the status card, simultaneous windows and Remote SSH. Packaging checks final archive identity, contents and budgets. [Validation](validation.md) lists commands and coverage; [release preparation](releasing.md) describes publication gates.

## API references

- [VS Code API](https://code.visualstudio.com/api/references/vscode-api): configuration, Quick Input, status items and webviews.
- [Settings precedence](https://code.visualstudio.com/docs/configure/settings): ordinary and language overrides.
- [Code-action save modes](https://code.visualstudio.com/updates/v1_85): explicit/always/never; execution depends on the provider and save type.
- [Webview security](https://code.visualstudio.com/api/extension-guides/webview#security): resource isolation and CSP.
