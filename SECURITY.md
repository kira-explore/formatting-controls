# Security

Report a security issue privately to imrajudhami@gmail.com. Include the extension version, VS Code/OS version, reproduction steps and impact. Avoid posting secrets or exploitable details in a public issue. No response-time guarantee is implied.

The extension is in development; no Marketplace release is configured by this repository. Security fixes target main and the next release. Ordinary bugs belong in GitHub Issues.

## Dependency audits

PR validation and release preparation require a clean, unfiltered bun audit. No advisory exceptions are allowed. Reports are uploaded as CI artifacts.

GHSA-xcx6-jx8p-x3h5 is resolved by a temporary Bun override scoped to @azure/identity 4.14.0, selecting patched MSAL 7.1.1. This deliberately exceeds Identity's declared ^6.0.0 range and is backed by compatibility tests for the packaging tool's actual dependency pair. A minimatch 11.0.3 override also addresses the packaging dependency advisory GHSA-g3hv-75wg-m249. See [the reviewed rationale, tests, limitations and removal conditions](docs/packaging-security.md). No authentication dependency tree is shipped in the VSIX.

## Boundaries reviewed

Webview requests are bounded, typed and allowlisted. Setting writes check scope/revision, use fixed configuration keys, and never execute paths or commands supplied by the webview. The dashboard uses nonce scripts and local assets with default-src none. React renders profile names as text. Import is a native file choice, is capped at 128 KiB and validates the profile schema; importing does not apply settings.

The extension does not run project tools, transmit source code, poll services or collect telemetry. Restricted workspaces are supported because inspection and explicit configuration changes do not execute workspace code. VS Code and other extensions remain responsible for their own trust restrictions. Virtual filesystem behavior depends on its provider and is declared limited. [Remote SSH](docs/remote-workspace.md) and [simultaneous-window](docs/multi-window.md) checks cover their documented scenarios; other remote environments remain untested. Hands-on screen-reader review is still outstanding.

Recovery is conditional: settings APIs have no atomic compare-and-swap. A write may race an external edit after the last check, and an identical external value around a crash cannot be perfectly attributed. Pause persists until Resume. See [workflow and recovery limits](docs/workflows.md).
