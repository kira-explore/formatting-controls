import assert from "node:assert/strict";
import { test } from "node:test";
import { enabled, status, updateAction } from "../../src/model";

test("status reports all three effective states", () => {
  assert.equal(status([true, true, true]), "ON");
  assert.equal(status([false, false, false]), "OFF");
  assert.equal(status([true, false, false]), "MIXED");
});
test("single action update preserves unrelated and legacy boolean values without mutation", () => {
  const original = {
    "source.fixAll.eslint": true,
    "source.organizeImports": "never" as const,
  };
  assert.deepEqual(updateAction(original, "source.fixAll", "explicit"), {
    ...original,
    "source.fixAll": "explicit",
  });
  assert.equal(Object.keys(original).length, 2);
});
test("legacy arrays and malformed actions are rejected", () => {
  assert.throws(() =>
    updateAction(["source.fixAll"], "source.fixAll", "never"),
  );
  assert.throws(() => updateAction({}, "__proto__", "never"));
});
test("save action enabled values are explicit", () => {
  for (const v of [true, "explicit", "always"]) assert.ok(enabled(v));
  for (const v of [false, "never", undefined, "unknown"])
    assert.ok(!enabled(v));
});
