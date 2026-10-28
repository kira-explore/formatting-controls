import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CoreState,
  isCoreAction,
  isCoreState,
} from "../../shared/core-controls";

const fixture = (): CoreState => ({
  protocol: 1,
  session: "test-session",
  revision: 1,
  file: "app.ts",
  path: "src/app.ts",
  language: "TypeScript",
  workspace: "Project",
  folder: "",
  status: "Mixed",
  destination: "workspace",
  destinations: [
    { id: "user", label: "User" },
    { id: "workspace", label: "Workspace" },
  ],
  languageRule: "",
  languages: [{ id: "", label: "All languages" }],
  formatter: "",
  formatters: [{ id: "", label: "Use inherited formatter" }],
  formatterDisabled: false,
  flags: [
    {
      key: "editor.formatOnSave",
      label: "Format on save",
      checked: true,
      effective: true,
      source: "Saved in Workspace",
      disabled: false,
    },
    {
      key: "editor.formatOnPaste",
      label: "Format on paste",
      checked: false,
      effective: false,
      source: "Saved in Workspace",
      disabled: false,
    },
    {
      key: "editor.formatOnType",
      label: "Format on type",
      checked: true,
      effective: true,
      source: "Inherited from User settings",
      disabled: false,
    },
  ],
  paused: false,
  canPause: true,
});

test("core state validates protocol, bounded options and ordered formatting-only flags", () => {
  assert.ok(isCoreState(fixture()));
  for (const state of [
    null,
    {},
    { ...fixture(), protocol: 2 },
    { ...fixture(), revision: -1 },
    { ...fixture(), revision: Number.NaN },
    { ...fixture(), session: "x".repeat(81) },
    { ...fixture(), destinations: new Array(2001).fill({ id: "", label: "" }) },
    { ...fixture(), file: "x".repeat(4097) },
    { ...fixture(), flags: [...fixture().flags].reverse() },
    {
      ...fixture(),
      flags: fixture().flags.map((flag) => ({ ...flag, checked: "true" })),
    },
  ])
    assert.equal(isCoreState(state), false);
});

test("core actions accept direct controls without allowing save-action or arbitrary command execution", () => {
  const envelope = { session: "test-session", revision: 1 };
  for (const action of [
    { type: "flag", key: "editor.formatOnSave", value: false },
    { type: "scope", value: "workspace" },
    { type: "language", value: "typescript" },
    { type: "formatter", value: "vscode.typescript-language-features" },
    { type: "formatter", value: "" },
    { type: "pause" },
    { type: "dashboard" },
    { type: "settings" },
  ])
    assert.ok(isCoreAction({ ...envelope, ...action }));
  for (const action of [
    { type: "flag", key: "editor.codeActionsOnSave", value: true },
    { type: "flag", key: "editor.formatOnSave", value: "false" },
    { type: "command", value: "workbench.action.closeWindow" },
    { type: "scope", value: { target: "workspace" } },
    { type: "formatter", value: "x".repeat(4097) },
    { type: "__proto__" },
  ])
    assert.equal(isCoreAction({ ...envelope, ...action }), false);
});

test("core option labels remain data rather than markup", () => {
  const state = fixture();
  state.file = '<img src=x onerror="alert(1)">';
  state.formatters[0] = { id: "", label: "<script>not executable</script>" };
  assert.ok(
    isCoreState(state),
    "The core renderer assigns textContent and native option text, never HTML.",
  );
});
