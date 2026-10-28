# Release preparation

Development version: 0.5.0. Display name: Kira Formatting Controls. Publisher: rajudhami. Identifier: rajudhami.formatting-controls. Node 24 LTS and Bun from packageManager are build tools; users do not need Bun to install the VSIX. VS Code supplies the extension-host runtime.

## Validate a candidate

Use bun install --frozen-lockfile, then run typecheck, lint, test, test:integration, test:multi-window, test:remote, test:ui, security:check and package through bun run. VSCODE_VERSION selects stable or the minimum supported 1.140.0. FORMATTING_CONTROLS_UI_THEME selects Dark Modern, Light Modern or Default High Contrast. Tests isolate user settings and extensions. CPU profiles, warm snapshot metrics, accessibility reports and screenshots go to ignored test-results/.

Packaging reopens the final VSIX after vscode:prepublish and verifies required files, installer/package identity, excludes authored sources/tests/tooling/environment files, enforces host/UI/archive size budgets and emits a SHA-256 sidecar. Keep the PNG icon, README gallery, support/security documents, MIT license, third-party notices and changelog current. Version badges describe development tooling, not requirements for extension users.

## Release draft workflow

After merging a version change to main, manually dispatch Prepare release draft on main with the exact package.json version. It reruns the full reusable validation matrix. Release metadata checks reject mismatched versions and non-main refs, verify the checkout against the workflow revision, and reject existing lightweight/annotated version tags that resolve to another commit. A strict unfiltered bun audit must pass before a draft GitHub release can be created with the candidate VSIX/checksum. No Marketplace upload or public GitHub release is performed by this workflow. The packaging advisory has been resolved with the reviewed workaround in packaging-security.md. Do not add audit exceptions to release.

A maintainer must still review the candidate in a clean editor, review the [Remote SSH results and coverage limits](remote-workspace.md) and [two-window regression results](multi-window.md), perform a screen-reader pass, confirm publisher ownership and approve publication. Current automated checks do not establish complete WCAG conformance or validate every remote/provider configuration. Do not claim these reviews passed without performing them.

For Marketplace authentication, follow the current official publishing guide and prefer short-lived Entra ID/workload identity credentials. No Marketplace secrets, publisher account changes or automatic publication are configured in this PR. Once release blockers are resolved, publish the reviewed artifact through the maintainer's authorized release process and verify installation/upgrade afterward.

Official references: [publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust), [webview security](https://code.visualstudio.com/api/extension-guides/webview#security), [axe-core automated testing limits](https://github.com/dequelabs/axe-core).
