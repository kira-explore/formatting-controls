import { type ReactNode, useEffect, useRef, useState } from "react";
import { languageName } from "../../shared/language";
import type { Operation, Scope, Snapshot } from "../../shared/protocol";

import { formattingPresets } from "../../shared/workflows";
import { InlineDeleteConfirmation } from "./InlineDeleteConfirmation";
import { usePickerScroll } from "./usePickerScroll";
import { type PauseConfirmation, WorkspacePause } from "./WorkspacePause";

const focusElement = (element: HTMLElement | null) => {
  element?.focus();
};

type ReturnFocus =
  | "save"
  | "saved"
  | "saved-delete"
  | "preset"
  | "restore"
  | "restore-delete";

const ProfileChoice = ({
  group,
  value,
  checked,
  disabled,
  select,
  children,
  className,
}: {
  group: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  select: (value: string) => void;
  children: ReactNode;
  className?: string;
}) => (
  <label className={className}>
    <input
      className="profile-radio"
      type="radio"
      name={group}
      value={value}
      checked={checked}
      disabled={disabled}
      onChange={() => select(value)}
    />
    {children}
  </label>
);

interface Props {
  page: string;
  state: Snapshot;
  disabled: boolean;
  send: (operation: Operation, scope?: Scope) => void;
  scopeControls: ReactNode;
  profileToDelete: string | undefined;
  profileToApply: string | undefined;
  applyReview: (onClose?: () => void, onBack?: () => void) => ReactNode;
  applyError: { name: string; message: string } | undefined;
  clearApplyError: () => void;
  reviewingProfile: string | undefined;
  savingProfile: boolean;
  saveNotice: string;
  savedNotice: string;
  presetNotice: string;
  restoreRequest: { action: "restore" | "discard"; id?: string } | undefined;
  pauseConfirmation: PauseConfirmation | undefined;
  reviewingPause: boolean;
  restoreNotice: string;
  pauseNotice: string;
  replyToConfirmation: (accepted: boolean) => void;
  selectLanguage: (language: string) => void;
}
export const WorkflowPages = ({
  page,
  state,
  disabled,
  send,
  scopeControls,
  profileToDelete,
  profileToApply,
  applyReview,
  applyError,
  clearApplyError,
  reviewingProfile,
  savingProfile,
  saveNotice,
  savedNotice,
  presetNotice,
  restoreRequest,
  pauseConfirmation,
  reviewingPause,
  restoreNotice,
  pauseNotice,
  replyToConfirmation,
  selectLanguage,
}: Props) => {
  const [name, setName] = useState("");
  const [applyTarget, setApplyTarget] =
    useState<Pick<Snapshot["profiles"][number], "name" | "builtin">>();
  const [showSave, setShowSave] = useState(false);
  const [savedName, setSavedName] = useState("");
  const [presetName, setPresetName] = useState("Save & Paste");
  const [restoreId, setRestoreId] = useState("");
  const [returnFocus, setReturnFocus] = useState<ReturnFocus>();
  const profileNameInput = useRef<HTMLInputElement>(null);
  const submittedName = useRef("");
  const saveSettingsButton = useRef<HTMLButtonElement>(null);
  const savedPreviewButton = useRef<HTMLButtonElement>(null);
  const savedDeleteButton = useRef<HTMLButtonElement>(null);
  const presetPreviewButton = useRef<HTMLButtonElement>(null);
  const restoreButton = useRef<HTMLButtonElement>(null);
  const restoreDeleteButton = useRef<HTMLButtonElement>(null);
  const restoreHeading = useRef<HTMLHeadingElement>(null);
  const pauseHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (showSave) profileNameInput.current?.focus();
  }, [showSave]);
  useEffect(() => {
    if (!saveNotice) return;
    setSavedName(submittedName.current);
    setShowSave(false);
    setName("");
    setReturnFocus("save");
  }, [saveNotice]);
  useEffect(() => {
    if (page !== "profiles") {
      setApplyTarget(undefined);
      setShowSave(false);
      setReturnFocus(undefined);
    } else if (returnFocus && !disabled) {
      const target = {
        save: saveSettingsButton.current,
        saved: savedPreviewButton.current ?? saveSettingsButton.current,
        "saved-delete": savedDeleteButton.current ?? saveSettingsButton.current,
        preset: presetPreviewButton.current,
        restore: restoreButton.current ?? restoreHeading.current,
        "restore-delete": restoreDeleteButton.current ?? restoreHeading.current,
      }[returnFocus];
      target?.focus();
      setReturnFocus(undefined);
    }
  }, [returnFocus, disabled, page]);
  const [addingRule, setAddingRule] = useState(false);
  const [ruleLanguage, setRuleLanguage] = useState("");
  const savedProfiles = state.profiles.filter((entry) => !entry.builtin);
  const selectedSaved =
    savedProfiles.find((entry) => entry.name === savedName) ?? savedProfiles[0];
  const savedScroll = usePickerScroll<HTMLDivElement>(
    savedProfiles.length,
    selectedSaved ? savedProfiles.indexOf(selectedSaved) : -1,
  );
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
    builtin?: boolean,
  ) =>
    send({
      type: "profile",
      action,
      ...(profileName ? { name: profileName } : {}),
      ...(restoreId ? { restoreId } : {}),
      ...(builtin === undefined ? {} : { builtin }),
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
  const canSave = state.settings.some(
    ({ configured, key }) =>
      configured && !(state.scope.language && key.startsWith("files.")),
  );
  const presets = state.profiles.filter((entry) => entry.builtin);
  const selectedPreset =
    presets.find((entry) => entry.name === presetName) ?? presets[0];
  const recoveryPending =
    state.recovery?.kind === "pause" ||
    (!!state.recovery && state.recovery.phase !== "applied");
  const restorePoints = state.restorePoints ?? [];
  const selectedRestore =
    restorePoints.find((point) => point.id === restoreId) ?? restorePoints[0];
  const activePause = state.recovery?.kind === "pause" ? state.recovery : null;
  const destination = (scope: Scope) => {
    if (scope.target === "user") return "User settings";
    if (scope.target === "workspace")
      return `Workspace: ${state.workspaceName ?? "Current workspace"}`;
    return `Folder: ${state.folders.find((folder) => folder.uri === scope.folder)?.name ?? scope.folder}`;
  };
  const lastApplied = restorePoints.find((point) => point.phase === "applied");
  const applyEntry =
    applyTarget &&
    state.profiles.find(
      (entry) =>
        entry.name === applyTarget.name &&
        entry.builtin === applyTarget.builtin,
    );
  const requiredLanguage = applyEntry?.languages?.length
    ? ""
    : applyEntry?.language;
  const languageMismatch =
    requiredLanguage !== undefined &&
    (state.scope.language ?? "") !== requiredLanguage;
  const closeApply = () => {
    clearApplyError();
    setApplyTarget(undefined);
  };
  const closeSave = () => {
    setShowSave(false);
    setName("");
  };
  const profileActions = (entry: Snapshot["profiles"][number]) => (
    <>
      <button
        type="button"
        ref={entry.builtin ? presetPreviewButton : savedPreviewButton}
        className="primary"
        disabled={disabled || !entry.count}
        aria-label={`Preview ${entry.name}`}
        onClick={() => {
          closeSave();
          clearApplyError();
          setApplyTarget({ name: entry.name, builtin: entry.builtin });
        }}
      >
        Preview
      </button>
      <button
        type="button"
        disabled={disabled || !entry.count}
        aria-label={`Export ${entry.name}`}
        onClick={() => profile("export", entry.name, undefined, entry.builtin)}
      >
        Export
      </button>
      {!entry.builtin && (
        <button
          type="button"
          ref={savedDeleteButton}
          disabled={disabled}
          aria-label={`Delete ${entry.name}`}
          onClick={() => {
            closeApply();
            profile("delete", entry.name);
          }}
        >
          Delete
        </button>
      )}
    </>
  );
  const restoreDetails = (point: (typeof restorePoints)[number]) =>
    `${point.name} · ${point.count} ${point.count === 1 ? "change" : "changes"}${point.scope.language ? ` · ${languageName(point.scope.language)}` : ""}`;
  const restoreIdentity = (point: (typeof restorePoints)[number]) => (
    <span className="restore-identity">
      <strong>{destination(point.scope)}</strong>
      <span className="profile-detail">
        {restoreDetails(point)}
        {point.phase !== "applied" && (
          <span className="restore-attention"> · Needs attention</span>
        )}
      </span>
    </span>
  );
  const closeEditors = () => {
    closeApply();
    closeSave();
  };
  const runRestoreAction = (action: "restore" | "discard", id: string) => {
    closeEditors();
    profile(action, undefined, id);
  };
  const restoringProfile =
    restoreRequest?.action === "restore" && !!restoreRequest.id;
  const deletingRestore =
    restoreRequest?.action === "discard" ? restoreRequest.id : undefined;
  const restoreToDelete = restorePoints.find(
    (point) => point.id === deletingRestore,
  );
  const respondToDeletion = (
    section: "saved" | "restore",
    accepted: boolean,
  ) => {
    setReturnFocus(accepted ? section : `${section}-delete`);
    replyToConfirmation(accepted);
  };
  const isPresetPreview = applyTarget?.builtin;
  const closeProfileReview = () => {
    closeApply();
    setReturnFocus(isPresetPreview ? "preset" : "saved");
  };
  const reviewing = !!applyEntry && reviewingProfile === applyEntry.name;
  const previewPanel = profileToApply ? (
    applyReview(closeProfileReview, () => replyToConfirmation(false))
  ) : applyEntry ? (
    <section
      key={applyEntry.name}
      ref={focusElement}
      tabIndex={-1}
      className="dashboard-confirmation"
      aria-label={`${recoveryPending ? "Preview" : "Apply"} ${applyEntry.name}`}
    >
      <h2>
        {recoveryPending ? "Preview" : "Apply"} {applyEntry.name}
      </h2>
      {scopeControls}
      {recoveryPending && (
        <div className="profile-apply-note">
          <p>
            {activePause
              ? "A workspace or folder pause is active. Resolve it before applying changes."
              : "Review the incomplete restore point before applying changes."}
          </p>
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => {
              closeApply();
              (activePause ? pauseHeading : restoreHeading).current?.focus();
            }}
          >
            {activePause ? "Go to workspace pause" : "Go to restore points"}
          </button>
        </div>
      )}
      {languageMismatch && (
        <p>
          Choose{" "}
          {requiredLanguage ? languageName(requiredLanguage) : "All languages"}{" "}
          to apply this profile.
        </p>
      )}
      {applyError?.name === applyEntry.name && (
        <p role="alert">{applyError.message}</p>
      )}
      <div className="button-row">
        <button type="button" disabled={pending} onClick={closeProfileReview}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          aria-label={reviewing ? undefined : "Review changes"}
          disabled={disabled || languageMismatch}
          onClick={() =>
            profile("apply", applyEntry.name, undefined, applyEntry.builtin)
          }
        >
          {reviewing ? "Reviewing changes…" : "Review"}
        </button>
      </div>
    </section>
  ) : (
    applyError && (
      <section
        className="dashboard-confirmation"
        aria-label={`Apply ${applyError.name}`}
      >
        <p role="alert">{applyError.message}</p>
        <button type="button" onClick={clearApplyError}>
          Dismiss
        </button>
      </section>
    )
  );
  const savedReview = !isPresetPreview && previewPanel;
  return (
    <div className="profiles-content">
      {state.workflowError && (
        <p className="error" role="alert">
          Profiles need attention: {state.workflowError}. Native formatting
          controls remain available.
        </p>
      )}
      <section
        id="saved-profiles"
        className="profile-section profile-section-compact"
      >
        <div className="section-header">
          <div>
            <h2>Saved profiles</h2>
            <p>Reuse formatting and save-action preferences across projects.</p>
          </div>
          {!showSave && !savedReview && (
            <div className="button-row">
              <button
                ref={saveSettingsButton}
                type="button"
                className="primary"
                aria-label="Save current settings"
                disabled={disabled}
                onClick={() => {
                  closeApply();
                  setShowSave(true);
                }}
              >
                Save
              </button>
              <button
                type="button"
                disabled={disabled}
                aria-label="Import profile"
                onClick={() => profile("import")}
              >
                Import
              </button>
            </div>
          )}
        </div>
        {(saveNotice || savedNotice) && (
          <p className="feedback" role="status">
            {saveNotice || savedNotice}
          </p>
        )}
        {showSave && (
          <form
            className="dashboard-confirmation"
            aria-label="Save current settings"
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && canSave && name.trim()) {
                submittedName.current = name.trim();
                profile("save", submittedName.current);
              }
            }}
          >
            <h2>Save current settings</h2>
            {scopeControls}
            {!canSave && (
              <p>
                Set a formatting or save-action preference for this scope and
                language first.
              </p>
            )}
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
                type="button"
                disabled={pending}
                onClick={() => {
                  closeSave();
                  setReturnFocus("save");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary"
                disabled={disabled || !canSave || !name.trim()}
              >
                {savingProfile ? "Saving profile…" : "Save"}
              </button>
            </div>
          </form>
        )}
        {savedReview}
        {!showSave &&
          !savedReview &&
          (selectedSaved || profileToDelete ? (
            <div className="profile-list profile-picker">
              <div
                className="picker-scroll"
                ref={savedScroll}
                role="radiogroup"
                aria-label="Saved profiles"
              >
                {savedProfiles.map((entry) => (
                  <ProfileChoice
                    className="profile-choice"
                    key={entry.name}
                    group="saved-profile"
                    value={entry.name}
                    checked={
                      entry.name === (profileToDelete ?? selectedSaved?.name)
                    }
                    disabled={pending}
                    select={setSavedName}
                  >
                    <span className="profile-identity">
                      <strong>{entry.name}</strong>
                      <span className="profile-detail">
                        {entry.languages?.map(languageName).join(" · ") ||
                          (entry.language
                            ? languageName(entry.language)
                            : "All languages")}
                      </span>
                    </span>
                  </ProfileChoice>
                ))}
              </div>
              {profileToDelete ? (
                <InlineDeleteConfirmation
                  noteId="saved-profile-delete-note"
                  note={`Delete saved profile ${profileToDelete}?`}
                  label="Delete saved profile"
                  cancelRef={focusElement}
                  respond={(accepted) => respondToDeletion("saved", accepted)}
                />
              ) : (
                selectedSaved && (
                  <div className="button-row profile-picker-actions">
                    {profileActions(selectedSaved)}
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="profile-empty">
              <h3>No saved profiles yet</h3>
              <p>Save your current settings or import a profile from JSON.</p>
            </div>
          ))}
      </section>
      {selectedPreset && (
        <section id="built-in-presets" className="profile-section">
          <h2>Built-in presets</h2>
          <p>Choose when automatic formatting runs.</p>
          {presetNotice && (
            <p className="feedback" role="status">
              {presetNotice}
            </p>
          )}
          {isPresetPreview ? (
            previewPanel
          ) : (
            <div className="profile-list profile-picker">
              <table
                className="preset-table"
                aria-label="Compare formatting presets"
              >
                <thead>
                  <tr>
                    <th scope="col">Preset</th>
                    <th scope="col">Save</th>
                    <th scope="col">Paste</th>
                    <th scope="col">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {formattingPresets.map(([name, save, paste, type]) => (
                    <tr key={name}>
                      <th scope="row">
                        <ProfileChoice
                          group="formatting-preset"
                          value={name}
                          checked={name === selectedPreset.name}
                          disabled={pending}
                          select={setPresetName}
                        >
                          {name}
                        </ProfileChoice>
                      </th>
                      {Object.entries({ save, paste, type }).map(
                        ([trigger, enabled]) => (
                          <td key={trigger} aria-label={enabled ? "On" : "Off"}>
                            {enabled ? "✓" : "–"}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="button-row profile-picker-actions">
                {profileActions(selectedPreset)}
              </div>
            </div>
          )}
        </section>
      )}
      <section
        id="restore-settings"
        className="profile-section profile-section-compact"
      >
        <h2 id="restore-settings-heading" ref={restoreHeading} tabIndex={-1}>
          Restore points
        </h2>
        {lastApplied && !restoringProfile && (
          <p>
            Last applied: {lastApplied.name} · {destination(lastApplied.scope)}{" "}
            ·{" "}
            {lastApplied.languageCount
              ? `${lastApplied.languageCount} ${lastApplied.languageCount === 1 ? "language" : "languages"}`
              : "All languages"}
          </p>
        )}
        {restoreNotice && (
          <p className="feedback" role="status">
            {restoreNotice}
          </p>
        )}
        {restoringProfile
          ? applyReview(() => setReturnFocus("restore"))
          : (selectedRestore || deletingRestore) && (
              <div className="profile-list profile-picker">
                {restorePoints.length === 1 && selectedRestore ? (
                  <div className="profile-choice">
                    {restoreIdentity(selectedRestore)}
                  </div>
                ) : (
                  <div role="radiogroup" aria-label="Restore points">
                    {restorePoints.map((point) => (
                      <ProfileChoice
                        className="profile-choice"
                        key={point.id}
                        group="restore-point"
                        value={point.id}
                        checked={
                          point.id === (deletingRestore ?? selectedRestore?.id)
                        }
                        disabled={pending}
                        select={setRestoreId}
                      >
                        {restoreIdentity(point)}
                      </ProfileChoice>
                    ))}
                  </div>
                )}
                {deletingRestore ? (
                  <InlineDeleteConfirmation
                    noteId="restore-point-delete-note"
                    note={`${restoreToDelete ? `Delete restore point for ${destination(restoreToDelete.scope)}?` : "Delete this restore point?"} Current settings will be kept.`}
                    label="Delete restore point"
                    cancelRef={focusElement}
                    respond={(accepted) =>
                      respondToDeletion("restore", accepted)
                    }
                  />
                ) : (
                  selectedRestore && (
                    <div className="button-row profile-picker-actions">
                      <button
                        type="button"
                        ref={restoreButton}
                        className="primary"
                        aria-label="Review restore"
                        disabled={pending}
                        onClick={() =>
                          runRestoreAction("restore", selectedRestore.id)
                        }
                      >
                        Review
                      </button>
                      <button
                        type="button"
                        ref={restoreDeleteButton}
                        disabled={pending}
                        aria-label="Delete restore point"
                        onClick={() =>
                          runRestoreAction("discard", selectedRestore.id)
                        }
                      >
                        Delete
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
        {restorePoints.length === 0 && !restoreNotice && !deletingRestore && (
          <p className="profile-empty restore-empty">
            A restore point appears after you apply a profile or preset.
          </p>
        )}
      </section>
      <section className="profile-section profile-pause">
        <h2 id="workspace-pause-heading" ref={pauseHeading} tabIndex={-1}>
          Workspace pause
        </h2>
        <p>
          Temporarily pause automatic formatting and configured save actions.
        </p>
        <WorkspacePause
          state={state}
          activePause={activePause}
          confirmation={pauseConfirmation}
          pending={pending}
          reviewing={reviewingPause}
          blocked={disabled || recoveryPending}
          send={send}
          onStart={closeEditors}
          reply={replyToConfirmation}
        />
        {pauseNotice && (
          <p className="feedback" role="status">
            {pauseNotice}
          </p>
        )}
      </section>
    </div>
  );
};
