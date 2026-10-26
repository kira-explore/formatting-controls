import * as vscode from "vscode";
import { type HoverContext, statusHover } from "../shared/status-hover";
export function statusTooltip(context: HoverContext): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString(statusHover(context), true);
  tooltip.supportHtml = false;
  tooltip.isTrusted = {
    enabledCommands: [
      "formattingControls.quickControls",
      "formattingControls.dashboard",
    ],
  };
  return tooltip;
}
