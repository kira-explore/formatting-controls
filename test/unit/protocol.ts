import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRequest, validValue } from "../../shared/protocol";

const envelope = { id: "test-1", scope: { target: "user" }, revision: 0 };
test("only allowlisted messages and typed values pass", () => {
  assert.equal(
    parseRequest({
      ...envelope,
      type: "set",
      key: "editor.formatOnSave",
      value: true,
    }).type,
    "set",
  );
  assert.equal(
    parseRequest({
      ...envelope,
      type: "action",
      action: "source.fixAll.biome",
      value: "always",
    }).type,
    "action",
  );
  for (const value of [
    null,
    [],
    { ...envelope, type: "execute", command: "workbench.action.reloadWindow" },
    { ...envelope, type: "open", destination: "file:///etc/passwd" },
    { ...envelope, type: "set", key: "editor.formatOnSave", value: "true" },
    { ...envelope, type: "set", key: "untrusted.setting", value: true },
    { ...envelope, type: "set", key: "editor.codeActionsOnSave", value: {} },
    { ...envelope, type: "action", action: "__proto__", value: "always" },
  ])
    assert.throws(() => parseRequest(value));
});
test("scope and revision validation reject malformed and stale-shaped requests", () => {
  for (const scope of [
    { target: "remote" },
    { target: ["user"] },
    { target: "user", language: "" },
    { target: "user", folder: 1 },
  ])
    assert.throws(() => parseRequest({ ...envelope, type: "read", scope }));
  assert.throws(() =>
    parseRequest({
      ...envelope,
      type: "reset",
      key: "editor.formatOnSave",
      revision: -1,
    }),
  );
  assert.throws(() =>
    parseRequest({
      ...envelope,
      type: "set",
      scope: { target: "workspace", language: "typescript" },
      key: "files.autoSave",
      value: "off",
    }),
  );
  assert.throws(() =>
    parseRequest({ ...envelope, type: "read", extra: "x".repeat(17000) }),
  );
});
test("enum, formatter ID and delay boundaries are validated", () => {
  assert.ok(validValue("files.autoSaveDelay", 0));
  for (const v of [-1, 1.5, Infinity, "1", 2147483648])
    assert.ok(!validValue("files.autoSaveDelay", v));
  assert.ok(validValue("editor.defaultFormatter", "biomejs.biome"));
  assert.ok(!validValue("editor.defaultFormatter", "<script>"));
  assert.ok(!validValue("files.autoSave", ["off"]));
  assert.ok(!validValue("editor.formatOnSaveMode", "unknown"));
});
