# Two-window validation

`bun run test:multi-window` opens two real desktop VS Code windows in one isolated application profile. Two different workspace files point to the same temporary folder. The windows share User preferences, folder preferences and extension profile storage, while retaining separate workspace recovery journals. The runner checks that both extension-host process IDs differ and both profile-storage URIs match. It never uses the maintainer's editor profile or project settings.

The fixture activates the production extension and opens its actual dashboard in each window. Test-only services use the real VS Code configuration API, Mementos and profile repository. Confirmation callbacks hold a preview open or accept it to coordinate interleavings; this is automated real-editor coverage, not a manual screen-reader or native picker review. No testing commands or storage APIs are exposed by the shipped extension.

## Scenarios

- A User setting changed in one window is observed in the other.
- Window A pauses the shared folder. Window B removes a formatting override, changes one save action and adds another. A resumes, restoring unrelated values and retaining B's edits as conflicts.
- While A confirms overwriting or deleting a profile, B creates a different profile. Both operations preserve B's addition.
- B replaces the profile A is about to delete. A rejects the stale deletion.
- B edits a setting during A's apply preview. A rejects the stale application and leaves the edit intact.
- B pauses while A's pause preview is open. A rejects its stale preview; B's separate recovery journal remains available and resumes successfully.
- Both hosts start saving differently named profiles at the same scheduled instant. Both profiles remain visible in both windows.

Results include editor version, platform, host Node versions, workspace/storage identities, process IDs and passed scenarios in `test-results/multi-window/results.json`. Failures retain signal diagnostics. CI runs this test in the existing Linux minimum/stable, macOS stable and Windows stable editor matrix.

## Profile storage and migration

The former whole-array global Memento update could lose a different window's profile save. Re-reading after confirmation fixes stale previews but cannot serialize simultaneous updates. Custom profiles now live in `profiles-v2.json` inside VS Code's extension-owned `globalStorageUri`, shared by windows using that storage location. They are independent of project files. Local desktop `file` and `vscode-userdata` paths are supported; unknown filesystem schemes produce an explicit workflow error. Storage was also validated on a Linux Remote SSH host; see [remote workspace review](remote-workspace.md).

A cross-process proper-lockfile lock serializes each read/compare/merge/write. The target profile must still equal the value reviewed before confirmation. Writes validate the complete bounded document, flush a private temporary file and atomically rename it. Lock contention has bounded retries; abandoned locks become eligible for recovery after 60 seconds. A failure or corrupt store is surfaced instead of silently resetting saved profiles. This is local filesystem coordination, not a distributed transaction across machines.

On the first successful mutation, existing valid v1 Memento profiles are copied into the v2 document with the mutation. Reads alone do not migrate. The old Memento is retained as a backup, and later reads use the v2 document. Downgrading to an older extension will see the older backup, not later v2 edits; export JSON before downgrading. Export/import remains the supported way to move profiles between hosts or editor profiles. The store is limited to 50 profiles and 8 MiB. Recovery journals continue to use workspace Mementos.

Filesystem notifications refresh open dashboards; window focus refreshes again. **Refresh profiles** provides an explicit retry when notifications are unavailable. All reads use the current file rather than a cached profile list.

## Limits

VS Code does not offer atomic compare-and-update for editor settings. External edits between the last comparison and the configuration write, or indistinguishable same-value edits, remain a limitation. These tests exercise controlled interleavings in two distinct workspaces sharing a folder; they do not establish safety for every simultaneous settings-write schedule, two hosts opening the identical workspace identity, network filesystems, Settings Sync or remote machines. No automatic restoration on window shutdown is promised. Screen-reader review remains outstanding. The separate [Remote SSH review](remote-workspace.md) documents tested remote behavior and limits.
