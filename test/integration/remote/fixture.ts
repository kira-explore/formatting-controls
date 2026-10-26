import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
        if (workspace) {
          const raw = (path: string) =>
            existsSync(path) ? readFileSync(path, "utf8") : null;
          writeFileSync(
            join(dirname(workspace.fsPath), "actor-error.json"),
            JSON.stringify(
              {
                error: error instanceof Error ? error.stack : String(error),
                workspace: raw(workspace.fsPath),
                folder: raw(
                  join(
                    dirname(workspace.fsPath),
                    "first/.vscode/settings.json",
                  ),
                ),
              },
              null,
              2,
            ),
          );
        }
        console.error(error);
      } finally {
        await vscode.commands.executeCommand("workbench.action.quit");
      }
    })();
  }, 0);
  return context;
}
