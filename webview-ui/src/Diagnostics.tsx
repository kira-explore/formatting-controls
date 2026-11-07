import { useState } from "react";
import { diagnosticScopeLabel } from "../../shared/diagnostic-context";
import { languageName } from "../../shared/language";
import type { DiagnosticReport, Key, Snapshot } from "../../shared/protocol";
import { actionNames, display, labels, saveModeLabels } from "./catalog";
import { Icon } from "./Icon";

const autoSaveLabels: Record<string, string> = {
  off: "Off",
  afterDelay: "After a delay",
  onFocusChange: "When the editor loses focus",
  onWindowChange: "When the window loses focus",
};
const actionMode = (value: unknown): string => {
  switch (value) {
    case "explicit":
    case true:
      return "Manual save";
    case "always":
      return "Always";
    case "never":
    case false:
      return "Never";
    default:
      return display(value);
  }
};

const formattingStatus = {
  ON: { label: "Enabled", icon: "enabled" },
  OFF: { label: "Disabled", icon: "disabled" },
  MIXED: { label: "Mixed", icon: "mixed" },
} as const;
const settingValue = (
  key: Key,
  value: unknown,
  formatterName: string,
): string => {
  switch (key) {
    case "editor.defaultFormatter":
      return formatterName;
    case "editor.formatOnSaveMode":
      return saveModeLabels[String(value)] ?? display(value);
    case "files.autoSave":
      return autoSaveLabels[String(value)] ?? display(value);
    case "files.autoSaveDelay":
      if (typeof value !== "number") return display(value);
      return value % 1000 === 0
        ? new Intl.NumberFormat(undefined, {
            style: "unit",
            unit: "second",
            unitDisplay: "long",
          }).format(value / 1000)
        : `${value.toLocaleString()} ms`;
    default:
      return typeof value === "boolean"
        ? value
          ? "On"
          : "Off"
        : display(value);
  }
};

const runTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "medium",
});
const runContext = (report: DiagnosticReport) =>
  [report.scopeLabel, languageName(report.language)].join(" · ");

export const Diagnostics = ({
  state,
  navigate,
  run,
  pending,
}: {
  state: Snapshot;
  navigate: (page: string) => void;
  run: () => void;
  pending: boolean;
}) => {
  const [selection, setSelection] = useState<{ id: string; latest: string }>();
  const latest = state.diagnosticHistory[0];
  const report =
    (selection && selection.latest === latest?.id
      ? state.diagnosticHistory.find((entry) => entry.id === selection.id)
      : undefined) ?? latest;

  return (
    <div className="diagnostics">
      <div className="diagnostic-run">
        <button
          type="button"
          className="primary"
          disabled={pending}
          onClick={run}
        >
          <Icon name="scan" />
          Run diagnostics
        </button>
        <p role="status">
          {latest
            ? `Last run ${runTime.format(latest.createdAt)} · ${latest.findings.length === 0 ? "No findings" : `${latest.findings.length} ${latest.findings.length === 1 ? "finding" : "findings"}`}`
            : "No diagnostics run yet."}
        </p>
      </div>
      {state.focusFinding && (
        <p className="diagnostic-context-note">
          Run diagnostics to check the issue reported in the status bar.
        </p>
      )}
      {latest && report && (
        <>
          <section
            className="diagnostics-section"
            aria-labelledby="diagnostic-history"
          >
            <h2 id="diagnostic-history">Run history</h2>
            <ul className="diagnostic-history">
              {state.diagnosticHistory.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    aria-pressed={report.id === entry.id}
                    aria-controls="diagnostic-report"
                    onClick={() =>
                      setSelection({ id: entry.id, latest: latest.id })
                    }
                  >
                    <span>
                      {runTime.format(entry.createdAt)} ·{" "}
                      {entry.fileName ?? "No active file"}
                    </span>
                    <small>
                      {runContext(entry)}
                      {entry.id === latest.id && " · Latest"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section
            id="diagnostic-report"
            className="diagnostics-section"
            aria-labelledby="diagnostic-report-title"
          >
            <h2 id="diagnostic-report-title">
              {report.id === latest.id
                ? "Last run results"
                : "Selected run results"}
            </h2>
            <p>
              {report.fileName ?? "No active file"} · {runContext(report)}
            </p>
            {(report.scopeLabel !== diagnosticScopeLabel(state) ||
              report.selectedLanguage !== state.scope.language ||
              report.language !== state.activeLanguage ||
              report.fileName !== state.activeFile?.name) && (
              <p className="diagnostic-context-note">
                This report was captured for a different file, scope, or
                language.
              </p>
            )}
            <Report
              key={report.id}
              report={report}
              navigate={navigate}
              canReviewPause={state.recovery?.kind === "pause"}
            />
          </section>
        </>
      )}
    </div>
  );
};

const Report = ({
  report,
  navigate,
  canReviewPause,
}: {
  report: DiagnosticReport;
  navigate: (page: string) => void;
  canReviewPause: boolean;
}) => {
  const { actions, formatterName, legacyActions, settings } = report;
  const status = formattingStatus[report.status];
  const triggerCount = settings.filter(
    (setting) =>
      (setting.key === "editor.formatOnSave" ||
        setting.key === "editor.formatOnPaste" ||
        setting.key === "editor.formatOnType") &&
      setting.value === true,
  ).length;
  const formatRows = settings.filter(({ key }) => key.startsWith("editor."));
  const savingRows = settings.filter(({ key }) => key.startsWith("files."));
  const actionCounts = Map.groupBy(actions, ({ value }) => actionMode(value));
  const actionSummary = (
    [
      ["Manual save", "on manual save"],
      ["Always", "set to Always"],
      ["Never", "set to Never"],
    ] as const
  )
    .flatMap(([mode, label]) => {
      const count = actionCounts.get(mode)?.length;
      return count ? [`${count} ${label}`] : [];
    })
    .join(" · ");
  const sourceRows = (rows: DiagnosticReport["settings"]) =>
    rows.map(({ key, value, source }) => (
      <SourceRow
        key={key}
        label={labels[key]}
        value={settingValue(key, value, formatterName)}
        source={source}
      />
    ));
  return (
    <>
      <section
        className="diagnostics-section"
        aria-labelledby="diagnostics-summary"
      >
        <h3 id="diagnostics-summary">What applied at this run</h3>
        <ul className="diagnostics-summary">
          <li>
            <Icon name={status.icon} />
            <div>
              <h4>Automatic formatting · {status.label}</h4>
              <p>
                {triggerCount} of 3 triggers enabled across save, paste, and
                type.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => navigate("formatting")}
              >
                Review formatting →
              </button>
            </div>
          </li>
          <li>
            <Icon name="sliders" />
            <div>
              <h4>Default formatter · {formatterName}</h4>
              <p>
                {formatterName === "Not configured"
                  ? "VS Code may use an available formatter for this language."
                  : "The configured formatter must support the language and operation."}
              </p>
            </div>
          </li>
          <li>
            <Icon name="save" />
            <div>
              <h4>Save actions run separately</h4>
              <p>
                Fixes and import actions can still change the file when
                formatting is off.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => navigate("actions")}
              >
                Review save actions →
              </button>
            </div>
          </li>
        </ul>
      </section>
      {report.findings.length > 0 && (
        <section
          className="diagnostics-section"
          aria-labelledby="diagnostics-findings"
        >
          <h3 id="diagnostics-findings">Findings</h3>
          {report.findings.map((finding) => (
            <article
              className="finding"
              key={finding.id}
              aria-label={finding.title}
            >
              <div className="provider-heading">
                <h4>{finding.title}</h4>
                <span className="tag">
                  {
                    {
                      verified: "Verified",
                      possible: "Possible",
                      info: "Info",
                    }[finding.confidence]
                  }
                </span>
              </div>
              <p>{finding.detail}</p>
              {[
                "formatter-unavailable",
                "provider-off",
                "provider-language",
              ].includes(finding.id) && (
                <button type="button" onClick={() => navigate("formatting")}>
                  Review formatter
                </button>
              )}
              {finding.id === "pause-failed" && canReviewPause && (
                <button type="button" onClick={() => navigate("profiles")}>
                  Review pause recovery
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      <section
        className="diagnostics-section"
        aria-labelledby="diagnostics-sources"
      >
        <h3 id="diagnostics-sources">Setting sources</h3>
        <div className="diagnostic-group">
          <h4>Formatting</h4>
          <dl className="diagnostic-values">{sourceRows(formatRows)}</dl>
        </div>
        <div className="diagnostic-group">
          <h4>Saving</h4>
          <dl className="diagnostic-values">{sourceRows(savingRows)}</dl>
        </div>
        <div className="diagnostic-group diagnostic-actions">
          <h4>Code actions on save</h4>
          <div className="diagnostic-group-content">
            {actionSummary && <p>{actionSummary}</p>}
            <p>
              VS Code starts with no code actions on save. When configured,
              fixes and import organization can run even with Format on save
              off.
            </p>
            {actions.length > 0 ? (
              <dl className="diagnostic-values">
                {actions.map(({ id, value, source }) => (
                  <SourceRow
                    key={id}
                    label={
                      Object.hasOwn(actionNames, id) ? (
                        actionNames[id]
                      ) : (
                        <code>{id}</code>
                      )
                    }
                    value={actionMode(value)}
                    source={source}
                  />
                ))}
              </dl>
            ) : legacyActions.length > 0 ? (
              <p>Legacy actions: {legacyActions.join(", ")}</p>
            ) : (
              <p>No code actions configured.</p>
            )}
            {actions.length > 0 && (
              <details className="diagnostic-action-ids">
                <summary>Show action IDs</summary>
                <ul>
                  {actions.map(({ id }) => (
                    <li key={id}>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      </section>
    </>
  );
};

const SourceRow = ({
  label,
  value,
  source,
}: {
  label: React.ReactNode;
  value: string;
  source: string;
}) => (
  <div className="diagnostic-value">
    <dt>
      {label}
      <small className="diagnostic-source">{source}</small>
    </dt>
    <dd>{value}</dd>
  </div>
);
