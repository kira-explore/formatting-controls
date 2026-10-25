# Security

Report a security issue privately to imrajudhami@gmail.com. Include the extension version, VS Code/OS version, reproduction steps and impact. Avoid posting secrets or exploitable details in a public issue. No response-time guarantee is implied.

The extension is in development; no Marketplace release is configured by this repository. Security fixes target main and the next release. Ordinary bugs belong in GitHub Issues.

## Current packaging advisory

GHSA-xcx6-jx8p-x3h5 affects the development-only chain @vscode/vsce 4.0.0 → @azure/identity 4.14.0 → @azure/msal-node 6.0.1. Identity requires MSAL ^6.0.0; the patched MSAL >=7.1.0 is outside that range. No incompatible override is used. This dependency is excluded from the VSIX and the extension performs no authentication flow.

PR validation reports this single existing advisory and fails on any additional advisory. This baseline is not permission to publish: the release-draft workflow runs strict, unfiltered bun audit and currently stops on this finding. A compatible upstream fix must be reviewed and the baseline removed before public release. The policy lives in scripts/audit.ts; the full report is uploaded as a CI artifact.

## Boundaries reviewed

Webview requests are bounded, typed and allowlisted. Setting writes check scope/revision, use fixed configuration keys, and never execute paths or commands supplied by the webview. The dashboard uses nonce scripts and local assets with default-src none. React renders profile names as text. Import is a native file choice, is capped at 128 KiB and validates the profile schema; importing does not apply settings.

The extension does not run project tools, transmit source code, poll services or collect telemetry. Restricted workspaces are supported because inspection and explicit configuration changes do not execute workspace code. VS Code and other extensions remain responsible for their own trust restrictions. Virtual filesystem behavior depends on its provider and is declared limited. Remote hosts and multi-window simultaneous edits need a separate hands-on release review.

Recovery is conditional: settings APIs have no atomic compare-and-swap. A write may race an external edit after the last check, and an identical external value around a crash cannot be perfectly attributed. Pause persists until Resume. See docs/phase-3.md.
