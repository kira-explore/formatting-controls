import assert from "node:assert/strict";
import { test } from "node:test";
import type { Provider, Setting } from "../../shared/protocol";
import { adapters } from "../../shared/providers";
import { formatterSource, formatterWarning } from "../../shared/status-details";

const setting = (
  sources: Record<string, unknown>,
  configured = false,
): Setting => ({
  key: "editor.defaultFormatter",
  owned: configured ? "biomejs.biome" : null,
  effective: "biomejs.biome",
  configured,
  sources,
});
const providers: Provider[] = adapters.map((adapter) => ({
  ...adapter,
  installed: true,
  enabled: true,
  formattingEnabled: true,
  knownLanguage: true,
  evidence: [],
}));
test("formatter provenance distinguishes inherited, effective, saved and same-value overrides", () => {
  const sources = {
    globalValue: "biomejs.biome",
    globalLanguageValue: "biomejs.biome",
  };
  assert.equal(
    formatterSource(
      setting(sources),
      { target: "workspace", language: "TypeScript" },
      "TypeScript",
    ),
    "Inherited from User settings · TypeScript.",
  );
  assert.equal(
    formatterSource(setting(sources), { target: "folder" }, "TypeScript"),
    "Effective from User settings · TypeScript.",
  );
  assert.equal(
    formatterSource(setting(sources, true), { target: "user" }, "TypeScript"),
    "Saved in User settings.\nOverridden by User settings · TypeScript.",
  );
  assert.equal(
    formatterSource(
      setting(sources, true),
      { target: "user", language: "TypeScript" },
      "TypeScript",
    ),
    "Saved in User settings · TypeScript.",
  );
  assert.match(
    formatterSource(setting({ policyValue: "biomejs.biome" }, true), {
      target: "folder",
    }),
    /Overridden by Organisation policy/,
  );
  assert.equal(
    formatterSource(setting({}), { target: "workspace" }),
    "Using VS Code default.",
  );
});
test("status warnings require verified formatter evidence", () => {
  const selected = [setting({})];
  assert.equal(formatterWarning(selected, providers), undefined);
  assert.equal(
    formatterWarning(
      selected,
      providers.map((provider) => ({ ...provider, knownLanguage: false })),
    ),
    undefined,
  );
  assert.equal(
    formatterWarning([{ ...setting({}), effective: null }], providers),
    undefined,
  );
  for (const property of ["enabled", "formattingEnabled"] as const)
    assert.equal(
      formatterWarning(
        selected,
        providers.map((provider) =>
          provider.id === "biomejs.biome"
            ? { ...provider, [property]: false }
            : provider,
        ),
      )?.id,
      "provider-off",
    );
  assert.equal(
    formatterWarning(
      selected,
      providers.map((provider) => ({ ...provider, installed: false })),
    )?.id,
    "formatter-unavailable",
  );
});
