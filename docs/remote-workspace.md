# Remote workspace review — 26 October 2026

Tested a real VS Code 1.143.1 Remote SSH connection from macOS arm64 to an isolated Ubuntu 24.04 Linux arm64 container. Remote SSH 0.128.0 launched the extension in a Linux process using VS Code Server's Node 24.22.1. This is a desktop-to-Linux SSH boundary, with remote files, storage and extension execution. It is not a local filesystem mock or a Dev Containers connection.

## Results

- User, Workspace and Folder precedence, two-folder isolation, language overrides and action-preserving writes passed.
- Existing Remote User preferences and new User preferences were checked against the actual local and remote settings files.
- Saved profiles use the Linux host's extension-owned global storage. Remote JSON import/export passed through the filesystem API.
- Pause persisted in the remote workspace journal. Resume restored unrelated values and preserved externally edited actions.
- Closing the desktop client and reconnecting created a different Linux extension-host process. Profiles and the paused journal survived; restoration preserved an action added after reconnect.
- Hands-on dashboard review through native computer-use controls passed: remote folder selection, native export to `/home/fc/workspace/first/handson.json`, import and overwrite confirmation, cancelling a pause preview, confirming a pause, and successful Resume. The dashboard's remote assets loaded correctly.

The development-only fixture activates the production extension and exposes its context only to the test suite. Programmatic assertions use real VS Code settings, storage, profile import/export and journals, with controlled confirmation/file-selection callbacks. Native file-picker and confirmation checks are recorded separately from the automated assertions. No test commands or context exports are added to the shipped extension.

## Scope behavior

**User** uses VS Code's Global configuration target. In the tested session, a new format-on-save preference was written to local User settings; an existing Remote format-on-save-mode preference was updated on the SSH host. The dashboard now explains this behavior in remote User scope. Use VS Code Settings' **Remote** tab when you need to choose that layer explicitly. Workspace and Folder changes stay in the selected remote project. There is no separate Remote User target in this extension's scope selector.

Profiles are private to the extension storage on that remote host. They do not automatically appear in local windows or on a different remote host; use JSON export/import to transfer preferences. Recovery remains conditional on unchanged values, and editor settings have no atomic compare-and-update API.

## Repeat the review

Use Node 24 LTS, the declared Bun version, Docker with a running Linux daemon, and OpenSSH client tools. Run:

```sh
bun install --frozen-lockfile
bun run test:remote
# Linux without a desktop display:
xvfb-run -a bun run test:remote
```

`FC_REMOTE_DOCKER_CONTEXT` optionally selects an existing Docker context. The runner builds a pinned Ubuntu image, creates an isolated SSH container, publishes SSH only on loopback, generates a temporary key and host-specific known-hosts file, and installs the pinned official Remote SSH extension into a temporary VS Code profile. It removes its container and temporary client/key files after the run. It does not alter the normal editor profile, SSH configuration or host SSH service. Normal development windows are used because VS Code's native extension-test mode uses in-memory storage and cannot establish persistence across client restarts. The reconnect test waits for the persisted folder settings to appear in VS Code's configuration API before checking recovery; remote activation can precede configuration loading.

For an interactive pass, run `bun run test:remote --review`. The ignored `test-results/remote/session.json` identifies the active container/session. After reviewing the dashboard and closing any unsaved preview documents, create `/home/fc/workspace/review-done` on the test host containing a JSON object with `passed: true` and a `checks` array describing the performed checks. The runner records that review, then automatically pauses, closes/reconnects and verifies recovery. Do not mark a review complete without performing it. The local `FC_REMOTE_EXTENSIONS` option can reuse a directory containing an already installed official Remote SSH extension; CI installs it from Marketplace instead.

CI runs the real SSH test on Linux stable, including the close/reconnect pass. Machine-readable results, setting destinations and process identities are retained in `test-results/remote/*.json`. Only the runner's own test container is removed; the Docker daemon and pre-existing VM are left running.

## Coverage limits

This validates Remote SSH with a Linux host. WSL, a connection through the Dev Containers extension, Codespaces, Windows SSH servers, network-mounted profile storage, interrupted network writes and forced process crashes have not been tested. These results do not establish universal remote compatibility. Screen-reader testing remains outstanding.

See Microsoft's [remote extension guidance](https://code.visualstudio.com/api/advanced-topics/remote-extensions) for execution locations, storage APIs and development setup. Node type declarations are now `^26.6.5` as requested; they are compile-time definitions. Node 24 remains the build/runtime compatibility baseline and CI test runtime.
