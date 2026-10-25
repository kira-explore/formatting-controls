import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnose } from "../../shared/diagnostics";
import type { Provider, Setting } from "../../shared/protocol";
import { adapters } from "../../shared/providers";

const providers: Provider[] = adapters.map((p) => ({
  ...p,
  installed: true,
  enabled: true,
  formattingEnabled: true,
  knownLanguage: p.languages.includes("typescript"),
  evidence: [],
}));
const setting = (key: Setting["key"], value: unknown): Setting => ({
  key,
  effective: value,
  configured: false,
  owned: null,
  sources: {},
});
test("installation alone produces possible candidates, not a verified conflict", () => {
  const findings = diagnose(
    [setting("editor.defaultFormatter", null)],
    providers,
  );
  assert.equal(
    findings.find((f) => f.id === "candidates")?.confidence,
    "possible",
  );
  assert.ok(!findings.some((f) => f.id === "formatter-unavailable"));
});
test("known disabled formatter and explicit overrides are verified", () => {
  const selected = providers.map((p) =>
    p.id === "biomejs.biome" ? { ...p, enabled: false } : p,
  );
  const findings = diagnose(
    [
      setting("editor.defaultFormatter", "biomejs.biome"),
      {
        ...setting("editor.formatOnSave", false),
        configured: true,
        owned: true,
      },
    ],
    selected,
  );
  assert.ok(
    findings.some(
      (f) => f.id === "provider-off" && f.confidence === "verified",
    ),
  );
  assert.ok(findings.some((f) => f.id === "override:editor.formatOnSave"));
});
test("Prettier has no invented source actions; ESLint formatting is conditional", () => {
  assert.deepEqual(
    adapters.find((p) => p.id === "esbenp.prettier-vscode")?.actions,
    [],
  );
  assert.equal(
    adapters.find((p) => p.id === "dbaeumer.vscode-eslint")?.formatSetting,
    "eslint.format.enable",
  );
});
