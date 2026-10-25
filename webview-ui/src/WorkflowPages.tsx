import { useState } from "react";
import type { Operation, Snapshot } from "../../shared/protocol";

interface Props {
  page: string;
  state: Snapshot;
  disabled: boolean;
  send: (operation: Operation) => void;
  selectLanguage: (language: string) => void;
}
export function WorkflowPages({
  page,
  state,
  disabled,
  send,
  selectLanguage,
}: Props) {
  const [name, setName] = useState("");
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
  if (page === "diagnostics")
    return (
      <>
        <div className="section-header">
          <div>
            <h2>Understand your formatting setup</h2>
            <p>Verified settings, possible conflicts, and honest limits.</p>
          </div>
        </div>
        <div className="callout">
          <span aria-hidden="true">◎</span>
          <div>
            <strong>Evidence, not guesswork</strong>
            <p>
              These checks read effective settings and installed extension
              metadata. They cannot inspect arbitrary provider servers or
              guarantee action availability.
            </p>
          </div>
        </div>
        <section className="settings-list">
          {state.findings.map((f) => (
            <article className="finding" key={f.id}>
              <div className="provider-heading">
                <h3>{f.title}</h3>
                <span
                  className={`tag ${f.confidence === "verified" ? "installed" : ""}`}
                >
                  {f.confidence}
                </span>
              </div>
              <p>{f.detail}</p>
            </article>
          ))}
          {!state.findings.length && (
            <p className="empty">
              No findings for the selected context. This is not a guarantee of
              provider execution.
            </p>
          )}
        </section>
      </>
    );
  if (page === "rules")
    return (
      <>
        <div className="section-header">
          <div>
            <h2>Explicit language overrides</h2>
            <p>Configured languages in the current resource context.</p>
          </div>
        </div>
        <div className="callout">
          <span aria-hidden="true">⌘</span>
          <div>
            <strong>Language settings can win across scopes</strong>
            <p>
              Use the source inspector in Formatting to review the values behind
              each override. Combined language blocks are resolved by VS Code.
            </p>
          </div>
        </div>
        <section className="settings-list">
          {state.rules.map((rule) => (
            <article className="action-row" key={rule.language}>
              <div>
                <h3>{rule.language}</h3>
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
          <h2>Reusable preferences</h2>
          <p>Save explicit values, preview changes, and restore safely.</p>
        </div>
        <div className="button-row">
          <button
            type="button"
            disabled={pending}
            onClick={() => send({ type: "read" })}
          >
            Refresh profiles
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => profile("import")}
          >
            Import JSON
          </button>
        </div>
      </div>
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
      <div className="callout">
        <span aria-hidden="true">Ⅱ</span>
        <div>
          <strong>Pause at an explicit workspace scope</strong>
          <p>
            Pause changes real formatting flags and currently configured source
            actions. Choose Workspace or Workspace folder. It stays in effect
            until resumed, including across reloads. Language or narrower
            overrides may still run.
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
      <section className="provider-grid">
        {state.profiles.map((p) => (
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
        ))}
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
      <p className="workflow-note">
        Importing saves a profile without applying it. Native previews show
        exact setting/action changes and require confirmation. Applying another
        batch replaces the most recent restore point.
      </p>
    </>
  );
}
