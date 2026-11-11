import { type ReactNode, useEffect, useRef, useState } from "react";
import { languageName } from "../../shared/language";
import type { Operation, Scope, Snapshot } from "../../shared/protocol";

interface Props {
  page: string;
  state: Snapshot;
  disabled: boolean;
  send: (operation: Operation, scope?: Scope) => void;
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
  const [applyName, setApplyName] = useState("");
  const [showPauseTarget, setShowPauseTarget] = useState(false);
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
    restoreId?: string,
  ) =>
    send({
      type: "profile",
      action,
      ...(profileName ? { name: profileName } : {}),
      ...(restoreId ? { restoreId } : {}),
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
  const restorePoints = state.restorePoints ?? [];
  const destination = (scope: Scope) => {
    if (scope.target === "user") return "User settings";
    if (scope.target === "workspace")
      return `Workspace: ${state.workspaceName ?? "Current workspace"}`;
    return `Folder: ${state.folders.find((folder) => folder.uri === scope.folder)?.name ?? scope.folder}`;
  };
  const lastApplied = restorePoints.find((point) => point.phase === "applied");
  const pauseTarget =
    state.scope.target === "folder"
      ? `folder:${state.scope.folder}`
      : "workspace";
  const profileRow = (entry: Snapshot["profiles"][number]) => {
    const language = entry.language ? languageName(entry.language) : undefined;
    const languages = entry.languages?.map(languageName).join(" · ");
    return (
      <article
        className="profile-row"
        key={entry.builtin ? "preset" : entry.name}
      >
        <div aria-live={entry.builtin ? "polite" : undefined}>
          <h3>{entry.name}</h3>
          <p>
            {entry.builtin
              ? entry.description
              : (languages ?? language ?? "All languages")}
          </p>
        </div>
        <div className="button-row">
          <button
            type="button"
            disabled={disabled || !entry.count || recoveryPending}
            aria-label={`Preview & apply ${entry.name}`}
            onClick={() => {
              setShowSave(false);
              setApplyName(entry.name);
            }}
          >
            {entry.builtin ? "Preview changes" : "Preview & apply"}
          </button>
          <button
            type="button"
            disabled={disabled || !entry.count}
            aria-label={`Export ${entry.name}`}
            onClick={() => profile("export", entry.name)}
          >
            Export
          </button>
          {!entry.builtin && (
            <button
              type="button"
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
              disabled={disabled}
              onClick={() => {
                setApplyName("");
                setShowSave(!showSave);
              }}
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
          </div>
        </div>
        {showSave && !canSave && (
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
            {scopeControls}
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
      {applyName &&
        (() => {
          const entry = state.profiles.find((item) => item.name === applyName);
          if (!entry) return null;
          const required = entry.languages?.length ? "" : entry.language;
          const mismatch =
            required !== undefined && (state.scope.language ?? "") !== required;
          return (
            <section
              className="profile-section"
              role="region"
              aria-label="Apply destination"
            >
              <h2>Apply {applyName}</h2>
              {scopeControls}
              {mismatch && (
                <p>
                  Choose {required ? languageName(required) : "All languages"}{" "}
                  to apply this profile.
                </p>
              )}
              <div className="button-row">
                <button
                  type="button"
                  disabled={disabled || mismatch || recoveryPending}
                  onClick={() => {
                    profile("apply", applyName);
                    setApplyName("");
                  }}
                >
                  Review changes
                </button>
                <button type="button" onClick={() => setApplyName("")}>
                  Cancel
                </button>
              </div>
            </section>
          );
        })()}
      <section className="profile-section">
        <h2>Restore previous settings</h2>
        {lastApplied && (
          <p>
            Last applied: {lastApplied.name} · {destination(lastApplied.scope)}{" "}
            ·{" "}
            {lastApplied.languageCount
              ? `${lastApplied.languageCount} ${lastApplied.languageCount === 1 ? "language" : "languages"}`
              : "All languages"}
          </p>
        )}
        {state.recovery && (
          <div className="profile-list restore-list">
            {[
              ...(state.recovery?.kind === "pause" ? [state.recovery] : []),
              ...restorePoints,
            ].map((point) => (
              <article className="profile-row" key={point.id}>
                <div>
                  <h3>
                    {point.kind === "pause"
                      ? "Temporary pause / recovery"
                      : destination(point.scope)}
                  </h3>

                  <p>
                    {point.name} · {point.count}{" "}
                    {point.count === 1 ? "change" : "changes"}
                    {point.scope.language
                      ? ` · ${languageName(point.scope.language)}`
                      : ""}
                  </p>
                </div>
                {point.phase !== "applied" && (
                  <span className="restore-attention">Needs attention</span>
                )}
                <div className="button-row">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      profile(
                        "restore",
                        undefined,
                        point.kind === "profile" ? point.id : undefined,
                      )
                    }
                  >
                    {point.kind === "pause"
                      ? "Resume / restore"
                      : "Review restore"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      profile(
                        "discard",
                        undefined,
                        point.kind === "profile" ? point.id : undefined,
                      )
                    }
                  >
                    Keep current values
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {!state.recovery && (
          <p>
            A restore point becomes available after applying a profile or
            preset.
          </p>
        )}
      </section>
      <section className="profile-section">
        <h2>Advanced workspace pause</h2>
        <p>
          Temporarily turn off automatic formatting and configured save actions
          for a workspace or folder until you resume.
        </p>
        {showPauseTarget ? (
          <div className="button-row">
            <label>
              Pause in{" "}
              <select
                value={pauseTarget}
                disabled={disabled}
                onChange={(event) => {
                  const target = event.target.value;
                  send(
                    { type: "read" },
                    target === "workspace"
                      ? { target: "workspace" }
                      : { target: "folder", folder: target.slice(7) },
                  );
                }}
              >
                <option value="workspace">Workspace</option>
                {state.folders.map((folder) => (
                  <option key={folder.uri} value={`folder:${folder.uri}`}>
                    Folder: {folder.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={
                disabled ||
                recoveryPending ||
                state.scope.target === "user" ||
                !!state.scope.language
              }
              onClick={() => {
                send({ type: "pause", revision: state.revision });
                setShowPauseTarget(false);
              }}
            >
              Review pause
            </button>
            <button type="button" onClick={() => setShowPauseTarget(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled || !state.hasWorkspace || recoveryPending}
            onClick={() => {
              if (state.scope.target === "user" || state.scope.language)
                send(
                  { type: "read" },
                  state.scope.target === "folder" && state.scope.folder
                    ? { target: "folder", folder: state.scope.folder }
                    : { target: "workspace" },
                );
              setShowPauseTarget(true);
            }}
          >
            Preview temporary pause
          </button>
        )}
      </section>
    </div>
  );
};
