import * as vscode from "vscode";
import { activate as activateProduct } from "../../../src/extension";
import { runWindow } from "./actor";
// Only this temporary development fixture exposes real VS Code mementos.
export function activate(context: vscode.ExtensionContext) {
  activateProduct(context);
  if (
    vscode.workspace.workspaceFile?.path.endsWith("/b.code-workspace") &&
    context.extensionMode !== vscode.ExtensionMode.Test
  )
    setTimeout(() => {
      void runWindow("b").catch((error) => console.error(error));
    }, 0);
  return {
    globalStorageUri: context.globalStorageUri,
    globalState: context.globalState,
    workspaceState: context.workspaceState,
  };
}
