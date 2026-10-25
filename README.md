# Formatting Controls

Native, scope-aware controls for VS Code formatting and save actions. Publisher: `rajudhami`. Early development, version 0.1.0; no Marketplace publication yet.

Run `bun install --frozen-lockfile`, `bun run build`, then press F5 in VS Code. Click **Formatting: ON/OFF/MIXED** or run **Formatting Controls: Quick Controls**. Choose User, Workspace or Workspace Folder, then all languages or the active language. Each setting uses a suitable value picker. Use a file inside the intended folder for multi-root projects.

Controls include Format on Save/Paste/Type, save mode, default formatter ID, Auto Save and delay, and individual source actions. Action values are `explicit`, `always`, `never`; availability depends on the language and provider. `always` covers focus/window Auto Save, not a promise of delay-based actions. Existing action entries are preserved. Legacy action arrays require manual migration.

The status summarizes the three formatting flags for the active editor, not whether a provider will format successfully. Code actions are separate. **Inspect Effective Settings** opens a JSON report of effective values and all API-exposed scopes. Reset removes only a selected setting at the chosen target after confirmation. Language-specific Auto Save edits are rejected.

No telemetry, runtime network access or source-code transmission. No bundled formatter or linter. React dashboard, provider detection, profiles and pause are planned, not implemented. See architecture and feature matrix in `docs/architecture.md`.

Validation: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run test:integration`. Integration launches an isolated VS Code instance. Package with `bun run package`; install the resulting VSIX through Extensions → Install from VSIX. Node 24 LTS (24.22.1) and Bun 1.4.4 is required for development.

License: MIT proposed; pending owner approval. No license grant or public release is made in this foundation.
