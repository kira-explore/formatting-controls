import { useEffect, useRef, useState } from "react";
import { pauseScopeLabel } from "../../shared/pause-scope";
import type {
  Operation,
  Response,
  Scope,
  Snapshot,
} from "../../shared/protocol";
import type { Recovery } from "../../shared/workflows";
import { ChangeReview } from "./ChangeReview";

export type PauseConfirmation = Extract<Response, { type: "confirmation" }> & {
  action: "pause" | "restore" | "discard";
};

const focusReview = (panel: HTMLElement | null) => panel?.focus();
const countLabel = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export const pausedDestination = (scope: Scope, folders: Snapshot["folders"]) =>
  pauseScopeLabel(scope, folders.find(({ uri }) => uri === scope.folder)?.name);

export const PauseReview = ({
  confirmation,
  folders,
  respond,
}: {
  confirmation: PauseConfirmation;
  folders: Snapshot["folders"];
  respond: (accepted: boolean) => void;
}) => {
  const { action, changes } = confirmation;
  const resuming = action === "restore";
  const keeping = action === "discard";
  const title = keeping
    ? "Keep current settings and end pause?"
    : resuming
      ? "Review resume"
      : "Review pause";
  const confirmLabel = keeping
    ? "Keep settings"
    : resuming
      ? "Resume and restore settings"
      : "Apply pause";
  const canConfirm = action !== "pause" || changes.length > 0;
  return (
    <section
      className="dashboard-confirmation pause-review"
      aria-label={title}
      key={confirmation.token}
      ref={focusReview}
      tabIndex={-1}
    >
      <h2>{title}</h2>
      <p>{pausedDestination(confirmation.scope, folders)}</p>
      {keeping ? (
        <p>
          Ending the pause here keeps your current settings, including any
          formatting and save actions that are still off.
        </p>
      ) : changes.length > 0 ? (
        <div className="change-review">
          <ChangeReview changes={changes} friendlyActions />
        </div>
      ) : (
        <p>
          {resuming
            ? "There are no settings to restore."
            : "These preferences already match the selected scope."}
        </p>
      )}
      {resuming && (
        <p>Settings edited during the pause keep their newer values.</p>
      )}
      <div className="button-row">
        <button type="button" onClick={() => respond(false)}>
          {canConfirm ? "Cancel" : "Done"}
        </button>
        {canConfirm && (
          <button
            type="button"
            className="primary"
            aria-label={action === "pause" ? confirmLabel : undefined}
            onClick={() => respond(true)}
          >
            {action === "pause" ? "Apply" : confirmLabel}
          </button>
        )}
      </div>
    </section>
  );
};

interface Props {
  state: Snapshot;
  activePause: Recovery | null;
  confirmation: PauseConfirmation | undefined;
  pending: boolean;
  reviewing: boolean;
  blocked: boolean;
  send: (operation: Operation, scope?: Scope) => void;
  onStart: () => void;
  reply: (accepted: boolean) => void;
}

export const WorkspacePause = ({
  state,
  activePause,
  confirmation,
  pending,
  reviewing,
  blocked,
  send,
  onStart,
  reply,
}: Props) => {
  const [chosen, setChosen] = useState<string>();
  const [returnFocus, setReturnFocus] = useState(false);
  const scopeSelect = useRef<HTMLSelectElement>(null);
  const resumeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!returnFocus || confirmation || pending) return;
    (resumeButton.current ?? scopeSelect.current)?.focus();
    setReturnFocus(false);
  }, [confirmation, pending, returnFocus]);

  const defaultScope =
    state.scope.target === "folder" ? state.scope.folder : undefined;
  const requestedFolder = chosen ?? defaultScope;
  const folder = state.folders.find(({ uri }) => uri === requestedFolder);
  const blockedStart = pending || blocked;
  const scope: Scope = folder
    ? { target: "folder", folder: folder.uri }
    : { target: "workspace" };
  const revision = state.revision;

  if (confirmation) {
    return (
      <PauseReview
        confirmation={confirmation}
        folders={state.folders}
        respond={(accepted) => {
          setReturnFocus(true);
          reply(accepted);
        }}
      />
    );
  }

  if (activePause) {
    const { formatting = 0, saveActions = 0 } = activePause.pauseChanges ?? {};
    const counts = [
      formatting ? countLabel(formatting, "automatic formatting setting") : "",
      saveActions ? countLabel(saveActions, "save action") : "",
    ]
      .filter(Boolean)
      .join(" and ");
    const resume = (action: "restore" | "discard") => {
      onStart();
      send({ type: "profile", action, revision });
    };
    return (
      <section className="profile-list pause-active" aria-label="Current pause">
        <span className="pause-status">
          {activePause.phase === "applied"
            ? "Pause active"
            : "Pause needs attention"}
        </span>
        <h3>{pausedDestination(activePause.scope, state.folders)}</h3>
        <p>
          {activePause.phase !== "applied"
            ? "Review the pause to see which settings can be restored."
            : counts
              ? `${counts} paused at this scope.`
              : "Formatting is paused at this scope."}
        </p>
        <div className="button-row">
          <button
            type="button"
            ref={resumeButton}
            className="primary"
            title="Review which settings to restore"
            disabled={pending}
            onClick={() => resume("restore")}
          >
            Resume
          </button>
          <button
            type="button"
            aria-label="Keep settings and end pause"
            title="Keep settings and end pause"
            disabled={pending}
            onClick={() => resume("discard")}
          >
            Keep settings
          </button>
        </div>
      </section>
    );
  }

  if (!state.hasWorkspace)
    return (
      <p className="profile-empty">
        Open a folder or workspace to pause its settings.
      </p>
    );

  return (
    <div className="profile-list pause-scope">
      <label>
        Pause in
        <span className="scope-select">
          <select
            ref={scopeSelect}
            value={folder?.uri ?? ""}
            disabled={blockedStart}
            onChange={(event) => setChosen(event.target.value)}
          >
            <option value="">Entire workspace</option>
            {state.folders.map(({ uri, name }) => (
              <option key={uri} value={uri}>
                Folder: {name}
              </option>
            ))}
          </select>
        </span>
      </label>
      <button
        type="button"
        className="primary"
        aria-label={reviewing ? undefined : "Review pause"}
        disabled={blockedStart}
        onClick={() => {
          onStart();
          send({ type: "pause", revision }, scope);
        }}
      >
        {reviewing ? "Preparing preview…" : "Review"}
      </button>
    </div>
  );
};
