import { useState } from "react";
import type { Key, Scope, Setting } from "../../shared/protocol";
import { display } from "./catalog";
import { useEditor } from "./useEditor";
import "./formatting-card.css";

const triggers = [
  ["editor.formatOnSave", "Format on save", "When you save a file"],
  ["editor.formatOnPaste", "Format on paste", "When you paste into the editor"],
  [
    "editor.formatOnType",
    "Format on type",
    "When you type a formatting trigger",
  ],
] as const;
const selectedValue = (setting: Setting | undefined) =>
  setting?.configured ? setting.owned : setting?.effective;
const valueLabel = (value: unknown) =>
  typeof value === "boolean" ? (value ? "On" : "Off") : display(value);
const source = (setting: Setting | undefined) => {
  if (!setting?.configured)
    return `Inherited · effective ${valueLabel(setting?.effective)}`;
  return setting.owned !== setting.effective
    ? `Set here: ${valueLabel(setting.owned)} · effective ${valueLabel(setting.effective)}`
    : "Set at this scope";
};
export function FormattingCard() {
  const { state, pending, error, notice, send } = useEditor();
  const [custom, setCustom] = useState("");
  if (!state)
    return (
      <main className="formatting-card">
        <h1>Formatting Controls</h1>
        <p role="status">Connecting to your editor…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const disabled = !!pending;
  const setting = (key: Key) => state.settings.find((s) => s.key === key);
  const mutate = (key: Key, value: boolean | string) =>
    send({ type: "set", key, value, revision: state.revision });
  const read = (scope: Scope) => send({ type: "read" }, scope);
  const reset = (key: Key) => (
    <button
      type="button"
      className="card-reset"
      aria-label={`Reset to inherited value: ${key}`}
      disabled={disabled || !setting(key)?.configured}
      onClick={() => send({ type: "reset", key, revision: state.revision })}
    >
      Reset
    </button>
  );
  const formatter = setting("editor.defaultFormatter");
  const formatterValue = String(selectedValue(formatter) ?? "");
  const formatters = state.providers.filter(
    (provider) => provider.installed && provider.formatting,
  );
  return (
    <main className="formatting-card" aria-label="Formatting controls">
      <header className="card-heading">
        <h1>Formatting Controls</h1>
        <span
          className="card-state"
          role="status"
          aria-label={`Effective formatting: ${state.status.toLowerCase()}`}
        >
          {state.status === "MIXED"
            ? "Mixed"
            : state.status === "ON"
              ? "On"
              : "Off"}
        </span>
      </header>
      <div className="card-context">
        <span title={state.resource}>
          {state.resource
            ? state.resource.split("/").at(-1)
            : "No active editor"}
        </span>
        <span>{state.activeLanguage || "All languages"}</span>
      </div>
      <section
        className="card-section card-scopes"
        aria-label="Configuration scope"
      >
        <label htmlFor="card-scope">Write to</label>
        <select
          id="card-scope"
          value={state.scope.target}
          disabled={disabled}
          onChange={(e) => {
            const target = e.target.value as Scope["target"];
            read({
              target,
              ...(state.scope.language
                ? { language: state.scope.language }
                : {}),
              ...(target === "folder" && state.folders[0]
                ? { folder: state.scope.folder ?? state.folders[0].uri }
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
        {state.scope.target === "folder" && (
          <>
            <label htmlFor="card-folder">Folder</label>
            <select
              id="card-folder"
              disabled={disabled}
              value={state.scope.folder ?? ""}
              onChange={(e) => read({ ...state.scope, folder: e.target.value })}
            >
              {state.folders.map((folder) => (
                <option key={folder.uri} value={folder.uri}>
                  {folder.name}
                </option>
              ))}
            </select>
          </>
        )}
        <label htmlFor="card-language">Language</label>
        <select
          id="card-language"
          disabled={disabled}
          value={state.scope.language ?? ""}
          onChange={(e) => {
            const { language: _language, ...scope } = state.scope;
            read({
              ...scope,
              ...(e.target.value ? { language: e.target.value } : {}),
            });
          }}
        >
          <option value="">All languages</option>
          {state.languages.map((language) => (
            <option key={language} value={language}>
              {language}
              {language === state.activeLanguage ? " (active editor)" : ""}
            </option>
          ))}
        </select>
      </section>
      {state.remoteName && state.scope.target === "user" && (
        <p className="card-note">
          User settings follow VS Code’s remote configuration rules. Use
          Workspace or Folder to keep changes in this project.
        </p>
      )}
      <section
        className="card-section"
        aria-labelledby="card-formatting-heading"
      >
        <h2 id="card-formatting-heading">Automatic formatting</h2>
        <fieldset disabled={disabled}>
          <legend className="card-sr-only">Formatting triggers</legend>
          {triggers.map(([key, label, description]) => (
            <div className="card-trigger" key={key}>
              <label className="card-checkbox">
                <input
                  type="checkbox"
                  checked={selectedValue(setting(key)) === true}
                  onChange={(e) => mutate(key, e.target.checked)}
                  aria-describedby={`${key}-description ${key}-source`}
                />
                <span>{label}</span>
              </label>
              {reset(key)}
              <p className="card-trigger-description" id={`${key}-description`}>
                {description}
              </p>
              <p className="card-source" id={`${key}-source`}>
                {source(setting(key))}
              </p>
            </div>
          ))}
        </fieldset>
        <div className="card-field">
          <label htmlFor="card-save-mode">Save formatting mode</label>
          <select
            id="card-save-mode"
            disabled={disabled}
            value={String(
              selectedValue(setting("editor.formatOnSaveMode")) ?? "file",
            )}
            onChange={(e) => mutate("editor.formatOnSaveMode", e.target.value)}
            aria-describedby="card-mode-source"
          >
            <option value="file">Whole file</option>
            <option value="modifications">Modified lines</option>
            <option value="modificationsIfAvailable">
              Modified lines, or whole file
            </option>
          </select>
        </div>
        <div className="card-source-row">
          <p id="card-mode-source" className="card-source">
            {source(setting("editor.formatOnSaveMode"))}
          </p>
          {reset("editor.formatOnSaveMode")}
        </div>
      </section>
      <section
        className="card-section"
        aria-labelledby="card-formatter-heading"
      >
        <h2 id="card-formatter-heading">Default formatter</h2>
        <label className="card-sr-only" htmlFor="card-formatter">
          Default formatter
        </label>
        <select
          id="card-formatter"
          disabled={disabled}
          value={formatterValue}
          onChange={(e) => mutate("editor.defaultFormatter", e.target.value)}
          aria-describedby="card-formatter-source card-formatter-note"
        >
          <option value="" disabled>
            Choose a formatter
          </option>
          {formatterValue &&
            !formatters.some((provider) => provider.id === formatterValue) && (
              <option value={formatterValue}>{formatterValue} (current)</option>
            )}
          {formatters.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        <div className="card-source-row">
          <p id="card-formatter-source" className="card-source">
            {source(formatter)}
          </p>
          {reset("editor.defaultFormatter")}
        </div>
        <details className="card-custom">
          <summary>Use another formatter</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutate("editor.defaultFormatter", custom);
            }}
          >
            <label htmlFor="card-formatter-id">Extension ID</label>
            <div className="card-input-row">
              <input
                id="card-formatter-id"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="publisher.extension"
                pattern="[\w\-]+\.[\w.\-]+"
                required
                maxLength={200}
                disabled={disabled}
              />
              <button type="submit" disabled={disabled}>
                Apply
              </button>
            </div>
          </form>
        </details>
        <p id="card-formatter-note" className="card-note">
          Available behavior depends on the formatter and language. Manage
          formatters in the dashboard.
        </p>
      </section>
      <div className="card-feedback">
        <p role="status" aria-live="polite">
          {pending ? "Saving…" : notice}
        </p>
        {error && (
          <p role="alert" className="card-error">
            {error}
          </p>
        )}
      </div>
      <footer className="card-footer">
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
          VS Code Settings
        </button>
      </footer>
    </main>
  );
}
