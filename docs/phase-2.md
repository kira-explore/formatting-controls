# Phase 2 — Dashboard and welcome

The React/Vite dashboard is an editor WebviewPanel with Overview, Formatting, Code Actions, Formatters, and Getting Started pages. It complements native Quick Controls. Only implemented pages appear in navigation; profiles and deeper diagnostics remain Phase 3.

All values come from the host. Inputs use switches, enum selectors, numeric validation, and formatter extension IDs. A known-integration list indicates extension presence without claiming provider eligibility. Other formatter IDs remain editable.

The host accepts a bounded, runtime-validated discriminated request union. Configuration keys, values, language IDs, destinations, and workspace-folder URIs are validated. No arbitrary commands, filesystem paths, or URLs are accepted. Settings writes carry a revision and exact scope; stale messages are rejected and followed by refreshed state. Requests are serialized. Native reset confirmation includes a preview, then checks for external changes before removal. VS Code does not offer atomic configuration transactions.

The CSP denies everything by default, permits only nonce-bearing bundled scripts and local stylesheet/font/image resources, and exposes only the built dashboard directory. React text rendering escapes setting values. Assets have no CDN dependencies or runtime network requests. An explicit GitHub/docs click opens an allowlisted URL externally.

State updates follow configuration, active editor, workspace folder, and installed extension events. Listeners and panels dispose together. The last text document remains the reference while the dashboard has focus. A persisted global flag prevents the welcome page reopening on startup. The Command Palette can reopen it on demand; test mode suppresses first-run auto-opening.

Accessibility includes semantic labels, native selects/inputs, switch roles and checked state, current-page navigation, focus on page changes, live save/error feedback, reduced motion, responsive layouts, and VS Code theme tokens. Full screen-reader verification remains a release task.

The source package is ESM; generated `.js` host/test bundles have a CommonJS dist boundary for VS Code compatibility. Dashboard type checking has a separate DOM-aware configuration so browser globals cannot leak into host modules. React is bundled into dashboard assets, not required as a runtime extension package. The CSS specificity rule is disabled only for the dashboard stylesheet because unrelated component ancestry triggers false positives; accessibility and other lint rules remain active.
