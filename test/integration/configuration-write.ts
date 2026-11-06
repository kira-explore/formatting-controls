import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as vscode from "vscode";
import {
  own,
  projectSettingsFile,
  UnsavedSettingsError,
  write,
} from "../../src/configuration";
import { Workflows } from "../../src/workflows";
import { MemoryStore } from "./workflows";

export const runConfigurationWriteTests = async (
  uri: vscode.Uri,
): Promise<void> => {
  const selection = { target: vscode.ConfigurationTarget.WorkspaceFolder, uri };
  const key = "editor.formatOnPaste";
  const original = own(selection, key);
  await write(selection, key, false);
  const file = projectSettingsFile(selection);
  assert.ok(file);
  const document = await vscode.workspace.openTextDocument(file);
  const replace = async (text: string) => {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      file,
      new vscode.Range(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      ),
      text,
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
  };
  const appendUserEdit = async () => {
    const edit = new vscode.WorkspaceEdit();
    edit.insert(
      file,
      document.positionAt(document.getText().length),
      "\n// concurrent editor change\n",
    );
    assert.ok(await vscode.workspace.applyEdit(edit));
  };
  try {
    // Reproduce the native update promise resolving after its edit but before
    // persistence. The adapter deliberately does not save the disposable file.
    let updates = 0;
    await write(selection, key, true, async () => {
      if (++updates > 1) return;
      const data = JSON.parse(document.getText());
      data[key] = true;
      await replace(JSON.stringify(data, null, 2));
      assert.ok(document.isDirty);
    });
    assert.equal(
      updates,
      2,
      "Refresh native configuration after completing its cancelled save",
    );
    assert.equal(document.isDirty, false);
    assert.equal(own(selection, key), true);
    assert.equal(JSON.parse(readFileSync(file.fsPath, "utf8"))[key], true);
    let participantRan = false;
    const participant = vscode.workspace.onWillSaveTextDocument((event) => {
      if (event.document !== document || participantRan) return;
      participantRan = true;
      event.waitUntil(
        Promise.resolve([
          vscode.TextEdit.insert(
            document.positionAt(document.getText().length),
            "\n",
          ),
        ]),
      );
    });
    let formattedUpdates = 0;
    try {
      await write(selection, key, false, async () => {
        formattedUpdates++;
        const data = JSON.parse(document.getText());
        data[key] = false;
        await replace(JSON.stringify(data, null, 2));
      });
      assert.ok(participantRan);
      assert.equal(
        formattedUpdates,
        1,
        "A save-participant edit must not authorize a native retry",
      );
      assert.equal(document.isDirty, false);
      assert.equal(own(selection, key), false);
    } finally {
      participant.dispose();
    }
    await write(selection, key, true);
    const clean = document.getText();

    // A no-op update cannot claim a later editor change as its own.
    await assert.rejects(
      write(selection, key, true, appendUserEdit),
      UnsavedSettingsError,
    );
    assert.ok(document.isDirty);
    assert.match(document.getText(), /concurrent editor change/);
    assert.equal(readFileSync(file.fsPath, "utf8"), clean);
    await replace(clean);
    assert.ok(await document.save()); // Disposable fixture only.

    // An extra edit during a real update also prevents an automatic save.
    await assert.rejects(
      write(selection, key, false, async () => {
        const data = JSON.parse(clean);
        data[key] = false;
        await replace(JSON.stringify(data, null, 2));
        await appendUserEdit();
      }),
      UnsavedSettingsError,
    );
    assert.ok(document.isDirty);
    assert.match(document.getText(), /concurrent editor change/);
    assert.equal(readFileSync(file.fsPath, "utf8"), clean);
    const store = new MemoryStore();
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    assert.ok(folder);
    const recovery = {
      version: 1,
      kind: "pause",
      phase: "restoring",
      name: "Interrupted pause",
      scope: { target: "folder", folder: folder.uri.toString() },
      owner:
        vscode.workspace.workspaceFile?.toString() ?? folder.uri.toString(),
      created: new Date().toISOString(),
      changes: [
        {
          key,
          before: { present: true, value: true },
          after: { present: true, value: false },
          attempted: true,
        },
      ],
    };
    await store.update("formattingControls.recovery.v1", recovery);
    const workflows = new Workflows(new MemoryStore(), store, async () => true);
    try {
      // Disk still contains the original value, but the attempted native edit
      // is in the dirty buffer. Recovery must not mistake that for completion.
      await assert.rejects(workflows.resumePause(), UnsavedSettingsError);
      assert.deepEqual(workflows.journal(), recovery);
      assert.ok(document.isDirty);
      assert.match(document.getText(), /concurrent editor change/);
    } finally {
      workflows.dispose();
    }
    await replace(clean);
    assert.ok(await document.save());

    await assert.rejects(
      write(selection, key, false, async () => {}),
      /did not confirm/,
    );
    assert.equal(
      own(selection, key),
      true,
      "A fulfilled but ineffective update is not success",
    );
  } finally {
    await write(selection, key, original);
  }
};
