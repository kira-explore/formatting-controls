import { type ReactNode, useEffect, useRef, useState } from "react";
import { languageName } from "../../shared/language";
import type { Operation, Snapshot } from "../../shared/protocol";

interface Props {
  page: string;
  state: Snapshot;
  disabled: boolean;
  send: (operation: Operation) => void;
  scopeControls: ReactNode;
  selectLanguage: (language: string) => void;
}
export const WorkflowPages = ({
  page,
  state,
  disabled,
  send,
  scopeControls,
  selectLanguage,
}: Props) => {
  const [name, setName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [presetName, setPresetName] = useState("Format on Save and Paste");
  const profileNameInput = useRef<HTMLInputElement>(null);
  const saveSettingsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showSave) profileNameInput.current?.focus();
  }, [showSave]);
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
  const canSave = state.settings.some((setting) => setting.configured);
  const savedProfiles = state.profiles.filter((entry) => !entry.builtin);
  const presets = state.profiles.filter((entry) => entry.builtin);
  const selectedPreset =
    presets.find((entry) => entry.name === presetName) ?? presets[0];
  const recoveryPending =
    state.recovery?.kind === "pause" ||
    (!!state.recovery && state.recovery.phase !== "applied");
  const profileRow = (entry: Snapshot["profiles"][number]) => {
    const language = entry.language ? languageName(entry.language) : undefined;
    const languages = entry.languages?.map(languageName).join(", ");
    const requiredLanguage = languages ? "All languages" : language;
    const languageMismatch =
      (entry.language !== undefined || languages !== undefined) &&
      entry.language !== state.scope.language;

    return (
      <article
        className="profile-row"
        key={entry.builtin ? "preset" : entry.name}
      >
        <div aria-live={entry.builtin ? "polite" : undefined}>
          <h3>{entry.name}</h3>
          {entry.builtin && <p>{entry.description}</p>}
          <p>
            {entry.count === 0
              ? "No settings to copy for this selection."
              : `${entry.count} ${entry.count === 1 ? "setting group" : "setting groups"} · ${languages ?? language ?? "Any selected language"}`}
          </p>
          {languageMismatch && (
            <p>Choose {requiredLanguage} in Settings target to apply.</p>
          )}
        </div>
        <div className="button-row">
          <button
            type="button"
            disabled={
              disabled || !entry.count || languageMismatch || recoveryPending
            }
            aria-label={`Preview & apply ${entry.name}`}
            onClick={() => profile("apply", entry.name)}
          >
            Preview &amp; apply
          </button>
          <button
            type="button"
            className="text-button"
            disabled={disabled || !entry.count}
            aria-label={`Export ${entry.name}`}
            onClick={() => profile("export", entry.name)}
          >
            Export
          </button>
          {!entry.builtin && (
            <button
              type="button"
              className="text-button"
              disabled={disabled}
              aria-label={`Delete ${entry.name}`}
              onClick={() => profile("delete", entry.name)}
            >
              Delete
            </button>
          )}
        </div>
      </article>
    );
  };
  return (
    <div className="profiles-content">
      {state.workflowError && (
        <p className="error" role="alert">
          Profiles need attention: {state.workflowError}. Native formatting
          controls remain available.
        </p>
      )}
      <details className="profile-section profile-disclosure">
        <summary>Settings target for saving, applying, or pausing</summary>
        {scopeControls}
      </details>
      <section className="profile-section">
        <div className="section-header">
          <div>
            <h2>Saved profiles</h2>
            <p>Reuse formatting and save-action preferences across projects.</p>
          </div>
          <div className="button-row">
            <button
              ref={saveSettingsButton}
              type="button"
              className="primary"
              aria-expanded={showSave}
              disabled={disabled || !canSave}
              onClick={() => setShowSave(!showSave)}
            >
              Save current settings
            </button>
            <button
              type="button"
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
              Refresh
            </button>
          </div>
        </div>
        {!canSave && (
          <p className="profile-save-hint">
            To save a profile, set a formatting or save-action preference for
            the selected scope and language.
          </p>
        )}
        {showSave && (
          <form
            className="custom-action profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && canSave && name.trim())
                profile("save", name.trim());
            }}
          >
            <label>
              Profile name
              <input
                ref={profileNameInput}
                aria-label="New profile name"
                value={name}
                required
                maxLength={80}
                placeholder="My project preferences"
                disabled={disabled}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                type="submit"
                className="primary"
                disabled={disabled || !canSave || !name.trim()}
              >
                Save profile
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setName("");
                  setShowSave(false);
                  saveSettingsButton.current?.focus();
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {savedProfiles.length ? (
          <div className="profile-list">{savedProfiles.map(profileRow)}</div>
        ) : (
          <div className="profile-empty">
            <h3>No saved profiles yet</h3>
            <p>Save your current settings or import a profile from JSON.</p>
          </div>
        )}
      </section>
      {selectedPreset && (
        <section className="profile-section">
          <h2>Built-in presets</h2>
          <p>Choose a preset, then preview its changes before applying it.</p>
          <div className="profile-presets">
            <fieldset className="preset-choices" aria-label="Built-in presets">
              {presets.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  aria-pressed={entry.name === selectedPreset.name}
                  onClick={() => setPresetName(entry.name)}
                >
                  {entry.name}
                </button>
              ))}
            </fieldset>
            <div className="profile-list preset-detail">
              {profileRow(selectedPreset)}
            </div>
          </div>
        </section>
      )}
      <section className="profile-section">
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
              Restore values that still match this change. Later edits are
              preserved. Applying another batch replaces this restore point.
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
          <p>
            A restore point becomes available after applying a profile or
            preset.
          </p>
        )}
      </section>
      <details className="disclosure formatting-disclosure">
        <summary>Advanced workspace pause</summary>
        <div className="callout">
          <span aria-hidden="true">Ⅱ</span>
          <div>
            <strong>Pause at an explicit workspace scope</strong>
            <p>
              Pause automatic formatting and configured save actions until you
              resume. Language or narrower overrides may still run.
            </p>
            <button
              type="button"
              disabled={
                disabled || state.scope.target === "user" || recoveryPending
              }
              onClick={() => send({ type: "pause", revision: state.revision })}
            >
              Preview temporary pause
            </button>
            {state.scope.target === "user" && (
              <p>Select Workspace or a workspace folder to use this pause.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
};
