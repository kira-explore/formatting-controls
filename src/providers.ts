import * as vscode from "vscode";
import type { Provider } from "../shared/protocol";
import { adapters } from "../shared/providers";
export function providersFor(
  config: vscode.WorkspaceConfiguration,
  language: string,
  selected: unknown,
): Provider[] {
  const providers: Provider[] = adapters.map((adapter) => {
    const knownLanguage = adapter.languages.includes(language);
    let formattingKey = adapter.formatSetting;
    if (adapter.id === "vscode.typescript-language-features")
      formattingKey = knownLanguage
        ? language.startsWith("typescript")
          ? "typescript.format.enable"
          : "javascript.format.enable"
        : undefined;
    if (adapter.id === "vscode.css-language-features")
      formattingKey = knownLanguage ? `${language}.format.enable` : undefined;
    if (adapter.id.startsWith("vscode.") && !knownLanguage)
      formattingKey = undefined;
    const enabled = adapter.enabledSetting
      ? config.get(adapter.enabledSetting)
      : undefined;
    const formatting =
      enabled === false
        ? false
        : formattingKey
          ? config.get(formattingKey)
          : undefined;
    return {
      ...adapter,
      installed: !!vscode.extensions.getExtension(adapter.id),
      enabled: typeof enabled === "boolean" ? enabled : null,
      formattingEnabled: typeof formatting === "boolean" ? formatting : null,
      knownLanguage,
      evidence: adapter.settings.map((key) => ({
        key,
        value: config.get(key) ?? null,
      })),
    };
  });
  if (
    typeof selected === "string" &&
    !providers.some((p) => p.id.toLowerCase() === selected.toLowerCase())
  )
    providers.push({
      id: selected,
      name: selected,
      formatting: false,
      installed: !!vscode.extensions.getExtension(selected),
      languages: [],
      actions: [],
      settings: [],
      enabled: null,
      formattingEnabled: null,
      knownLanguage: false,
      evidence: [],
      note: "Configured extension without an adapter. Presence does not verify its capabilities.",
    });
  return providers;
}
