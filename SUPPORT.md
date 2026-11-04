# Support

Use the [repository issue tracker](https://github.com/kira-explore/formatting-controls/issues) for bugs and feature requests. Include VS Code and extension versions, OS, local/remote workspace type, selected scope/language, provider versions, expected behavior and reproduction steps. Remove secrets and private paths from screenshots and inspection reports.

For confusing formatting behavior, open Diagnostics, then inspect configuration sources in Formatting. An installed provider is not proof that it will format the current file. Higher-priority language or folder settings may override a broader setting.

The status card's checkbox and dropdown displays are read-only. Open the dashboard or run Formatting Controls: Quick Controls to edit settings. Hover and click show the same card; click pins it and Escape dismisses it.

Pause writes real Workspace/Folder preferences and persists across reloads until Resume / restore. The status-card pause affects only Format on save, paste and type; the Profiles page's temporary pause also includes configured save actions. Formatter selection and Auto Save remain unchanged.

Status-card Resume and **Formatting Controls: Pause / Resume Automatic Formatting** restore unchanged preferences, preserve newer saved edits, and finish the pause. The next Pause captures the current preferences. Restoration compares final saved values, not edit history: a value that still equals the value Pause wrote is eligible for restoration even if you changed it and then changed it back.

Dashboard/profile Restore and **Formatting Controls: Restore Previous Settings** retain unresolved conflicts for review. Review those values before choosing **Keep current values** to discard the remaining restore point. Failed writes or unsaved settings retain recovery data; save genuine edits and retry. See [recovery limits](docs/workflows.md).

Security reports: follow [SECURITY.md](SECURITY.md) instead of posting exploit details publicly.
