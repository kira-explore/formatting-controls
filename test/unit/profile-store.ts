import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { Profile } from "../../shared/workflows";
import { FileProfiles } from "../../src/profile-store";

const profile = (name: string): Profile => ({
  version: 1,
  name,
  settings: { "editor.formatOnSave": true },
});
function fixture(legacy: Profile[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "fc-profiles-"));
  const source = {
    get<T>(): T | undefined {
      return structuredClone(legacy) as T;
    },
  };
  const a = new FileProfiles({ scheme: "file", fsPath: directory }, source);
  const b = new FileProfiles(
    { scheme: "vscode-userdata", fsPath: directory },
    source,
  );
  return {
    a,
    b,
    legacy,
    path: join(directory, "profiles-v2.json"),
    dispose() {
      a.dispose();
      b.dispose();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
test("legacy profiles migrate on successful commit without deleting the original backup", async () => {
  const f = fixture([profile("Legacy")]);
  try {
    assert.deepEqual(f.a.read(), f.legacy);
    assert.equal(existsSync(f.path), false);
    await f.a.commit("New", undefined, profile("New"));
    assert.deepEqual(
      f.b.read().map((p) => p.name),
      ["Legacy", "New"],
    );
    assert.deepEqual(f.legacy, [profile("Legacy")]);
    assert.equal(JSON.parse(readFileSync(f.path, "utf8")).version, 2);
  } finally {
    f.dispose();
  }
});
test("concurrent independent profile commits merge and existing readers see fresh data", async () => {
  const f = fixture();
  try {
    await Promise.all([
      f.a.commit("A", undefined, profile("A")),
      f.b.commit("B", undefined, profile("B")),
    ]);
    assert.deepEqual(
      f.a
        .read()
        .map((p) => p.name)
        .sort(),
      ["A", "B"],
    );
    assert.deepEqual(f.a.read(), f.b.read());
    await f.b.commit("B", profile("B"), undefined);
    assert.deepEqual(f.a.read(), [profile("A")]);
  } finally {
    f.dispose();
  }
});
test("same-name concurrent creation has one winner and stale mutation cannot overwrite it", async () => {
  const f = fixture();
  try {
    const other = {
      ...profile("Shared"),
      settings: { "editor.formatOnSave": false },
    };
    const results = await Promise.allSettled([
      f.a.commit("Shared", undefined, profile("Shared")),
      f.b.commit("Shared", undefined, other),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    const before = readFileSync(f.path, "utf8");
    await assert.rejects(
      f.a.commit("Shared", undefined, undefined),
      /saved profile changed/,
    );
    assert.equal(readFileSync(f.path, "utf8"), before);
  } finally {
    f.dispose();
  }
});
test("corrupt storage is preserved and limits are checked inside the commit lock", async () => {
  const f = fixture(
    Array.from({ length: 50 }, (_, i) => profile(`Profile ${i}`)),
  );
  try {
    await assert.rejects(
      f.a.commit("Extra", undefined, profile("Extra")),
      /At most 50/,
    );
    assert.equal(existsSync(f.path), false);
    await f.a.commit("Profile 0", profile("Profile 0"), undefined);
    await f.b.commit("Extra", undefined, profile("Extra"));
    assert.equal(f.a.read().length, 50);
    writeFileSync(f.path, "invalid JSON");
    await assert.rejects(f.a.commit("Extra", profile("Extra"), undefined));
    assert.equal(readFileSync(f.path, "utf8"), "invalid JSON");
  } finally {
    f.dispose();
  }
});
test("unknown storage schemes fail without treating remote URIs as local paths", () => {
  const f = fixture();
  const remote = new FileProfiles(
    { scheme: "vscode-remote", fsPath: f.path },
    {
      get() {
        return undefined;
      },
    },
  );
  try {
    assert.throws(() => remote.read(), /file-based extension storage/);
    assert.equal(existsSync(f.path), false);
  } finally {
    remote.dispose();
    f.dispose();
  }
});

test("an open repository receives changes committed by another instance", async () => {
  const f = fixture();
  let subscription: { dispose(): void } | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    f.a.read();
    const updated = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error("Profile notification was not received")),
        5000,
      );
      subscription = f.a.onDidChange(() => {
        if (f.a.read().some((p) => p.name === "From B")) resolve();
      });
    });
    await f.b.commit("From B", undefined, profile("From B"));
    await updated;
    assert.deepEqual(f.a.read(), [profile("From B")]);
  } finally {
    clearTimeout(timeout);
    subscription?.dispose();
    f.dispose();
  }
});
