import * as vscode from "vscode";
import { type HoverContext, statusHover } from "../shared/status-hover";
export function statusTooltip(context: HoverContext): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(statusHover(context), false);
  tooltip.supportHtml = true;
  tooltip.isTrusted = {
    enabledCommands: [
      "formattingControls.statusControl",
      "formattingControls.dashboard",
      "workbench.action.openSettings",
    ],
  };
  return tooltip;
}
