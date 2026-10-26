import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { activate as activateProduct } from "../../../src/extension";
import { run } from "./suite";
// This development-only wrapper exposes context to the remote regression suite.
export function activate(context: vscode.ExtensionContext) {
  activateProduct(context);
  setTimeout(() => {
    void (async () => {
      try {
        await run();
      } catch (error) {
        const workspace = vscode.workspace.workspaceFile;
        if (workspace)
          writeFileSync(
            join(dirname(workspace.fsPath), "actor-error.json"),
            String(error),
          );
        console.error(error);
      } finally {
        await vscode.commands.executeCommand("workbench.action.quit");
      }
    })();
  }, 0);
  return context;
}
