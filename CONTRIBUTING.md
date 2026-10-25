# Contributing

Use Node 24 or newer (Node 24 LTS recommended), the Bun version in `package.json#packageManager`, and `bun install --frozen-lockfile`. Use `bun run lint` for Biome checks and `bun run format` to apply fixes. Keep `bun.lock` committed; do not add npm or Yarn lockfiles or ESLint tooling. Run typecheck, lint, unit and extension-host tests before a pull request. Keep changes focused and explain user-visible behavior and validation. Do not assume a provider is available because its extension is installed. Add regression coverage for scope handling and preserve unrelated settings. Do not add telemetry or publish from local development.

## Branches and commits

Keep `main` release-ready. Use short-lived `feat/<description>`, `fix/<description>`, `docs/<description>`, or `chore/<description>` branches and merge through pull requests. Avoid a long-lived develop branch. Use Conventional Commits: `type(scope): description`, for example `feat(controls): add scope-aware quick controls` or `fix(configuration): preserve unrelated save actions`. Use `!` and a BREAKING CHANGE footer for breaking changes. Prefer squash merges with a Conventional Commit pull request title. These are project conventions; remote branch protection is configured separately.

## Dashboard changes

Keep the host/browser boundary typed and validate every incoming request in `shared/protocol.ts`. Add rejection tests for new message types or values. Run F5 for real settings behavior; the Vite development page does not emulate VS Code. `FORMATTING_CONTROLS_UI_REVIEW=1 bun run test:integration` keeps the isolated dashboard open for three minutes on localhost debug port 9333 for visual review; do not run two visual reviews concurrently. Check light, dark, high-contrast, narrow widths, and keyboard focus. The integration runner always uses temporary user settings and workspace folders.

## Production-readiness checks

Run bun run test:ui for automated real-dashboard accessibility, keyboard, reduced-motion, layout, CSP and text-escaping checks. Theme selection is documented in docs/releasing.md. Reports and CPU profiles are written to ignored test-results/. A browser download is unnecessary: the test driver attaches only to the isolated VS Code instance. Run one UI review at a time on debug port 9333. Test reports can contain temporary local paths; review them before sharing.

Packaging now verifies contents and size budgets and emits a SHA-256 sidecar. Run bun run security:check for a completely clean dependency audit; both PR validation and release preparation reject advisories without exceptions. Do not add suppressions to bypass release gates.
