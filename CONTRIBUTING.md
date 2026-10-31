# Contributing

Use Node 24 or newer (Node 24 LTS recommended) and the Bun version in `package.json#packageManager`:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
```

Biome handles formatting, linting and import organization; `bun run format` applies fixes. Keep `bun.lock` committed. Do not add npm/Yarn lockfiles or ESLint tooling.

Keep changes focused and explain user-visible behavior and validation. Preserve unrelated settings and add meaningful regression coverage for scope or recovery changes. An installed provider does not prove it is available for the current file. Do not add telemetry or publish from local development.

## Branches and commits

Keep `main` release-ready. Use short-lived `feat/<description>`, `fix/<description>`, `docs/<description>` or `chore/<description>` branches and pull requests into `main`. Use Conventional Commits, for example `feat(controls): add scope-aware quick controls` or `fix(configuration): preserve unrelated save actions`. Use `!` and a BREAKING CHANGE footer for breaking changes. Prefer squash merges with a Conventional Commit PR title. Remote branch protection is configured separately.

## UI and host changes

Keep the host/browser boundary typed and validate incoming requests in `shared/protocol.ts`. Add rejection tests for new message types or values. Use F5 for real settings behavior; a browser preview does not emulate VS Code.

For dashboard changes, run `bun run test:ui`. For status-card changes, build and run `bun run test/run-integration.ts --status-ui`. Check light, dark, high contrast, keyboard focus and narrow layouts. The status card uses inert artwork; keep checkbox/dropdown displays read-only and route edits through the dashboard or native Quick Controls.

`FORMATTING_CONTROLS_UI_REVIEW=1 bun run test:integration` keeps an isolated dashboard open for three minutes on localhost debug port 9333. Run one UI review at a time. Tests use temporary editor settings and workspaces; reports may contain local paths, so inspect them before sharing.

## Documentation and validation

Update the README and changelog when behavior changes. Keep current design details in [architecture](docs/architecture.md), [status controls](docs/status-controls.md) or [workflows](docs/workflows.md), rather than adding phase/iteration reports. Keep historical designs in Git history. Every local documentation link and referenced screenshot must resolve.

Run the checks appropriate to the change. Settings/host changes require the real-editor integration suite; profile/recovery changes also need the relevant multi-window or remote coverage. [Validation](docs/validation.md) lists commands, themes and coverage limits.

Packaging verifies final contents and size budgets and emits a SHA-256 sidecar. Run `bun run security:check` and `bun run package` before proposing release changes. PR/release checks reject dependency advisories without exceptions; do not suppress findings to bypass the gates. See [release preparation](docs/releasing.md).
