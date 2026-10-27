# Formatting controls in version 0.5.0

Hover the status-bar item for a native formatting summary. Click it, or run **Formatting Controls: Quick Controls**, to open the docked **Formatting Controls** Panel view. The editor stays visible and no editor tab is created. The existing dashboard still opens separately for save actions, profiles, diagnostics, language rules and advanced settings.

The extension listing is named **Kira Formatting Controls**. The hover and Panel headers remain **Formatting Controls**, without an app icon. The package identifier remains `rajudhami.formatting-controls` to preserve extension identity, storage and commands.

## Supported surfaces

The public `StatusBarItem.tooltip` API accepts text or Markdown, not a webview. VS Code’s Markdown renderer disables checkbox inputs and does not expose inline dropdowns in tooltips. Consequently, the hover uses honest text values and command links, not imitation checkbox or dropdown controls. Click **Edit formatting controls** or **Pause** to open the docked view. The automatic-formatting section can be expanded or collapsed in either surface.

The Panel uses a supported `WebviewView` with real HTML checkbox/select inputs styled using VS Code theme tokens. Its selects open inline rather than launching QuickPick. These browser controls are not Copilot’s internal workbench components. VS Code controls the native hover’s position, frame, delay and sanitized appearance; the richer floating mockup remains an API-dependent concept.

Sources: [StatusBarItem](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem), [Webview hosts](https://code.visualstudio.com/api/extension-guides/webview), [Markdown input handling](https://github.com/microsoft/vscode/blob/1.143.1/src/vs/base/browser/markdownRenderer.ts).

## Context and scope

The information box identifies the last active file, its real editor language and workspace. A folder is named for multi-root workspaces, and remote sessions identify their host. A file’s relative path is available on hover. Closing the file clears its active context. A Settings editor does not replace the code-file context.

**Write to** selects User, Workspace or Workspace folder. **Apply to language** selects All languages or an explicit VS Code language ID. These selectors choose the write destination, not a new language mode for the file. Unavailable workspace/folder targets are disabled. Selecting a different folder/language makes the displayed configuration context explicit.

Checkboxes show the value owned at the destination when one exists, otherwise the effective inherited value. The header’s On / Off / Mixed state describes the effective combination. A source label says **Saved in Workspace**, **Inherited from User settings**, **Using VS Code default**, or the corresponding actual source, with language overrides identified. If a narrower/language/policy value wins, a separate explanation shows that effective override. Save actions stay out of this quick surface.

## Pause and resume

The Panel’s **Pause** affects only Save, Paste and Type formatting at a workspace/folder destination. It leaves save actions and the formatter selection unchanged. The one-line description explains its purpose outside the button. Pause first offers a review step and then reuses the existing JSON change preview and native confirmation. Resume uses the durable recovery journal and preserves newer edits. A pending profile restore point must be reviewed before pausing.

The dashboard’s broader pause workflow retains its existing behavior, including configured save actions. Its preview lists those changes explicitly.

## Security and lifecycle

The Panel reuses the dashboard’s validated message schema, bounded values, revision checks, scope/folder allowlist and serialized mutation queue. No arbitrary commands or file paths are accepted. All context text in the native hover is HTML-escaped. Its trusted commands are limited to disclosure, docked-controls/dashboard navigation and Settings. Equivalent state notifications do not rebuild the tooltip. The webview uses a nonce-based content security policy and extension-local assets.

The docked controls support keyboard access, visible focus, high-contrast theme tokens and responsive reflow when moved into a narrow view container. The icon appears in the Extensions listing only; native VS Code view-container chrome is managed by the editor.

## Commands

- **Quick Controls** (`formattingControls.quickControls`): docked formatting view.
- **Native Formatting Picker** (`formattingControls.nativeQuickControls`): optional original formatting-only QuickPick workflow.
- **Native Quick Controls** (`formattingControls.open`): original full settings picker workflow.
- **Open Dashboard** (`formattingControls.dashboard`): existing advanced dashboard.
