# Phase 3 — Providers, diagnostics, profiles and pause

## Delivered

Provider adapters declare known languages, formatting capability, supported setting keys and candidate source actions for Biome, ESLint, Prettier and built-in JavaScript/TypeScript, JSON, HTML and CSS tooling. Runtime evidence comes from public VS Code configuration and extension metadata. Prettier has no invented fix-all actions; ESLint formatting is conditional on its formatting flag. Unknown formatter extensions remain selectable by ID without claiming adapter capabilities.

Diagnostics separates verified setting facts from possible conflicts and informational limits. It reports disabled save formatting, effective overrides, unavailable configured extensions, disabling provider flags, multiple possible formatters, overlapping Biome/ESLint actions, legacy arrays and Auto Save mode limitations. It does not enumerate arbitrary registered providers, inspect internal servers, or guarantee save-action ordering.

Language Rules enumerates explicit language override sources for the current resource, using configuration inspection rather than filesystem scans. Editing delegates to the existing language-aware settings writer. Combined-language blocks retain the limitations of the public API.

Profiles include Minimal, Strict, Formatting Only, Project Default and saved custom profiles. Minimal/Formatting Only disable currently configured save actions; higher-priority overrides can still win. Strict enables generic explicit fix-all and import organization without inventing provider availability. Project Default copies explicit project settings (ordinary workspace/folder values followed by language-specific workspace/folder values) into the chosen scope; an empty project preset has no invented defaults.

Custom profiles capture only values explicitly stored at the selected scope, not copied effective inherited preferences. Profiles are shared through global extension state. Applying a language-specific profile requires selecting that language. Applying a profile merges source-action entries and preserves unrelated configuration.

## Preview and restoration

Every batch displays a JSON preview with scope, before/after values and individual action entries, followed by a native VS Code confirmation picker. Cancellation makes no settings changes. User-level changes are labelled as affecting other workspaces. Save/delete overwrite prompts concern profile data, not editor preferences.

A workspace-local recovery journal is durably saved before any write. Each write attempt is journaled before it begins. Unattempted changes are excluded from rollback, including when an external edit happens to equal the requested value. Values are checked again after journal persistence, immediately before starting each write. If persistence yields to an external edit, the unstarted write is excluded from rollback. Partial failures trigger a conditional rollback; failures retain recovery data for review.

Restore compares each current value with the recorded before/after values. Unchanged values are restored, already-restored values are skipped, and externally edited values are preserved. Source actions are tracked per entry, so unrelated or newly added actions survive restoration. Restore is restricted to the entries included in the confirmed preview, even if other values change while confirmation is open. Externally edited legacy or unsupported action maps are retained as conflicts without preventing unrelated formatting flags from being restored. Conflicts remain in the journal until reviewed, restored, or explicitly kept through Keep current values. The latest completed profile restore point can be replaced only by another confirmed batch.

Workspace and folder identity are checked during writes and restore. User profile restore points belong to the originating workspace/window even though user settings themselves affect other workspaces. Recovery uses VS Code mementos, never arbitrary paths supplied by webview messages.

VS Code settings have no atomic transaction or compare-and-swap API. Concurrent external changes between the final comparison and update, or an external edit identical to an attempted value around a crash, cannot be distinguished perfectly. Two windows can also edit the same underlying settings. This is conditional, best-effort recovery with explicit previews, not an atomic transaction guarantee.

## Temporary pause

Pause is available only for Workspace and Workspace Folder scopes. User-wide pause is intentionally unavailable because it would affect other windows. It disables Save/Paste/Type formatting and currently configured save actions at the selected scope. Manual formatting, Auto Save itself and higher-priority overrides are unaffected.

Pause writes real preferences and persists until Resume/restore; it is not automatically lifted when a window closes or reloads. Reload preserves the journal and presents a recovery reminder. The Command Palette's Restore Previous Settings command works without keeping the dashboard open. No automatic deactivation writes are attempted because extension-host shutdown cannot reliably await restoration.

## Profile files and message boundary

Export uses a native Save dialog; Import uses a native Open dialog. The UI never supplies filesystem paths. Version 1 profile JSON is capped at 128 KiB, with at most 50 saved profiles and 100 save-action entries per profile. Known setting keys, values, names, language constraints and action identifiers are validated. Reserved preset names imported from a file are saved with an imported suffix. Import saves a profile only; a separate preview/apply step changes preferences.

Webview operations remain allowlisted and revision/scope checked. Provider Settings opens a fixed native Settings command with a validated extension filter. Corrupt profile/recovery storage is surfaced as an error without disabling the basic formatting controls. No telemetry, remote UI assets, new runtime network requests or provider dependency packages were added.

## Validation and remaining work

Pure tests cover schema rejection, action-preserving plans, journal persistence before mutation, storage failure, partial rollback, stale-value preservation, external-edit conflicts, provider capability distinctions and diagnostic confidence. Real VS Code tests cover scoped profile save/apply, cancellation, JSON file round trips and rejection, persistent pause state across service recreation, granular resume, language rules and storage failure isolation.

Phase 4 still needs wider compatibility and remote-workspace coverage, full screen-reader and performance reviews, real multi-window concurrency exercises, release assets and Marketplace preparation. The existing development-only packaging advisory remains an upstream limitation.
