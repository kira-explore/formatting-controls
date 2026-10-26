import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Key, Scope } from "../../shared/protocol";
import {
  actionEnabled,
  type QuickTab,
  saveActions,
} from "../../shared/status-hover";
import { actionNames, labels } from "./catalog";
import { useEditor } from "./useEditor";
import "./quick.css";

export function QuickControls() {
  const { state, pending, error, setError, notice, send } = useEditor();
  const [tab, setTab] = useState<QuickTab>("formatting");
  const [customAction, setCustomAction] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const navigation = state?.navigation;
  const requestedTab = state?.quickTab;
  useEffect(() => {
    if (navigation !== undefined) {
      setTab(requestedTab ?? "formatting");
      heading.current?.focus({ preventScroll: true });
    }
  }, [navigation, requestedTab]);
  if (!state)
    return (
      <main className="quick-shell">
        <p role="status">Loading quick controls…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const disabled = !!pending;
  const setting = (key: Key) => state.settings.find((s) => s.key === key);
  const mutate = (key: Key, value: boolean | string | number) =>
    send({ type: "set", key, value, revision: state.revision });
  const setScope = (scope: Scope) => send({ type: "read" }, scope);
  const actionValue = setting("editor.codeActionsOnSave")?.effective;
  const actions = saveActions(actionValue);
  const legacyActions =
    actionValue !== undefined &&
    (typeof actionValue !== "object" ||
      actionValue === null ||
      Array.isArray(actionValue));
  const activeActions = actions.filter(([, value]) =>
    actionEnabled(value),
  ).length;
  const ids = [
    ...new Set([
      ...actions.map(([id]) => id),
      "source.fixAll",
      "source.organizeImports",
    ]),
  ];
  const formatter = setting("editor.defaultFormatter")?.effective;
  const provider = state.providers.find((p) => p.id === formatter);
  const selectTab = (next: QuickTab) => setTab(next);
  const changeTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: QuickTab =
      event.key === "Home"
        ? "formatting"
        : event.key === "End"
          ? "actions"
          : tab === "formatting"
            ? "actions"
            : "formatting";
    setTab(next);
    document.getElementById(`quick-${next}-tab`)?.focus();
  };
  return (
    <main className="quick-shell">
      <a className="skip-link" href="#quick-formatting-tab">
        Skip to quick controls
      </a>
      <article
        className="quick-card"
        aria-label="Formatting Controls quick settings"
      >
        <header className="quick-header">
          <h1 ref={heading} tabIndex={-1}>
            <span className="quick-logo" aria-hidden="true">
              ≋
            </span>{" "}
            Formatting Controls
          </h1>
          <span className="quick-badge">
            {state.status === "MIXED"
              ? "Mixed"
              : state.status === "ON"
                ? "On"
                : "Off"}
          </span>
        </header>
        <div className="quick-context">
          <span title={state.resource}>
            {state.resource === "No active file"
              ? "No active editor"
              : decodeURIComponent(state.resource.split("/").pop() ?? "")}
          </span>
          <span>{state.activeLanguage}</span>
        </div>
        <div className="quick-tabs" role="tablist" aria-label="Quick settings">
          <button
            type="button"
            id="quick-formatting-tab"
            role="tab"
            aria-controls="quick-formatting-panel"
            aria-selected={tab === "formatting"}
            tabIndex={tab === "formatting" ? 0 : -1}
            onKeyDown={changeTab}
            onClick={() => selectTab("formatting")}
          >
            Formatting
          </button>
          <button
            type="button"
            id="quick-actions-tab"
            role="tab"
            aria-controls="quick-actions-panel"
            aria-selected={tab === "actions"}
            tabIndex={tab === "actions" ? 0 : -1}
            onKeyDown={changeTab}
            onClick={() => selectTab("actions")}
          >
            Save actions <span className="quick-count">{activeActions}</span>
          </button>
        </div>
        <section className="quick-scopes" aria-label="Configuration scope">
          <label>
            Write to
            <select
              aria-label="Settings scope"
              value={state.scope.target}
              disabled={disabled}
              onChange={(event) => {
                const target = event.target.value as Scope["target"];
                const next: Scope = { ...state.scope, target };
                delete next.folder;
                const folder = state.scope.folder ?? state.folders[0]?.uri;
                if (target === "folder" && folder) next.folder = folder;
                setScope(next);
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
                value={state.scope.folder}
                disabled={disabled}
                onChange={(event) =>
                  setScope({ ...state.scope, folder: event.target.value })
                }
              >
                {state.folders.map((folder) => (
                  <option key={folder.uri} value={folder.uri}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Language
            <select
              aria-label="Language scope"
              value={state.scope.language ?? ""}
              disabled={disabled}
              onChange={(event) => {
                const next: Scope = { ...state.scope };
                if (event.target.value) next.language = event.target.value;
                else delete next.language;
                setScope(next);
              }}
            >
              <option value="">All languages</option>
              {[...state.languages].sort().map((language) => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </label>
        </section>
        {state.remoteName && state.scope.target === "user" && (
          <p className="quick-note">
            User changes may affect local User or existing Remote settings. Use
            VS Code Settings to choose Remote explicitly.
          </p>
        )}
        <div className="quick-feedback" role="status" aria-live="polite">
          {pending ? "Updating editor…" : notice}
        </div>
        {error && (
          <div className="quick-error" role="alert">
            {error}
            <button type="button" onClick={() => setError("")}>
              Dismiss error
            </button>
          </div>
        )}
        <section
          id="quick-formatting-panel"
          role="tabpanel"
          aria-labelledby="quick-formatting-tab"
          hidden={tab !== "formatting"}
        >
          {(
            [
              "editor.formatOnSave",
              "editor.formatOnPaste",
              "editor.formatOnType",
            ] as const
          ).map((key) => {
            const item = setting(key);
            const effective = item?.effective === true;
            const owned =
              typeof item?.owned === "boolean" ? item.owned : effective;
            return (
              <div className="quick-setting" key={key}>
                <label htmlFor={`quick-${key}`}>
                  <span>{labels[key]}</span>
                  <small id={`quick-${key}-scope`}>
                    {item?.configured
                      ? `At selected scope: ${owned ? "On" : "Off"}`
                      : "Inherited at this scope"}
                    {owned !== effective
                      ? ` · Effective: ${effective ? "On" : "Off"}`
                      : ""}
                  </small>
                </label>
                <span className="quick-check">
                  <span>{owned ? "On" : "Off"}</span>
                  <input
                    id={`quick-${key}`}
                    type="checkbox"
                    aria-label={labels[key]}
                    aria-describedby={`quick-${key}-scope`}
                    checked={owned}
                    disabled={disabled}
                    onChange={(event) => mutate(key, event.target.checked)}
                  />
                </span>
              </div>
            );
          })}
          <div className="quick-formatter">
            <span>Default formatter</span>
            <span>
              {typeof formatter === "string"
                ? (provider?.name ?? formatter)
                : "Not configured"}
            </span>
          </div>
          <button
            type="button"
            className="quick-text-link"
            disabled={disabled}
            onClick={() => send({ type: "open", destination: "dashboard" })}
          >
            Manage formatters in dashboard ↗
          </button>
        </section>
        <section
          id="quick-actions-panel"
          role="tabpanel"
          aria-labelledby="quick-actions-tab"
          hidden={tab !== "actions"}
        >
          <p className="quick-note">
            Separate from formatting. Requires a compatible provider. Changes
            preserve unrelated action entries.
          </p>
          {legacyActions ? (
            <p className="quick-error">
              Migrate the legacy or unsupported save-action value in VS Code
              Settings before editing actions.
            </p>
          ) : (
            ids.map((id) => {
              const effective = actions.find(([key]) => key === id)?.[1];
              const ownActions = setting("editor.codeActionsOnSave")?.owned;
              const stored =
                ownActions &&
                typeof ownActions === "object" &&
                !Array.isArray(ownActions)
                  ? (ownActions as Record<string, unknown>)[id]
                  : undefined;
              const value =
                effective === true
                  ? "explicit"
                  : effective === false
                    ? "never"
                    : typeof effective === "string"
                      ? effective
                      : "unset";
              return (
                <label className="quick-action" key={id}>
                  <span>
                    {actionNames[id] ?? id}
                    <small>
                      {stored === undefined
                        ? "Inherited at this scope"
                        : "Configured at selected scope"}
                    </small>
                  </span>
                  <select
                    aria-label={actionNames[id] ?? id}
                    value={value}
                    disabled={disabled}
                    onChange={(event) =>
                      send({
                        type: "action",
                        action: id,
                        value: event.target.value as
                          | "explicit"
                          | "always"
                          | "never",
                        revision: state.revision,
                      })
                    }
                  >
                    {value === "unset" && (
                      <option value="unset" disabled>
                        Not configured
                      </option>
                    )}
                    {!["unset", "explicit", "always", "never"].includes(
                      value,
                    ) && (
                      <option disabled value={value}>
                        Unsupported value
                      </option>
                    )}
                    <option value="explicit">Explicit saves</option>
                    <option value="always">All supported saves</option>
                    <option value="never">Never</option>
                  </select>
                </label>
              );
            })
          )}
          {!legacyActions && (
            <form
              className="quick-add-action"
              onSubmit={(event) => {
                event.preventDefault();
                send({
                  type: "action",
                  action: customAction,
                  value: "explicit",
                  revision: state.revision,
                });
              }}
            >
              <input
                aria-label="Custom save action ID"
                placeholder="source.fixAll.provider"
                value={customAction}
                maxLength={200}
                pattern="source(\.[a-zA-Z0-9_-]+)+"
                required
                disabled={disabled}
                onChange={(event) => setCustomAction(event.target.value)}
              />
              <button type="submit" disabled={disabled}>
                Add
              </button>
            </form>
          )}
        </section>
        {state.workflowError && (
          <p className="quick-error" role="alert">
            {state.workflowError}
          </p>
        )}
        <div className="quick-pause-row">
          <button
            type="button"
            disabled={
              disabled ||
              !!state.workflowError ||
              (!state.recovery && state.scope.target === "user")
            }
            onClick={() =>
              state.recovery
                ? send({
                    type: "profile",
                    action: "restore",
                    revision: state.revision,
                  })
                : send({ type: "pause", revision: state.revision })
            }
          >
            {state.recovery ? "Resume / restore" : "Preview pause"}
          </button>
          <span>
            {state.recovery
              ? `${state.recovery.phase} · ${state.recovery.scope.target}`
              : "Workspace scopes only"}
          </span>
        </div>
        {state.recovery?.phase === "conflicts" && (
          <button
            type="button"
            className="quick-text-link"
            disabled={disabled}
            onClick={() => send({ type: "open", destination: "dashboard" })}
          >
            Review externally edited values in Profiles ↗
          </button>
        )}
        <footer className="quick-footer">
          <button
            type="button"
            disabled={disabled}
            className="quick-text-link"
            onClick={() => send({ type: "open", destination: "dashboard" })}
          >
            Open dashboard ↗
          </button>
          <button
            type="button"
            disabled={disabled}
            className="quick-settings-link"
            onClick={() => send({ type: "open", destination: "settings" })}
          >
            VS Code Settings
          </button>
        </footer>
      </article>
    </main>
  );
}
