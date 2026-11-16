import { useEffect, useRef, useState } from "react";
import { diagnosticScopeLabel } from "../../shared/diagnostic-context";
import { languageName } from "../../shared/language";
import type { DiagnosticReport, Key, Snapshot } from "../../shared/protocol";
import {
  detailedActionNames,
  display,
  labels,
  saveModeLabels,
} from "./catalog";
import { Icon } from "./Icon";
import { InlineDeleteConfirmation } from "./InlineDeleteConfirmation";
import { usePickerScroll } from "./usePickerScroll";

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
  remove,
  pending,
  running,
  notice,
}: {
  state: Snapshot;
  navigate: (page: string) => void;
  run: (onComplete: (runId: string) => void) => void;
  remove: (runId?: string) => void;
  pending: boolean;
  running: boolean;
  notice: string;
}) => {
  const [selectedId, setSelectedId] = useState<string>();
  const [viewedId, setViewedId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<string>();
  const deleteRunButton = useRef<HTMLButtonElement>(null);
  const clearAllButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);
  const reportHeading = useRef<HTMLHeadingElement>(null);
  const focusReport = useRef(false);
  const cancelledDeletion = useRef<"all" | "run" | undefined>(undefined);
  const history = state.diagnosticHistory;
  const latest = history[0];
  const selected = history.find(({ id }) => id === selectedId) ?? latest;
  const historyScroll = usePickerScroll<HTMLUListElement>(
    history.length,
    selected ? history.indexOf(selected) : -1,
  );
  const report = history.find(({ id }) => id === viewedId);
  const clearAll = deleteTarget === "all";
  const targetRun = history.find(({ id }) => id === deleteTarget);
  const confirming = clearAll ? history.length > 0 : !!targetRun;

  useEffect(() => {
    if (confirming) {
      cancelButton.current?.focus();
    } else if (cancelledDeletion.current) {
      (cancelledDeletion.current === "all"
        ? clearAllButton
        : deleteRunButton
      ).current?.focus();
      cancelledDeletion.current = undefined;
    } else if (!pending && deleteTarget) {
      setDeleteTarget(undefined);
      (selectedButton.current ?? runButton.current)?.focus();
    }
  }, [pending, confirming, deleteTarget]);

  useEffect(() => {
    if (!focusReport.current || !report) return;
    reportHeading.current?.focus();
    focusReport.current = false;
  }, [report]);

  return (
    <div className="diagnostics">
      <section
        className="diagnostic-history-section"
        aria-labelledby="diagnostic-history"
      >
        <div className="diagnostic-history-heading">
          <h2 id="diagnostic-history">Run history</h2>
          {history.length > 1 && (
            <button
              type="button"
              ref={clearAllButton}
              aria-label="Clear all diagnostic runs"
              disabled={pending || confirming}
              onClick={() => setDeleteTarget("all")}
            >
              Clear
            </button>
          )}
        </div>
        {latest ? (
          <div className="profile-list diagnostic-history-card">
            <ul
              className="diagnostic-history picker-scroll"
              ref={historyScroll}
            >
              {history.map((entry) => (
                <li key={entry.id} className="diagnostic-history-row">
                  <button
                    type="button"
                    className="diagnostic-history-entry"
                    ref={selected?.id === entry.id ? selectedButton : undefined}
                    aria-pressed={selected?.id === entry.id}
                    disabled={pending || confirming}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <span>
                      {entry.fileName ?? "No active file"}
                      {entry.id === latest.id && (
                        <span className="diagnostic-latest">Latest</span>
                      )}
                    </span>
                    <small>
                      {runTime.format(entry.createdAt)} · {runContext(entry)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
            {confirming ? (
              <InlineDeleteConfirmation
                noteId="diagnostic-delete-note"
                note={
                  targetRun
                    ? `Delete the run for ${targetRun.fileName ?? "No active file"} from ${runTime.format(targetRun.createdAt)}?`
                    : `Delete all saved runs for this ${state.hasWorkspace ? "workspace" : "window"}?`
                }
                label={clearAll ? "Delete all runs" : "Delete run"}
                cancelRef={cancelButton}
                disabled={pending}
                respond={(accepted) => {
                  if (accepted) remove(targetRun?.id);
                  else {
                    cancelledDeletion.current = clearAll ? "all" : "run";
                    setDeleteTarget(undefined);
                  }
                }}
              />
            ) : (
              <div className="profile-picker-actions button-row">
                <button
                  type="button"
                  className="primary"
                  aria-label="View results"
                  disabled={pending || !selected}
                  onClick={() => {
                    if (report?.id === selected?.id) {
                      reportHeading.current?.focus();
                    } else {
                      focusReport.current = true;
                      setViewedId(selected?.id);
                    }
                  }}
                >
                  View
                </button>
                <button
                  type="button"
                  ref={deleteRunButton}
                  aria-label="Delete run"
                  disabled={pending || !selected}
                  onClick={() => setDeleteTarget(selected?.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="profile-empty diagnostic-history-card">
            <p>No saved diagnostic runs.</p>
          </div>
        )}
      </section>
      <div className="diagnostic-run">
        <button
          type="button"
          className="primary"
          ref={runButton}
          disabled={pending}
          onClick={() => {
            setDeleteTarget(undefined);
            setViewedId(undefined);
            run((runId) => {
              setSelectedId(runId);
              setViewedId(runId);
            });
          }}
        >
          {running ? (
            <span className="diagnostic-spinner" aria-hidden="true" />
          ) : (
            <Icon name="scan" />
          )}
          {running ? "Running diagnostics…" : "Run diagnostics"}
        </button>
        <p role="status">
          {!pending && notice && `${notice} `}
          {running
            ? "Checking formatting settings, formatter availability, and save actions…"
            : pending
              ? "Working…"
              : latest
                ? `Last run ${runTime.format(latest.createdAt)} · ${latest.findings.length === 0 ? "No findings" : `${latest.findings.length} ${latest.findings.length === 1 ? "finding" : "findings"}`}`
                : ""}
        </p>
      </div>
      {state.focusFinding && (
        <p className="diagnostic-context-note">
          Run diagnostics to check the issue reported in the status bar.
        </p>
      )}
      {latest && report && (
        <section
          id="diagnostic-report"
          className="diagnostics-section"
          aria-labelledby="diagnostic-report-title"
        >
          <h2 id="diagnostic-report-title" ref={reportHeading} tabIndex={-1}>
            {report.id === latest.id
              ? "Last run results"
              : "Selected run results"}
          </h2>
          <p>
            {report.fileName ?? "No active file"} · {runContext(report)} ·{" "}
            <time dateTime={new Date(report.createdAt).toISOString()}>
              {runTime.format(report.createdAt)}
            </time>
          </p>
          {(report.scopeLabel !== diagnosticScopeLabel(state) ||
            report.selectedLanguage !== state.scope.language ||
            report.language !== state.activeLanguage ||
            report.fileName !== state.activeFile?.name) && (
            <p className="diagnostic-context-note">
              This report was captured for a different file, scope, or language.
            </p>
          )}
          <Report
            key={report.id}
            report={report}
            navigate={navigate}
            canReviewPause={state.recovery?.kind === "pause"}
          />
        </section>
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
  const neverActions = actionCounts.get("Never") ?? [];
  const activeActions = actions.filter(
    ({ value }) => actionMode(value) !== "Never",
  );
  const actionRows = (rows: DiagnosticReport["actions"]) =>
    rows.map(({ id, value, source }) => (
      <SourceRow
        key={id}
        label={
          Object.hasOwn(detailedActionNames, id) ? (
            detailedActionNames[id]
          ) : (
            <code>{id}</code>
          )
        }
        value={actionMode(value)}
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
            {activeActions.length > 0 && (
              <dl className="diagnostic-values">{actionRows(activeActions)}</dl>
            )}
            {neverActions.length > 0 && (
              <details className="diagnostic-action-ids">
                <summary>Never run ({neverActions.length})</summary>
                <dl className="diagnostic-values">
                  {actionRows(neverActions)}
                </dl>
              </details>
            )}
            {legacyActions.length > 0 && (
              <p>Legacy actions: {legacyActions.join(", ")}</p>
            )}
            {actions.length === 0 && legacyActions.length === 0 && (
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
