# Providers, profiles and recovery

## Providers and diagnostics

Select **Run diagnostics** to capture a read-only report for the current scope and language. The new report opens below the button. **Run history** appears above the button and keeps up to 20 reports per workspace in VS Code's extension storage. When you return to Diagnostics, select a saved run to see its original results. Use the trash button to delete one report or **Clear all** to remove every saved run. Both actions ask for confirmation. Deleting the open run closes its report. In an empty VS Code window, history lasts for the current window session.

Provider adapters declare known languages, formatting capability, supported setting keys and candidate source actions for Biome, ESLint, Prettier and built-in JavaScript/TypeScript, JSON, HTML and CSS tooling. Runtime evidence comes from public VS Code configuration and extension metadata. Prettier has no invented fix-all actions; ESLint formatting is conditional on its formatting flag. Unknown formatter extensions remain selectable by ID without claiming adapter capabilities.

Diagnostics separates verified setting facts from possible conflicts and informational limits. It reports disabled save formatting, effective overrides, unavailable configured extensions, disabling provider flags, multiple possible formatters, overlapping Biome/ESLint actions, legacy arrays and Auto Save mode limitations. It does not enumerate arbitrary registered providers, inspect internal servers, or guarantee save-action ordering.

Language Rules enumerates explicit language override sources for the current resource, using configuration inspection rather than filesystem scans. Editing delegates to the existing language-aware settings writer. Combined-language blocks retain the limitations of the public API.

Built-in presets set only the three automatic formatting triggers. **Manual Formatting** turns all three off, **Format on Save** turns on save only, **Format on Save and Paste** turns on save and paste, and **Format on Save, Paste and Type** turns all three on. Formatter selection and code actions on save are independent.

Custom profiles capture only values explicitly stored at the selected scope, not copied effective inherited preferences. Profiles are shared through extension-owned storage. See [two-window validation and storage migration](multi-window.md). A profile with a top-level `language` requires selecting that language. Applying a profile merges source-action entries and preserves unrelated configuration.

To apply rules for multiple languages in one operation, put separate VS Code-style language blocks inside `settings`. You can also include general settings alongside the blocks.

```json
{
  "version": 1,
  "name": "Web formatting",
  "settings": {
    "[html]": {
      "editor.defaultFormatter": "vscode.html-language-features",
      "editor.formatOnSave": true
    },
    "[css]": {
      "editor.defaultFormatter": "vscode.css-language-features",
      "editor.formatOnSave": true
    }
  }
}
```

In **Profiles**, select **Import profile** and choose the JSON file. Open **Settings target for saving, applying, or pausing**, then select the destination scope and **All languages**, then select **Preview & apply**. The preview lists the affected language for each override. A single restore point covers the batch.

## Preview and restoration

Dashboard/profile batches display a JSON preview with scope, before/after values and individual action entries, followed by a native VS Code confirmation picker. Cancellation makes no settings changes. The status card's formatting-only Pause/Resume closes the card and opens a native confirmation picker, also available from the Command Palette, using the same durable journal and conditional restoration. User-level changes are labelled as affecting other workspaces. Save/delete overwrite prompts concern profile data, not editor preferences.

A workspace-local recovery journal is durably saved before any write. Each write attempt is journaled before it begins. Unattempted changes are excluded from rollback, including when an external edit happens to equal the requested value. Values are checked again after journal persistence, immediately before starting each write. If persistence yields to an external edit, the unstarted write is excluded from rollback. Partial failures trigger a conditional rollback; failures retain recovery data for review.

Restore compares each current value with the recorded before/after values. Unchanged values are restored, already-restored values are skipped, and externally edited values are preserved. Source actions are tracked per entry, so unrelated or newly added actions survive restoration. Restore is restricted to the entries eligible when its plan was prepared; reviewed workflows also restrict it to the confirmed preview. Externally edited legacy or unsupported action maps remain conflicts without blocking unrelated formatting flags. Dashboard/profile Restore keeps conflicts in the journal until reviewed, restored, or explicitly kept through Keep current values. Status-card and Command Palette Resume instead finishes the pause after successfully restoring unchanged values and keeping newer edits; its next Pause captures a fresh baseline. Failed or dirty writes still retain recovery. The latest completed profile restore point can be replaced by another confirmed batch or a confirmed status pause. An active pause or incomplete recovery record blocks a new batch.

Project batches check the destination settings document for unsaved edits before creating or changing the journal. Each write checks again. A dirty destination stops the operation without saving or discarding edits; unrelated dirty documents do not block it. The native command warning offers Open settings file so the user can save and retry.

Workspace and folder identity are checked during writes and restore. User profile restore points belong to the originating workspace/window even though user settings themselves affect other workspaces. Recovery uses VS Code mementos, never arbitrary paths supplied by webview messages.

VS Code settings have no atomic transaction or compare-and-swap API. Concurrent external changes between the final comparison and update, or an external edit identical to an attempted value around a crash, cannot be distinguished perfectly. Two windows can also edit the same underlying settings. Recovery is conditional and best-effort; previews and durable journals do not provide atomic transactions.

## Temporary pause

Pause is available only for Workspace and Workspace Folder scopes. User-wide pause is unavailable because it would affect other windows. The status card pauses only Save/Paste/Type formatting, preserving save actions. The Profiles page's temporary pause also disables currently configured save actions at the selected scope. Manual formatting, Auto Save itself and higher-priority overrides are unaffected. See [status-card behavior](status-controls.md).

Pause writes real preferences and persists until Resume/restore; it is not automatically lifted when a window closes or reloads. Reload preserves the journal and presents a recovery reminder. The Command Palette's Restore Previous Settings command works without keeping the dashboard open. No automatic deactivation writes are attempted because extension-host shutdown cannot reliably await restoration.

## Profile files and message boundary

Export uses a native Save dialog; Import uses a native Open dialog. The UI never supplies filesystem paths. Version 1 profile JSON is capped at 128 KiB, with at most 50 saved profiles and 100 save-action entries per profile. Known setting keys, values, names, language constraints and action identifiers are validated. Reserved preset names imported from a file are saved with an imported suffix. Import saves a profile only; a separate preview/apply step changes preferences.

Webview operations remain allowlisted and revision/scope checked. Provider Settings opens a fixed native Settings command with a validated extension filter. Corrupt profile/recovery storage is surfaced as an error without disabling the basic formatting controls. No telemetry, remote UI assets, new runtime network requests or provider dependency packages were added.

## Validation and remaining work

Pure tests cover schema rejection, action-preserving plans, journal persistence before mutation, storage failure, partial rollback, stale-value preservation, external-edit conflicts, provider capability distinctions and diagnostic confidence. Real VS Code tests cover scoped profile save/apply, cancellation, JSON file round trips and rejection, persistent pause state across service recreation, granular resume, language rules and storage failure isolation.

See [validation](validation.md) for automated coverage and remaining manual checks, [two-window storage](multi-window.md) for concurrent profile behavior, and [Remote SSH review](remote-workspace.md) for host-specific results. Dependency workarounds and release gates are documented in [packaging security](packaging-security.md) and [release preparation](releasing.md).
