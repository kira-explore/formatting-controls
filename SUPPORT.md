# Support

Use the [repository issue tracker](https://github.com/kira-explore/formatting-controls/issues) for bugs and feature requests. Include VS Code and extension versions, OS, local/remote workspace type, selected scope/language, provider versions, expected behavior and reproduction steps. Remove secrets and private paths from screenshots and inspection reports.

For confusing formatting behavior, open Diagnostics, then inspect configuration sources in Formatting. An installed provider is not proof that it will format the current file. Higher-priority language or folder settings may override a broader setting.

The status card's checkbox and dropdown displays are read-only. Open the dashboard or run Formatting Controls: Quick Controls to edit settings. Hover and click show the same card; click pins it and Escape dismisses it.

Pause writes real Workspace/Folder preferences and persists across reloads until Resume / restore. The status-card pause affects only formatting; the Profiles page's temporary pause also includes configured save actions. Restore Previous Settings is available in the Command Palette without the dashboard. Restoration preserves detected external edits. Review remaining conflicts before choosing Keep current values. See [recovery limits](docs/workflows.md).

Security reports: follow [SECURITY.md](SECURITY.md) instead of posting exploit details publicly.
