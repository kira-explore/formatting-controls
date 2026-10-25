import type { Provider, Setting } from "./protocol";
export interface Finding {
  id: string;
  confidence: "verified" | "possible" | "info";
  title: string;
  detail: string;
}
export function diagnose(
  settings: readonly Setting[],
  providers: readonly Provider[],
): Finding[] {
  const value = (key: string) => settings.find((s) => s.key === key)?.effective;
  const findings: Finding[] = [];
  if (value("editor.formatOnSave") === false)
    findings.push({
      id: "save-off",
      confidence: "verified",
      title: "Format on Save is off",
      detail:
        "VS Code will not run built-in formatting on save for this context. This can be intentional, including while paused.",
    });
  const selected = value("editor.defaultFormatter");
  if (typeof selected === "string") {
    const provider = providers.find(
      (p) => p.id.toLowerCase() === selected.toLowerCase(),
    );
    if (provider && !provider.installed)
      findings.push({
        id: "formatter-unavailable",
        confidence: "verified",
        title: "Configured formatter is unavailable in this host",
        detail: `${selected} is not exposed by the current extension host. It may be absent, disabled, or installed in another host.`,
      });
    if (
      provider?.installed &&
      (provider.enabled === false || provider.formattingEnabled === false)
    )
      findings.push({
        id: "provider-off",
        confidence: "verified",
        title: "A provider setting disables formatting",
        detail: `Check the displayed ${provider.name} configuration evidence in Formatters.`,
      });
    if (
      provider?.installed &&
      provider.languages.length > 0 &&
      !provider.knownLanguage
    )
      findings.push({
        id: "provider-language",
        confidence: "possible",
        title: "The adapter does not list this language",
        detail:
          "Review provider support for this language. Plugins and provider versions can change eligibility, so this is not a verified failure.",
      });
  } else {
    findings.push({
      id: "no-default",
      confidence: "info",
      title: "No explicit default formatter",
      detail:
        "VS Code may choose an available provider. No configured formatter does not prove that formatting is unavailable.",
    });
    const candidates = providers.filter(
      (p) =>
        p.installed &&
        p.formatting &&
        p.enabled !== false &&
        p.formattingEnabled !== false &&
        p.knownLanguage,
    );
    if (candidates.length > 1)
      findings.push({
        id: "candidates",
        confidence: "possible",
        title: "Several known formatter candidates are present",
        detail: `${candidates.map((p) => p.name).join(", ")}. Extension presence and known languages do not prove provider eligibility or a conflict.`,
      });
  }
  for (const setting of settings)
    if (
      setting.configured &&
      typeof setting.effective !== "object" &&
      setting.owned !== setting.effective
    )
      findings.push({
        id: `override:${setting.key}`,
        confidence: "verified",
        title: `An override changes ${setting.key}`,
        detail: `Selected value: ${JSON.stringify(setting.owned)}. Effective value: ${JSON.stringify(setting.effective)}. Inspect the scope sources before changing a broader preference.`,
      });
  const raw = value("editor.codeActionsOnSave");
  if (Array.isArray(raw))
    findings.push({
      id: "legacy",
      confidence: "verified",
      title: "Legacy save-action array",
      detail:
        "Migrate this setting through native VS Code Settings before using profiles or pause.",
    });
  const actions =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const runs = (id: string) =>
    [true, "explicit", "always"].includes(actions[id] as string);
  for (const provider of providers)
    if (!provider.installed && provider.actions.some(runs))
      findings.push({
        id: `action-provider:${provider.id}`,
        confidence: "possible",
        title: `${provider.name} actions are configured without that extension`,
        detail:
          "Another provider could expose the same action kind, but this integration is not available in the current host.",
      });
  if (runs("source.fixAll.biome") && runs("source.fixAll.eslint"))
    findings.push({
      id: "overlapping-fixes",
      confidence: "possible",
      title: "Biome and ESLint fixes are both configured",
      detail:
        "Review rule overlap. This is a possible conflict, not proof that edits compete or run in a guaranteed order.",
    });
  if (
    value("files.autoSave") === "afterDelay" &&
    Object.values(actions).includes("always")
  )
    findings.push({
      id: "after-delay",
      confidence: "info",
      title: "Always does not promise delayed Auto Save actions",
      detail:
        "The always mode includes explicit saves and focus/window-change Auto Save. afterDelay does not guarantee source-action execution.",
    });
  return findings;
}
