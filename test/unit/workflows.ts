import assert from "node:assert/strict";
import { test } from "node:test";
import {
  absent,
  applyBatch,
  type BatchPort,
  type Change,
  type Journal,
  parseJournal,
  parseProfile,
  plan,
  restoreBatch,
  slot,
} from "../../shared/workflows";

const changes: Change[] = [
  { key: "editor.formatOnSave", before: slot(true), after: slot(false) },
  { key: "editor.formatOnPaste", before: absent, after: slot(false) },
];
function fixture() {
  let journal: Journal | undefined;
  const values = new Map(changes.map((c) => [c.key, c.before]));
  const events: string[] = [];
  const port: BatchPort = {
    save: async (value) => {
      journal = value;
      events.push(`save:${value?.phase ?? "clear"}`);
    },
    read: (c) => values.get(c.key) ?? absent,
    write: async (c, v) => {
      values.set(c.key, v);
      events.push(`write:${c.key}`);
    },
  };
  const batch: Journal = {
    version: 1,
    kind: "pause",
    phase: "prepared",
    name: "Pause",
    scope: { target: "workspace" },
    owner: "test",
    created: new Date().toISOString(),
    changes,
  };
  return {
    port,
    batch,
    values,
    events,
    get journal() {
      return journal;
    },
  };
}
test("profile JSON is bounded and rejects unknown settings, invalid values and language Auto Save", () => {
  const good = {
    version: 1,
    name: "Custom",
    settings: {
      "editor.formatOnSave": true,
      "editor.codeActionsOnSave": { "source.fixAll.biome": "explicit" },
    },
  };
  assert.deepEqual(parseProfile(JSON.parse(JSON.stringify(good))), good);
  for (const settings of [
    { "workbench.colorTheme": "x" },
    { "editor.formatOnSave": "true" },
    { "editor.codeActionsOnSave": ["source.fixAll"] },
    { "editor.codeActionsOnSave": { "source.fixAll": "invalid" } },
  ])
    assert.throws(() => parseProfile({ ...good, settings }));
  assert.throws(() =>
    parseProfile({
      ...good,
      language: "typescript",
      settings: { "files.autoSave": "off" },
    }),
  );
  assert.throws(() => parseProfile({ ...good, name: "x".repeat(81) }));
});
test("action plans affect only requested entries and preserve absence semantics", () => {
  const p = parseProfile({
    version: 1,
    name: "Custom",
    settings: {
      "editor.codeActionsOnSave": { "source.fixAll.biome": "explicit" },
    },
  });
  const delta = plan(p, () => ({ "source.organizeImports": "never" }));
  assert.equal(delta.length, 1);
  assert.equal(delta[0]?.action, "source.fixAll.biome");
  assert.deepEqual(delta[0]?.before, absent);
  assert.equal(delta[0]?.containerPresent, true);
});
test("journal is durable before writes and round trips for crash recovery", async () => {
  const f = fixture();
  await applyBatch(f.batch, f.port);
  assert.equal(f.events[0], "save:prepared");
  assert.equal(f.journal?.phase, "applied");
  const recovered = parseJournal(JSON.parse(JSON.stringify(f.journal)));
  await restoreBatch(recovered, f.port);
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot(true));
  assert.deepEqual(f.values.get("editor.formatOnPaste"), absent);
  assert.equal(f.journal, undefined);
});
test("failed storage cannot mutate preferences", async () => {
  const f = fixture();
  await assert.rejects(
    applyBatch(f.batch, {
      ...f.port,
      save: async () => {
        throw new Error("Disk full");
      },
    }),
  );
  assert.equal(f.events.length, 0);
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot(true));
});
test("partial failure rolls back applied changes", async () => {
  const f = fixture();
  let failed = false;
  await assert.rejects(
    applyBatch(f.batch, {
      ...f.port,
      write: async (c, v) => {
        if (c.key === "editor.formatOnPaste" && !failed) {
          failed = true;
          throw new Error("Write failed");
        }
        await f.port.write(c, v);
      },
    }),
    /Write failed/,
  );
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot(true));
  assert.equal(f.journal, undefined);
});
test("restore preserves externally changed values while restoring unrelated ones", async () => {
  const f = fixture();
  await applyBatch(f.batch, f.port);
  f.values.set("editor.formatOnSave", slot("external"));
  assert.equal(await restoreBatch(f.journal as Journal, f.port), 1);
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot("external"));
  assert.deepEqual(f.values.get("editor.formatOnPaste"), absent);
  assert.equal(f.journal?.phase, "conflicts");
});
test("invalid recovery data cannot introduce arbitrary settings", () => {
  const f = fixture();
  assert.throws(() =>
    parseJournal({
      ...f.batch,
      changes: [{ ...changes[0], key: "files.exclude" }],
    }),
  );
});

test("a stale value equal to the requested value is not rolled back before any write", async () => {
  const f = fixture();
  f.values.set("editor.formatOnSave", slot(false));
  await assert.rejects(applyBatch(f.batch, f.port), /Settings changed/);
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot(false));
  assert.ok(!f.events.some((e) => e.startsWith("write:")));
  assert.equal(f.journal, undefined);
});

test("restore never expands the approved preview after external edits", async () => {
  const f = fixture();
  await applyBatch(f.batch, f.port);
  const journal = f.journal as Journal;
  const reviewed = new Set([journal.changes[1] as Change]);
  // The first value was a conflict during preview, then changed to the batch's
  // value while confirmation was open. It still was not approved for restore.
  assert.equal(await restoreBatch(journal, f.port, reviewed), 1);
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot(false));
  assert.deepEqual(f.values.get("editor.formatOnPaste"), absent);
  assert.equal(f.journal?.changes[0]?.key, "editor.formatOnSave");
});

test("an edit during journal persistence is preserved before the write starts", async () => {
  const f = fixture();
  let edited = false;
  await assert.rejects(
    applyBatch(f.batch, {
      ...f.port,
      save: async (journal) => {
        await f.port.save(journal);
        if (!edited && journal?.changes[0]?.attempted) {
          edited = true;
          f.values.set("editor.formatOnSave", slot(false));
        }
      },
    }),
    /Settings changed/,
  );
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot(false));
  assert.ok(!f.events.some((e) => e.startsWith("write:")));
  assert.equal(f.journal, undefined);
});

test("an interrupted restore remains recoverable on the next attempt", async () => {
  const f = fixture();
  await applyBatch(f.batch, f.port);
  const original = f.journal as Journal;
  let failed = false;
  await assert.rejects(
    restoreBatch(original, {
      ...f.port,
      write: async (change, value) => {
        if (change.key === "editor.formatOnSave" && !failed) {
          failed = true;
          throw new Error("Restore interrupted");
        }
        await f.port.write(change, value);
      },
    }),
    /Restore interrupted/,
  );
  assert.equal(f.journal?.phase, "restoring");
  await restoreBatch(
    parseJournal(JSON.parse(JSON.stringify(f.journal))),
    f.port,
  );
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot(true));
  assert.deepEqual(f.values.get("editor.formatOnPaste"), absent);
  assert.equal(f.journal, undefined);
});

test("failure to persist the completed batch rolls back settings", async () => {
  const f = fixture();
  await assert.rejects(
    applyBatch(f.batch, {
      ...f.port,
      save: async (journal) => {
        if (journal?.phase === "applied")
          throw new Error("Commit storage failed");
        await f.port.save(journal);
      },
    }),
    /Commit storage failed/,
  );
  assert.deepEqual(f.values.get("editor.formatOnSave"), slot(true));
  assert.deepEqual(f.values.get("editor.formatOnPaste"), absent);
  assert.equal(f.journal, undefined);
});

test("profile action maps reject prototype keys and excessive entries", () => {
  for (const actions of [
    JSON.parse('{"__proto__":"always"}'),
    Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [`source.test${i}`, "always"]),
    ),
  ]) {
    assert.throws(() =>
      parseProfile({
        version: 1,
        name: "Unsafe",
        settings: { "editor.codeActionsOnSave": actions },
      }),
    );
  }
});
