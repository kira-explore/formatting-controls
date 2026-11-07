import { randomUUID } from "node:crypto";
import { diagnosticScopeLabel } from "../shared/diagnostic-context";
import { diagnose, type Finding } from "../shared/diagnostics";
import { languageName } from "../shared/language";
import type {
  DiagnosticReport,
  DiagnosticValue,
  Snapshot,
} from "../shared/protocol";
import { formatterSource, settingForAction } from "../shared/status-details";

const reportValue = (value: unknown): DiagnosticValue["value"] =>
  typeof value === "boolean" ||
  typeof value === "string" ||
  typeof value === "number"
    ? value
    : null;

export const createDiagnosticReport = (
  state: Snapshot,
  extraFindings: Finding[],
): DiagnosticReport => {
  const language = languageName(state.activeLanguage);
  const source = (setting: Snapshot["settings"][number]) =>
    formatterSource(setting, state.scope, language);
  const formatter = state.settings.find(
    (setting) => setting.key === "editor.defaultFormatter",
  )?.effective;
  const formatterName =
    typeof formatter === "string"
      ? (state.providers.find(
          (provider) => provider.id.toLowerCase() === formatter.toLowerCase(),
        )?.name ?? formatter)
      : "Not configured";
  const saveActions = state.settings.find(
    (setting) => setting.key === "editor.codeActionsOnSave",
  );
  const rawActions = saveActions?.effective;
  return {
    id: randomUUID(),
    createdAt: Date.now(),
    scopeLabel: diagnosticScopeLabel(state),
    ...(state.scope.language ? { selectedLanguage: state.scope.language } : {}),
    language: state.activeLanguage,
    ...(state.activeFile ? { fileName: state.activeFile.name } : {}),
    status: state.status,
    formatterName,
    settings: state.settings
      .filter((setting) => setting !== saveActions)
      .map((setting) => ({
        key: setting.key,
        value: reportValue(setting.effective),
        source: source(setting),
      })),
    actions:
      saveActions &&
      rawActions &&
      typeof rawActions === "object" &&
      !Array.isArray(rawActions)
        ? Object.entries(rawActions).map(([id, value]) => ({
            id,
            value: reportValue(value),
            source: source(settingForAction(saveActions, id, value)),
          }))
        : [],
    legacyActions: Array.isArray(rawActions)
      ? rawActions.filter((value): value is string => typeof value === "string")
      : [],
    findings: [...extraFindings, ...diagnose(state.settings, state.providers)],
  };
};
