# Contributing

Use Node 24 or newer (Node 24 LTS recommended), the Bun version in `package.json#packageManager`, and `bun install --frozen-lockfile`. Use `bun run lint` for Biome checks and `bun run format` to apply fixes. Keep `bun.lock` committed; do not add npm or Yarn lockfiles or ESLint tooling. Run typecheck, lint, unit and extension-host tests before a pull request. Keep changes focused and explain user-visible behavior and validation. Do not assume a provider is available because its extension is installed. Add regression coverage for scope handling and preserve unrelated settings. Do not add telemetry or publish from local development.

## Branches and commits

Keep `main` release-ready. Use short-lived `feat/<description>`, `fix/<description>`, `docs/<description>`, or `chore/<description>` branches and merge through pull requests. Avoid a long-lived develop branch. Use Conventional Commits: `type(scope): description`, for example `feat(controls): add scope-aware quick controls` or `fix(configuration): preserve unrelated save actions`. Use `!` and a BREAKING CHANGE footer for breaking changes. Prefer squash merges with a Conventional Commit pull request title. These are project conventions; remote branch protection is configured separately.
