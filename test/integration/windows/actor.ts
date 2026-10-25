import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { configuration, own, write } from "../../../src/configuration";
import { FileProfiles } from "../../../src/profile-store";
import { type Confirm, Workflows } from "../../../src/workflows";
export async function runWindow(role: "a" | "b"): Promise<void> {
  assert.ok(vscode.workspace.workspaceFile);
  const root = dirname(vscode.workspace.workspaceFile.fsPath);
  const signal = (name: string, value: unknown = true) =>
    writeFileSync(join(root, `${name}.json`), JSON.stringify(value));
  const present = (name: string) => existsSync(join(root, `${name}.json`));
  const wait = async (
    check: () => boolean,
    label: string,
    checkErrors = true,
  ) => {
    const deadline = Date.now() + 60000;
    while (!check()) {
      if (checkErrors && (present("a-error") || present("b-error")))
        throw new Error(`Other window failed while waiting: ${label}`);
      if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  const extension = vscode.extensions.getExtension(
    "rajudhami.formatting-controls",
  );
  assert.ok(extension);
  await extension.activate();
  const storage = extension.exports as {
    globalStorageUri: vscode.Uri;
    globalState: vscode.Memento;
    workspaceState: vscode.Memento;
  };
  const repository = new FileProfiles(
    storage.globalStorageUri,
    storage.globalState,
  );
  const resources: vscode.Disposable[] = [repository];
  const create = (confirm: Confirm = async () => true) => {
    const w = new Workflows(
      storage.globalState,
      storage.workspaceState,
      confirm,
      undefined,
      repository,
    );
    resources.push(w);
    return w;
  };
  const workflows = create();
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder);
  const selection = {
    target: vscode.ConfigurationTarget.WorkspaceFolder,
    uri: folder.uri,
  };
  const scope = { target: "folder" as const, folder: folder.uri.toString() };
  const names = () =>
    workflows
      .summaries(selection, scope)
      .filter((p) => !p.builtin)
      .map((p) => p.name);
  const user = { target: vscode.ConfigurationTarget.Global, uri: folder.uri };
  let error: unknown;
  try {
    await vscode.commands.executeCommand("formattingControls.dashboard");
    signal(`${role}-ready`, {
      pid: process.pid,
      session: vscode.env.sessionId,
      profileStorage: storage.globalStorageUri.toString(),
      workspace: vscode.workspace.workspaceFile.toString(),
    });
    await wait(
      () => present("a-ready") && present("b-ready"),
      "both real windows",
    );
    if (role === "a") {
      await write(user, "editor.formatOnSave", true);
      signal("user-baseline");
      await wait(() => present("b-user-edited"), "B edits shared User setting");
      await wait(
        () => own(user, "editor.formatOnSave") === false,
        "User edit visible in A",
      );
      await write(user, "editor.formatOnSave", undefined);
      signal("user-verified");
      await write(selection, "editor.formatOnSave", true);
      await write(selection, "editor.formatOnPaste", true);
      await write(selection, "editor.codeActionsOnSave", {
        "source.fixAll.biome": "explicit",
        "source.organizeImports": "always",
      });
      signal("baseline");
      await wait(() => present("b-baseline"), "baseline visible in B");
      await workflows.pause(
        selection,
        scope,
        configuration(selection).get("editor.codeActionsOnSave"),
      );
      signal("paused");
      await wait(() => present("b-edited"), "B edits during pause");
      await wait(
        () =>
          own(selection, "editor.formatOnSave") === undefined &&
          (
            own(selection, "editor.codeActionsOnSave") as Record<
              string,
              unknown
            >
          )?.["source.fixAll.biome"] === "always",
        "B edits propagated",
      );
      await workflows.restore();
      assert.equal(own(selection, "editor.formatOnSave"), undefined);
      assert.equal(own(selection, "editor.formatOnPaste"), true);
      const actions = own(selection, "editor.codeActionsOnSave") as Record<
        string,
        unknown
      >;
      assert.equal(actions["source.fixAll.biome"], "always");
      assert.equal(actions["source.organizeImports"], "always");
      assert.equal(actions["source.fixAll.windowB"], "explicit");
      assert.equal(workflows.recovery()?.phase, "conflicts");
      signal("resumed");
      await wait(() => present("b-resumed"), "B verified resume");
      await workflows.discard();
      await workflows.save("Shared profile", selection, scope);
      signal("profile-saved");
      await wait(() => present("b-profile-visible"), "B sees global profile");
      const overwrite = create(async (title) => {
        if (title.startsWith("Overwrite")) {
          signal("overwrite-open");
          await wait(() => present("b-added"), "B adds profile");
          await wait(
            () => names().includes("Window B added"),
            "global profile synchronization",
          );
        }
        return true;
      });
      await overwrite.save("Shared profile", selection, scope);
      assert.ok(
        names().includes("Window B added"),
        "Overwriting a profile must preserve a different profile added in window B",
      );
      signal("overwrite-done");
      await wait(() => present("b-overwrite-verified"), "B verifies overwrite");
      const remove = create(async (title) => {
        if (title.startsWith("Delete")) {
          signal("delete-open");
          await wait(
            () => present("b-added-during-delete"),
            "B added during delete",
          );
          await wait(
            () => names().includes("B after delete"),
            "new profile visible during delete",
          );
        }
        return true;
      });
      await remove.remove("Shared profile", scope);
      assert.ok(
        names().includes("B after delete"),
        "Delete must preserve profiles saved in another window",
      );
      signal("delete-done");
      await wait(() => present("b-delete-verified"), "B verifies delete");
      const stale = create(async (title) => {
        if (title.startsWith("Delete")) {
          signal("stale-delete-open");
          await wait(() => present("b-updated-target"), "B replaces target");
          await wait(
            () =>
              repository.read().find((p) => p.name === "Window B added")
                ?.settings["editor.formatOnSaveMode"] ===
              "modificationsIfAvailable",
            "updated target synchronized",
          );
        }
        return true;
      });
      await assert.rejects(
        stale.remove("Window B added", scope),
        /saved profile changed/,
      );
      assert.ok(names().includes("Window B added"));
      signal("stale-delete-done");
      await wait(
        () => present("b-stale-verified"),
        "B verifies protected target",
      );
      await write(selection, "editor.formatOnSave", true);
      signal("apply-baseline");
      await wait(() => present("b-apply-baseline"), "B sees apply baseline");
      const apply = create(async (title) => {
        if (title.startsWith("Apply")) {
          signal("apply-open");
          await wait(
            () => present("b-edited-preview"),
            "B edits previewed setting",
          );
          await wait(
            () => own(selection, "editor.formatOnSave") === undefined,
            "preview edit propagated",
          );
        }
        return true;
      });
      await assert.rejects(
        apply.apply("Minimal", selection, scope),
        /Settings changed/,
      );
      assert.equal(own(selection, "editor.formatOnSave"), undefined);
      assert.equal(apply.recovery(), null);
      signal("apply-rejected");
      await wait(
        () => present("b-apply-verified"),
        "B verifies rejected apply",
      );
      await write(selection, "editor.formatOnSave", true);
      signal("overlap-baseline");
      await wait(
        () => present("b-overlap-baseline"),
        "B sees overlap baseline",
      );
      const overlap = create(async () => {
        signal("pause-preview-open");
        await wait(() => present("b-paused"), "B pauses during A preview");
        await wait(
          () => own(selection, "editor.formatOnSave") === false,
          "B pause visible in A",
        );
        return true;
      });
      await assert.rejects(
        overlap.pause(
          selection,
          scope,
          configuration(selection).get("editor.codeActionsOnSave"),
        ),
        /Settings changed/,
      );
      assert.equal(overlap.recovery(), null);
      assert.equal(own(selection, "editor.formatOnSave"), false);
      signal("overlap-rejected");
      await wait(
        () => present("b-overlap-restored"),
        "B resumes its own journal",
      );
      await wait(
        () => own(selection, "editor.formatOnSave") === true,
        "B resume visible in A",
      );
      signal("concurrent-a-ready");
      await wait(
        () => present("concurrent-b-ready"),
        "concurrent save barrier",
      );
      signal("concurrent-go", Date.now() + 1000);
      const time = JSON.parse(
        readFileSync(join(root, "concurrent-go.json"), "utf8"),
      ) as number;
      await new Promise((r) => setTimeout(r, Math.max(0, time - Date.now())));
      await workflows.save("Concurrent A", selection, scope);
      signal("concurrent-a-saved");
      await wait(() => present("concurrent-b-saved"), "B concurrent save");
      await new Promise((r) => setTimeout(r, 500));
      assert.ok(
        names().includes("Concurrent A") && names().includes("Concurrent B"),
        "Simultaneous new-profile saves must retain both profiles",
      );
      signal("concurrent-a-verified");
    } else {
      await wait(() => present("user-baseline"), "A User baseline");
      await wait(
        () => own(user, "editor.formatOnSave") === true,
        "User baseline visible in B",
      );
      await write(user, "editor.formatOnSave", false);
      signal("b-user-edited");
      await wait(() => present("user-verified"), "A verifies User edit");
      await wait(() => present("baseline"), "baseline from A");
      await wait(
        () => own(selection, "editor.formatOnSave") === true,
        "baseline configuration synchronization",
      );
      signal("b-baseline");
      await wait(() => present("paused"), "A pause");
      await wait(
        () => own(selection, "editor.formatOnSave") === false,
        "pause visible in B",
      );
      await write(selection, "editor.formatOnSave", undefined);
      await write(selection, "editor.codeActionsOnSave", {
        ...(own(selection, "editor.codeActionsOnSave") as Record<
          string,
          unknown
        >),
        "source.fixAll.biome": "always",
        "source.fixAll.windowB": "explicit",
      });
      signal("b-edited");
      await wait(() => present("resumed"), "A resume");
      await wait(
        () =>
          own(selection, "editor.formatOnPaste") === true &&
          (
            own(selection, "editor.codeActionsOnSave") as Record<
              string,
              unknown
            >
          )?.["source.organizeImports"] === "always",
        "restored settings visible in B",
      );
      assert.equal(own(selection, "editor.formatOnSave"), undefined);
      signal("b-resumed");
      await wait(() => present("profile-saved"), "A saved global profile");
      await wait(
        () => names().includes("Shared profile"),
        "shared profile visible",
      );
      signal("b-profile-visible");
      await wait(() => present("overwrite-open"), "A overwrite confirmation");
      await workflows.save("Window B added", selection, scope);
      signal("b-added");
      await wait(() => present("overwrite-done"), "A overwrite");
      assert.ok(names().includes("Window B added"));
      signal("b-overwrite-verified");
      await wait(() => present("delete-open"), "A delete confirmation");
      await workflows.save("B after delete", selection, scope);
      signal("b-added-during-delete");
      await wait(() => present("delete-done"), "A delete");
      await wait(
        () => !names().includes("Shared profile"),
        "deleted profile synchronized",
      );
      assert.ok(names().includes("B after delete"));
      signal("b-delete-verified");
      await wait(
        () => present("stale-delete-open"),
        "A stale delete confirmation",
      );
      await write(
        selection,
        "editor.formatOnSaveMode",
        "modificationsIfAvailable",
      );
      await workflows.save("Window B added", selection, scope);
      signal("b-updated-target");
      await wait(
        () => present("stale-delete-done"),
        "A rejected stale deletion",
      );
      assert.ok(names().includes("Window B added"));
      signal("b-stale-verified");
      await wait(() => present("apply-baseline"), "A apply baseline");
      await wait(
        () => own(selection, "editor.formatOnSave") === true,
        "apply baseline synchronized",
      );
      signal("b-apply-baseline");
      await wait(() => present("apply-open"), "A apply preview");
      await write(selection, "editor.formatOnSave", undefined);
      signal("b-edited-preview");
      await wait(() => present("apply-rejected"), "A stale apply rejected");
      assert.equal(own(selection, "editor.formatOnSave"), undefined);
      signal("b-apply-verified");
      await wait(() => present("overlap-baseline"), "A overlap baseline");
      await wait(
        () => own(selection, "editor.formatOnSave") === true,
        "overlap baseline synchronized",
      );
      signal("b-overlap-baseline");
      await wait(() => present("pause-preview-open"), "A pause preview");
      await workflows.pause(
        selection,
        scope,
        configuration(selection).get("editor.codeActionsOnSave"),
      );
      assert.equal(workflows.recovery()?.kind, "pause");
      signal("b-paused");
      await wait(() => present("overlap-rejected"), "A rejects stale pause");
      assert.equal(workflows.recovery()?.kind, "pause");
      await workflows.restore();
      assert.equal(workflows.recovery(), null);
      assert.equal(own(selection, "editor.formatOnSave"), true);
      signal("b-overlap-restored");
      signal("concurrent-b-ready");
      await wait(() => present("concurrent-go"), "concurrent save release");
      const time = JSON.parse(
        readFileSync(join(root, "concurrent-go.json"), "utf8"),
      ) as number;
      await new Promise((r) => setTimeout(r, Math.max(0, time - Date.now())));
      await workflows.save("Concurrent B", selection, scope);
      signal("concurrent-b-saved");
      await wait(
        () => present("concurrent-a-verified"),
        "A verifies concurrent saves",
      );
      assert.ok(
        names().includes("Concurrent A") && names().includes("Concurrent B"),
      );
    }
  } catch (reason) {
    error = reason;
    signal(`${role}-error`, String(reason));
  } finally {
    signal(`${role}-result`, {
      vscode: vscode.version,
      platform: process.platform,
      node: process.version,
      checks:
        error === undefined
          ? [
              "shared User setting propagation",
              "pause/resume preserves other-window edits",
              "overwrite preserves added profiles",
              "delete preserves added profiles",
              "stale target deletion rejected",
              "stale apply rejected",
              "overlapping pause rejected; owning journal resumes",
              "simultaneous different-name saves retained",
            ]
          : [],
      passed: error === undefined,
      error: error === undefined ? null : String(error),
      pid: process.pid,
      session: vscode.env.sessionId,
      profileStorage: storage.globalStorageUri.toString(),
      workspace: vscode.workspace.workspaceFile?.toString(),
    });
    await wait(() => present("finish"), "coordinator finish", false);
    for (const resource of resources) resource.dispose();
  }
  if (error) throw error;
}
