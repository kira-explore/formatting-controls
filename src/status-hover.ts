import * as vscode from "vscode";
import { type HoverContext, statusHover } from "../shared/status-hover";
export function statusTooltip(context: HoverContext): vscode.MarkdownString {
  const kind = vscode.window.activeColorTheme.kind;
  const theme =
    kind === vscode.ColorThemeKind.Light
      ? "light"
      : kind === vscode.ColorThemeKind.HighContrast
        ? "contrast"
        : kind === vscode.ColorThemeKind.HighContrastLight
          ? "contrast-light"
          : "dark";
  const tooltip = new vscode.MarkdownString(statusHover(context, theme), false);
  tooltip.supportHtml = true;
  tooltip.isTrusted = {
    enabledCommands: [
      "formattingControls.statusControl",
      "formattingControls.statusInfo",
      "formattingControls.dashboard",
      "workbench.action.openSettings",
    ],
  };
  return tooltip;
}
