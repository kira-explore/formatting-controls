import { useState } from "react";
import type { Key, Scope } from "../../shared/protocol";
import { settingSource } from "../../shared/setting-source";
import { useEditor } from "./useEditor";

const triggers = [
  ["editor.formatOnSave", "Format on save"],
  ["editor.formatOnPaste", "Format on paste"],
  ["editor.formatOnType", "Format on type"],
] as const;

export function QuickControls() {
  const { state, pending, error, notice, send } = useEditor();
  const [preview, setPreview] = useState(false);
  if (!state)
    return (
      <main className="quick-controls">
        <h1>Formatting Controls</h1>
        <p role="status">Connecting to your editor…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const disabled = !!pending;
  const editor = state.editorContext;
  const setting = (key: Key) => state.settings.find((s) => s.key === key);
  const formatter = setting("editor.defaultFormatter");
  const formatterValue = String(formatter?.owned ?? formatter?.effective ?? "");
  const formatters = state.providers.filter((p) => p.installed && p.formatting);
  const recovery = state.recovery;
  const paused = recovery?.kind === "pause";
  const recoveredHere =
    paused &&
    recovery.scope.target === state.scope.target &&
    recovery.scope.folder === state.scope.folder &&
    recovery.scope.language === state.scope.language;
  const changeScope = (scope: Scope) => {
    setPreview(false);
    send({ type: "read" }, scope);
  };
  const displayStatus =
    recoveredHere && state.status === "OFF"
      ? "Paused"
      : state.status === "ON"
        ? "On"
        : state.status === "OFF"
          ? "Off"
          : "Mixed";
  const pauseBlocked =
    disabled ||
    (!paused && state.scope.target === "user") ||
    (!!recovery && !paused);
  return (
    <main className="quick-controls" aria-label="Formatting Controls">
      <header className="quick-header">
        <h1>Formatting Controls</h1>
        <output
          className="quick-badge"
          aria-label={`Effective formatting: ${displayStatus}`}
        >
          {displayStatus}
        </output>
      </header>
      <section className="quick-context" aria-label="Active editor context">
        <span className="quick-info" aria-hidden="true">
          ⓘ
        </span>
        <div>
          <p title={editor?.path}>
            {editor
              ? `Active file: ${editor.file} · ${editor.language}`
              : "No active file"}
          </p>
          <p className="quick-muted">
            {editor?.workspace
              ? `Workspace: ${editor.workspace}`
              : state.hasWorkspace
                ? "Workspace open"
                : "No workspace open"}
            {editor?.folder ? ` · Folder: ${editor.folder}` : ""}
            {state.remoteName ? ` · Remote: ${state.remoteName}` : ""}
          </p>
        </div>
      </section>
      <section className="quick-scope" aria-label="Write destination">
        <label>
          Write to
          <select
            aria-label="Write to"
            value={state.scope.target}
            disabled={disabled}
            onChange={(e) => {
              const target = e.target.value as Scope["target"];
              const folder = state.scope.folder ?? state.folders[0]?.uri;
              changeScope({
                target,
                ...(target === "folder" && folder ? { folder } : {}),
                ...(state.scope.language
                  ? { language: state.scope.language }
                  : {}),
              });
            }}
          >
            <option value="user">User</option>
            <option value="workspace" disabled={!state.hasWorkspace}>
              Workspace
            </option>
            <option value="folder" disabled={!state.folders.length}>
              Workspace folder
            </option>
          </select>
        </label>
        {state.scope.target === "folder" && (
          <label>
            Folder
            <select
              aria-label="Workspace folder"
              value={state.scope.folder ?? ""}
              disabled={disabled}
              onChange={(e) =>
                changeScope({ ...state.scope, folder: e.target.value })
              }
            >
              {state.folders.map((f) => (
                <option key={f.uri} value={f.uri}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Apply to language
          <select
            aria-label="Apply to language"
            value={state.scope.language ?? ""}
            disabled={disabled}
            onChange={(e) => {
              const scope = { ...state.scope };
              if (e.target.value) scope.language = e.target.value;
              else delete scope.language;
              changeScope(scope);
            }}
          >
            <option value="">All languages</option>
            {state.languages.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </section>
      {state.scope.target === "folder" &&
        state.resource === state.scope.folder && (
          <p className="quick-muted">
            Values shown for folder:{" "}
            {state.folders.find((f) => f.uri === state.scope.folder)?.name}. The
            active file is in another folder.
          </p>
        )}
      <details className="quick-formatting" open>
        <summary>Automatic formatting</summary>
        {state.scope.language && state.scope.language !== editor?.language && (
          <p className="quick-muted">
            Editing {state.scope.language} rules. The active file uses{" "}
            {editor?.language ?? "another language"}.
          </p>
        )}
        <div className="quick-triggers">
          {triggers.map(([key, label]) => {
            const s = setting(key);
            if (!s) return null;
            const checked = Boolean(s.configured ? s.owned : s.effective);
            const source = settingSource(s, state.scope, state.activeLanguage);
            return (
              <div className="quick-trigger" key={key}>
                <label>
                  <input
                    type="checkbox"
                    aria-label={label}
                    aria-describedby={`${key}-source ${key}-override`}
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) =>
                      send({
                        type: "set",
                        key,
                        value: e.target.checked,
                        revision: state.revision,
                      })
                    }
                  />
                  <span>{label}</span>
                  <span className="quick-value" aria-hidden="true">
                    {checked ? "On" : "Off"}
                  </span>
                </label>
                <p className="quick-source" id={`${key}-source`}>
                  {source.label}
                </p>
                <p className="quick-override" id={`${key}-override`}>
                  {source.override ?? ""}
                </p>
              </div>
            );
          })}
        </div>
      </details>
      <section className="quick-formatter">
        <label>
          Default formatter
          <select
            aria-label="Default formatter"
            disabled={disabled}
            value={formatterValue}
            onChange={(e) =>
              send({
                type: "set",
                key: "editor.defaultFormatter",
                value: e.target.value,
                revision: state.revision,
              })
            }
          >
            <option value="" disabled>
              Not configured
            </option>
            {formatterValue &&
              !formatters.some((p) => p.id === formatterValue) && (
                <option value={formatterValue}>
                  {formatterValue} (configured)
                </option>
              )}
            {formatters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </section>
      <section className="quick-pause" aria-label="Temporary formatting pause">
        <div className="quick-pause-row">
          <button
            type="button"
            disabled={pauseBlocked}
            onClick={() => setPreview(!preview)}
            aria-expanded={preview}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <span className="quick-muted">
            {paused
              ? "Restore unchanged formatting preferences"
              : "Temporarily stop automatic formatting"}
          </span>
        </div>
        {state.scope.target === "user" && !paused && (
          <p className="quick-muted">
            Choose Workspace or Workspace folder to pause.
          </p>
        )}
        {recovery && !paused && (
          <p className="quick-muted">
            Review the existing restore point in the dashboard first.
          </p>
        )}
        {preview && (
          <section
            className="quick-preview"
            aria-label="Review formatting changes"
          >
            <h2>{paused ? "Review resume" : "Review pause"}</h2>
            <p>
              {paused
                ? `Restore point: ${recovery.name} · ${recovery.scope.target}${recovery.scope.language ? ` · ${recovery.scope.language}` : ""}. Newer changes will be preserved.`
                : `Turn off Save, Paste and Type at ${state.scope.target}${state.scope.language ? ` · ${state.scope.language}` : ""}. Save actions stay unchanged.`}
            </p>
            <p>
              The next step opens the existing change preview for confirmation.
            </p>
            <div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setPreview(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setPreview(false);
                  send(
                    paused
                      ? {
                          type: "profile",
                          action: "restore",
                          revision: state.revision,
                        }
                      : { type: "pauseFormatting", revision: state.revision },
                  );
                }}
              >
                Review changes
              </button>
            </div>
          </section>
        )}
      </section>
      <footer className="quick-footer">
        <button
          type="button"
          disabled={disabled}
          onClick={() => send({ type: "open", destination: "dashboard" })}
        >
          Open dashboard ↗
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => send({ type: "open", destination: "settings" })}
        >
          Settings
        </button>
      </footer>
      <div className="quick-feedback" aria-live="polite">
        {notice}
      </div>
      {error && (
        <p className="quick-error" role="alert">
          {error}
        </p>
      )}
      {state.workflowError && (
        <p className="quick-error" role="alert">
          {state.workflowError}
        </p>
      )}
    </main>
  );
}
