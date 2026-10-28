import assert from "node:assert/strict";
import { test } from "node:test";
import { settingSource } from "../../shared/setting-source";

test("language overrides beat all regular scopes, even when the values are equal", () => {
  const sources = {
    defaultValue: false,
    globalValue: true,
    workspaceFolderValue: false,
    globalLanguageValue: false,
  };
  assert.equal(
    settingSource(
      { configured: false, owned: null, effective: false, sources },
      { target: "workspace" },
      "typescript",
    ).label,
    "Inherited from User settings · typescript",
  );
});
test("owned values name their write destination and explain the actual winning source", () => {
  assert.deepEqual(
    settingSource(
      {
        configured: true,
        owned: true,
        effective: false,
        sources: { globalLanguageValue: true, workspaceLanguageValue: false },
      },
      { target: "user", language: "typescript" },
      "typescript",
    ),
    {
      label: "Saved in User settings · typescript",
      override: "Overridden by Workspace · typescript · effective: Off",
    },
  );
  assert.equal(
    settingSource(
      {
        configured: false,
        owned: null,
        effective: true,
        sources: { defaultValue: false, defaultLanguageValue: true },
      },
      { target: "folder" },
      "json",
    ).label,
    "Using VS Code default · json",
  );
});
test("organisation policy takes precedence over language settings", () => {
  assert.equal(
    settingSource(
      {
        configured: false,
        owned: null,
        effective: false,
        sources: { workspaceFolderLanguageValue: true, policyValue: false },
      },
      { target: "workspace" },
      "typescript",
    ).label,
    "Inherited from Organisation policy",
  );
});
