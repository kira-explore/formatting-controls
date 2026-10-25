import assert from "node:assert/strict";
import { test } from "node:test";
import { isCurrentSnapshot } from "../../shared/state";

test("out-of-order snapshots cannot roll back state or navigation", () => {
  const current = { revision: 5, navigation: 3 };
  assert.equal(
    isCurrentSnapshot(current, { revision: 4, navigation: 3 }),
    false,
  );
  assert.equal(
    isCurrentSnapshot(current, { revision: 5, navigation: 2 }),
    false,
  );
  assert.equal(
    isCurrentSnapshot(current, { revision: 4, navigation: 4 }),
    false,
  );
  assert.equal(
    isCurrentSnapshot(current, { revision: 5, navigation: 4 }),
    true,
  );
  assert.equal(
    isCurrentSnapshot(current, { revision: 6, navigation: 3 }),
    true,
  );
  assert.equal(isCurrentSnapshot(undefined, current), true);
});
