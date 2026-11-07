import { useState } from "react";
import { languageName } from "../../shared/language";
import type { Operation, Snapshot } from "../../shared/protocol";

interface Props {
  page: string;
  state: Snapshot;
  disabled: boolean;
  send: (operation: Operation) => void;
  selectLanguage: (language: string) => void;
}
export const WorkflowPages = ({
  page,
  state,
  disabled,
  send,
  selectLanguage,
}: Props) => {
  const [name, setName] = useState("");
  const [addingRule, setAddingRule] = useState(false);
  const [ruleLanguage, setRuleLanguage] = useState("");
  const profile = (
    action:
      | "save"
      | "apply"
      | "delete"
      | "export"
      | "import"
      | "restore"
      | "discard",
    profileName?: string,
  ) =>
    send({
      type: "profile",
      action,
      ...(profileName ? { name: profileName } : {}),
      revision: state.revision,
    });
  if (page === "rules")
    return (
      <>
        <div className="section-header">
          <div>
            <h2>Language rules in this context</h2>
            <p>
              Language rules override general settings. Source notes identify
              where each rule is saved.
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setAddingRule(!addingRule)}
          >
            + Add language rule
          </button>
        </div>
        {addingRule && (
          <form
            className="custom-action"
            onSubmit={(event) => {
              event.preventDefault();
              if (ruleLanguage) selectLanguage(ruleLanguage);
            }}
          >
            <label>
              Language for the new rule
              <select
                value={ruleLanguage}
                onChange={(event) => setRuleLanguage(event.target.value)}
                required
                disabled={disabled}
              >
                <option value="" disabled>
                  Choose language
                </option>
                {state.languages.map((language) => (
                  <option key={language} value={language}>
                    {languageName(language)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={disabled || !ruleLanguage}>
              Edit rule
            </button>
          </form>
        )}
        <section className="settings-list">
          {state.rules.map((rule) => (
            <article className="action-row" key={rule.language}>
              <div>
                <h3>{languageName(rule.language)}</h3>
                <p>{rule.sources.join(" · ")}</p>
                <code>{rule.keys.join(", ")}</code>
              </div>
              <button
                type="button"
                disabled={disabled || !state.languages.includes(rule.language)}
                onClick={() => selectLanguage(rule.language)}
              >
                Edit language
              </button>
            </article>
          ))}
          {!state.rules.length && (
            <div className="empty">
              <h3>No explicit language overrides</h3>
              <p>
                Choose a language above and edit individual settings to create
                one. Existing unrelated settings are preserved.
              </p>
            </div>
          )}
        </section>
      </>
    );
  const pending = disabled;
  disabled = disabled || !!state.workflowError;
  const profileCard = (p: Snapshot["profiles"][number]) => (
    <article key={p.name}>
      <div className="provider-heading">
        <h3>{p.name}</h3>
        <span className="tag">{p.builtin ? "Preset" : "Saved"}</span>
      </div>
      <p>{p.description}</p>
      <small>
        {p.count} setting groups · {p.language ?? "Any selected language"}
      </small>
      <div className="button-row">
        <button
          type="button"
          disabled={
            disabled ||
            !p.count ||
            !!(p.language && p.language !== state.scope.language) ||
            state.recovery?.kind === "pause" ||
            (!!state.recovery && state.recovery.phase !== "applied")
          }
          aria-label={`Preview & apply ${p.name}`}
          onClick={() => profile("apply", p.name)}
        >
          Preview & apply
        </button>
        <button
          type="button"
          disabled={disabled || !p.count}
          aria-label={`Export ${p.name}`}
          onClick={() => profile("export", p.name)}
        >
          Export
        </button>
        {!p.builtin && (
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            aria-label={`Delete ${p.name}`}
            onClick={() => profile("delete", p.name)}
          >
            Delete
          </button>
        )}
      </div>
    </article>
  );
  return (
    <>
      {state.workflowError && (
        <p className="error" role="alert">
          Profiles need attention: {state.workflowError}. Native formatting
          controls remain available.
        </p>
      )}
      <div className="section-header">
        <div>
          <h2>Saved profiles</h2>
          <p>
            Preview changes before applying a profile to the selected scope.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          disabled={disabled}
          onClick={() =>
            document
              .querySelector<HTMLInputElement>(
                '[aria-label="New profile name"]',
              )
              ?.focus()
          }
        >
          + Save current settings
        </button>
      </div>
      <section className="provider-grid profile-list">
        {state.profiles.filter((p) => !p.builtin).map(profileCard)}
        {!state.profiles.some((p) => !p.builtin) && (
          <p>
            No saved profiles yet. Save your explicit settings or import a
            profile.
          </p>
        )}
      </section>
      <form
        className="custom-action"
        onSubmit={(e) => {
          e.preventDefault();
          profile("save", name);
        }}
      >
        <label>
          Save explicit preferences at the selected scope
          <input
            aria-label="New profile name"
            value={name}
            required
            maxLength={80}
            placeholder="My project preferences"
            disabled={disabled}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={disabled || !state.settings.some((s) => s.configured)}
        >
          Save profile
        </button>
      </form>
      <div className="button-row">
        <button
          type="button"
          className="text-button"
          disabled={disabled}
          onClick={() => profile("import")}
        >
          Import profile
        </button>
        <button
          type="button"
          className="text-button"
          disabled={pending}
          onClick={() => send({ type: "read" })}
        >
          Refresh profiles
        </button>
      </div>
      <details className="disclosure">
        <summary>Built-in presets</summary>
        <section className="provider-grid profile-list">
          {state.profiles.filter((p) => p.builtin).map(profileCard)}
        </section>
      </details>
      <section className="disclosure">
        <h2>Restore previous settings</h2>
        {state.recovery && (
          <section className="recovery-card">
            <div className="provider-heading">
              <h3>
                {state.recovery.kind === "pause"
                  ? "Temporary pause / recovery"
                  : "Previous profile restore point"}
              </h3>
              <span className="tag installed">{state.recovery.phase}</span>
            </div>
            <p>
              {state.recovery.name} · {state.recovery.count} values ·{" "}
              {state.recovery.scope.target}
              {state.recovery.scope.language
                ? ` / ${state.recovery.scope.language}`
                : " / all languages"}
            </p>
            <code>{state.recovery.scope.folder}</code>
            <p>
              Restore only values still matching this change. Externally edited
              preferences stay untouched; conflicts remain available for review.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="primary"
                disabled={pending}
                onClick={() => profile("restore")}
              >
                {state.recovery.kind === "pause"
                  ? "Resume / restore"
                  : "Restore previous values"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => profile("discard")}
              >
                Keep current values
              </button>
            </div>
          </section>
        )}
        {!state.recovery && (
          <p>A restore point becomes available after applying a profile.</p>
        )}
      </section>
      <details className="disclosure">
        <summary>Advanced workspace pause</summary>
        <div className="callout">
          <span aria-hidden="true">Ⅱ</span>
          <div>
            <strong>Pause at an explicit workspace scope</strong>
            <p>
              This advanced pause changes formatting flags and currently
              configured source actions. Choose Workspace or Workspace folder.
              It stays in effect until resumed, including across reloads.
              Language or narrower overrides may still run.
            </p>
            <button
              type="button"
              disabled={
                disabled ||
                state.scope.target === "user" ||
                state.recovery?.kind === "pause" ||
                (!!state.recovery && state.recovery.phase !== "applied")
              }
              onClick={() => send({ type: "pause", revision: state.revision })}
            >
              Preview temporary pause
            </button>
          </div>
        </div>
      </details>
      <p className="workflow-note">
        Importing saves a profile without applying it. Native previews show
        exact setting/action changes and require confirmation. Applying another
        batch replaces the most recent restore point.
      </p>
    </>
  );
};
