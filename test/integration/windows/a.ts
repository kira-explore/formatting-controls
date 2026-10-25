import * as vscode from "vscode";
import { runWindow } from "./actor";
export const run = () =>
  runWindow(
    vscode.workspace.workspaceFile?.path.endsWith("/b.code-workspace")
      ? "b"
      : "a",
  );
