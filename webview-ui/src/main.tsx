import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { languageName } from "../../shared/language";
import type { Key, Scope, Setting } from "../../shared/protocol";
import { formatterSource } from "../../shared/status-details";
import { BrandMark } from "./BrandMark";
import { actionNames, descriptions, display, labels, pages } from "./catalog";
import { Icon } from "./Icon";
import { useEditor } from "./useEditor";
import { WorkflowPages } from "./WorkflowPages";
import "./styles.css";

const App = () => {
  const { state, page, setPage, pending, error, setError, notice, send } =
    useEditor();
  const [search, setSearch] = useState("");
  const [customAction, setCustomAction] = useState("");
  const [customFormatter, setCustomFormatter] = useState("");
  const [delay, setDelay] = useState("");
  const settingsByKey = useMemo(
    () => new Map(state?.settings.map((setting) => [setting.key, setting])),
    [state?.settings],
  );
  const languages = useMemo(
    () => state?.languages.toSorted() ?? [],
    [state?.languages],
  );
  const effectiveDelay = settingsByKey.get("files.autoSaveDelay")?.effective;
  useEffect(() => setDelay(String(effectiveDelay ?? 1000)), [effectiveDelay]);
  const ready = !!state;
  const focusedNavigation = useRef(-1);
  useEffect(() => {
    if (!ready) return;
    document.getElementById(`page-${page}`)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    if (page === "diagnostics" && state?.focusFinding) {
      if (focusedNavigation.current === state.navigation) return;
      focusedNavigation.current = state.navigation;
      const finding = document.getElementById(`finding-${state.focusFinding}`);
      finding?.focus({ preventScroll: true });
      finding?.scrollIntoView({ block: "center" });
    }
  }, [page, ready, state?.focusFinding, state?.navigation]);
  if (!state)
    return (
      <main className="loading">
        <BrandMark />
        <h1>Formatting Controls</h1>
        <p role="status">Connecting to your editor…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const setting = (key: Key) => settingsByKey.get(key);
  const mutate = (key: Key, value: boolean | string | number) =>
    send({ type: "set", key, value, revision: state.revision });
  const open = (
    destination: "settings" | "github" | "docs" | "quickControls",
  ) => send({ type: "open", destination });
  const query = search.toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(query);
  const actions = setting("editor.codeActionsOnSave")?.effective;
  const actionObject =
    actions && typeof actions === "object" && !Array.isArray(actions)
      ? (actions as Record<string, unknown>)
      : {};
  const ids = Array.from(
    new Set([
      ...Object.keys(actionNames),
      ...Object.keys(actionObject).filter((k) => k.startsWith("source.")),
    ]),
  );
  const disabled = !!pending;
  const control = (key: Key) => {
    const s = setting(key);
    if (!s) return null;
    const blocked =
      disabled || (!!state.scope.language && key.startsWith("files."));
    if (typeof s.effective === "boolean")
      return (
        <input
          type="checkbox"
          aria-label={labels[key]}
          checked={s.effective}
          disabled={blocked}
          onChange={(event) => mutate(key, event.target.checked)}
        />
      );
    if (key === "files.autoSaveDelay")
      return (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            mutate(key, Number(delay));
          }}
        >
          <input
            aria-label="Auto Save delay in milliseconds"
            type="number"
            min="0"
            max="2147483647"
            step="1"
            required
            value={delay}
            onChange={(e) => setDelay(e.target.value)}
            disabled={blocked}
          />
          <button type="submit" disabled={blocked}>
            Apply
          </button>
        </form>
      );
    if (key === "editor.defaultFormatter") {
      const known = state.providers.filter((p) => p.installed && p.formatting);
      return (
        <div className="formatter-control">
          <select
            aria-label="Default formatter"
            value={String(s.effective ?? "")}
            disabled={blocked}
            onChange={(e) => mutate(key, e.target.value)}
          >
            <option value="" disabled>
              Not configured
            </option>
            {s.effective && !known.some((p) => p.id === s.effective) ? (
              <option value={String(s.effective)}>
                {String(s.effective)} (current)
              </option>
            ) : null}
            {known.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      );
    }
    const options =
      key === "files.autoSave"
        ? ["off", "afterDelay", "onFocusChange", "onWindowChange"]
        : ["file", "modifications", "modificationsIfAvailable"];
    return (
      <select
        aria-label={labels[key]}
        value={String(s.effective)}
        disabled={blocked}
        onChange={(e) => mutate(key, e.target.value)}
      >
        {options.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
    );
  };
  const formatterSetting = setting("editor.defaultFormatter");
  const formatter = display(formatterSetting?.effective);
  const source = (s: Setting) =>
    formatterSource(s, state.scope, languageName(state.activeLanguage)).replace(
      /\.$/gm,
      "",
    );
  const selectedFolder = state.folders.find(
    (folder) => folder.uri === state.scope.folder,
  );
  const scopeDescription =
    state.scope.target === "user"
      ? "Changes apply across your projects."
      : state.scope.target === "workspace"
        ? "Changes apply to this workspace."
        : `Changes apply only to the ${selectedFolder?.name ?? "selected"} folder.`;
  const status =
    state.status === "ON"
      ? "Enabled"
      : state.status === "OFF"
        ? "Disabled"
        : "Mixed";
  const paused = state.recovery?.kind === "pause";
  const canPause =
    !disabled &&
    (paused ||
      (state.scope.target !== "user" &&
        (!state.recovery || state.recovery.phase === "applied")));
  const settingRow = (key: Key) => {
    const s = setting(key);
    if (!s) return null;
    return (
      <article className="setting-row" key={key}>
        <div>
          <h3>{labels[key]}</h3>
          <p>{descriptions[key]}</p>
          <small>{source(s)}</small>
        </div>
        <div className="row-controls">{control(key)}</div>
      </article>
    );
  };
  const inspection = (s: Setting) => (
    <article className="setting-row" key={s.key}>
      <div>
        <h3>{labels[s.key]}</h3>
        <code>{s.key}</code>
        <small>{source(s)}</small>
      </div>
      <button
        type="button"
        className="text-button"
        disabled={
          disabled ||
          !s.configured ||
          (!!state.scope.language && s.key.startsWith("files."))
        }
        aria-label={`Reset at this scope: ${labels[s.key]}`}
        onClick={() =>
          send({ type: "reset", key: s.key, revision: state.revision })
        }
      >
        Reset at this scope
      </button>
      <details>
        <summary>Inspect sources for {labels[s.key]}</summary>
        <pre>{JSON.stringify(s.sources, null, 2)}</pre>
      </details>
    </article>
  );
  const actionSource = (id: string) => {
    const group = setting("editor.codeActionsOnSave");
    if (!group) return "Using VS Code default";
    const valueAt = (value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)[id]
        : undefined;
    return source({
      ...group,
      effective: actionObject[id],
      owned: valueAt(group.owned),
      configured: valueAt(group.owned) !== undefined,
      sources: Object.fromEntries(
        Object.entries(group.sources).map(([field, value]) => [
          field,
          valueAt(value),
        ]),
      ),
    });
  };
  const actionRow = (id: string) => (
    <article className="action-row" key={id}>
      <div>
        <h3>{actionNames[id] ?? "Custom source action"}</h3>
        <small>{actionSource(id)}</small>
        <code>{id}</code>
      </div>
      <select
        aria-label={`${actionNames[id] ?? id} run mode`}
        value={
          actionObject[id] === true
            ? "explicit"
            : actionObject[id] === false
              ? "never"
              : String(actionObject[id] ?? "")
        }
        disabled={disabled || Array.isArray(actions)}
        onChange={(e) =>
          send({
            type: "action",
            action: id,
            value: e.target.value as "explicit" | "always" | "never",
            revision: state.revision,
          })
        }
      >
        <option value="" disabled>
          Not configured
        </option>
        <option value="explicit">Explicit save</option>
        <option value="always">Always</option>
        <option value="never">Never</option>
      </select>
    </article>
  );
  return (
    <div className="app">
      <a className="skip-link" href="#page-content">
        Skip to controls
      </a>
      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => setPage("formatting")}
        >
          <BrandMark />
          <span>Kira Formatting Controls</span>
        </button>
        <button
          type="button"
          className="help-button"
          onClick={() => setPage("welcome")}
        >
          <Icon name="help" />
          Help
        </button>
      </header>
      <aside className="sidebar">
        <nav aria-label="Dashboard">
          {pages.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-current={page === p.id ? "page" : undefined}
              className={page === p.id ? "active" : ""}
              onClick={() => {
                setPage(p.id);
                setSearch("");
              }}
            >
              <Icon name={p.glyph} />
              {p.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="help-setup"
            aria-current={page === "welcome" ? "page" : undefined}
            onClick={() => setPage("welcome")}
          >
            <Icon name="book" />
            Help & setup
          </button>
          <p>Local settings. No telemetry.</p>
        </div>
      </aside>
      <div className="workspace">
        <main id="page-content" tabIndex={-1} aria-busy={disabled}>
          <div className="page-heading">
            <div>
              <h1 tabIndex={-1} id={`page-${page}`}>
                {pages.find((p) => p.id === page)?.name ?? "Help & setup"}
              </h1>
              <p className="subtitle">
                {
                  {
                    formatting: "Choose a formatter and when it runs.",
                    actions: "Control Auto Save, fixes and import actions.",
                    rules: "Keep language exceptions in one place.",
                    profiles: "Save and reuse formatting preferences.",
                    diagnostics: "Understand the settings that apply.",
                    welcome: "Set up formatting with confidence.",
                  }[page]
                }
              </p>
            </div>
            <button
              type="button"
              className="settings-button"
              aria-label="Open VS Code Settings"
              disabled={disabled}
              onClick={() => open("settings")}
            >
              <Icon name="sliders" />
            </button>
          </div>
          <section className="active-context" aria-label="Active editor">
            <Icon name="file" />
            <div>
              <span>
                {state.activeFile
                  ? `${state.activeFile.name} · ${languageName(state.activeFile.language)}`
                  : "No active file"}
              </span>
              <p>
                {state.workspaceName
                  ? `Workspace: ${state.workspaceName}`
                  : state.hasWorkspace
                    ? "Workspace open"
                    : "No workspace open"}
              </p>
              {state.folders.length > 1 && state.activeFile?.folder && (
                <p>Folder: {state.activeFile.folder}</p>
              )}
            </div>
          </section>
          <section className="scope-bar" aria-label="Configuration scope">
            <label>
              Scope
              <select
                value={
                  state.scope.target === "folder"
                    ? `folder:${state.scope.folder}`
                    : state.scope.target
                }
                disabled={disabled}
                onChange={(event) => {
                  const value = event.target.value;
                  const target = value.startsWith("folder:")
                    ? "folder"
                    : (value as Scope["target"]);
                  send(
                    { type: "read" },
                    {
                      target,
                      ...(target === "folder"
                        ? { folder: value.slice(7) }
                        : {}),
                      ...(state.scope.language
                        ? { language: state.scope.language }
                        : {}),
                    },
                  );
                }}
              >
                <option value="user">User</option>
                {state.hasWorkspace && (
                  <option value="workspace">Workspace</option>
                )}
                {state.folders.map((f) => (
                  <option key={f.uri} value={`folder:${f.uri}`}>
                    Folder: {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Language
              <select
                value={state.scope.language ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  send(
                    { type: "read" },
                    {
                      target: state.scope.target,
                      ...(state.scope.folder
                        ? { folder: state.scope.folder }
                        : {}),
                      ...(event.target.value
                        ? { language: event.target.value }
                        : {}),
                    },
                  )
                }
              >
                <option value="">All languages</option>
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {languageName(l)}
                  </option>
                ))}
              </select>
            </label>
            <p className="scope-description">
              {scopeDescription}
              {state.scope.language
                ? ` Editing ${languageName(state.scope.language)} rules.`
                : ""}
            </p>
          </section>
          {state.remoteName && state.scope.target === "user" && (
            <p className="callout" role="note">
              User changes may affect local User settings or existing Remote
              settings. Use VS Code Settings to select Remote explicitly.
            </p>
          )}
          <div aria-live="polite" className="feedback">
            {pending ? "Updating editor…" : notice}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button type="button" onClick={() => setError("")}>
                Dismiss
              </button>
            </div>
          )}
          {state.recovery &&
            page !== "profiles" &&
            state.recovery.kind !== "pause" && (
              <div className="callout">
                <div>
                  <strong>A profile restore point is available</strong>
                  <p>External edits are preserved on restore.</p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPage("profiles")}
                  >
                    Review in Profiles →
                  </button>
                </div>
              </div>
            )}
          {["rules", "diagnostics", "profiles"].includes(page) && (
            <WorkflowPages
              page={page}
              state={state}
              disabled={disabled}
              send={send}
              navigate={setPage}
              selectLanguage={(language) => {
                send({ type: "read" }, { ...state.scope, language });
                setPage("formatting");
              }}
            />
          )}
          {page === "formatting" && (
            <>
              <section className="formatter-section">
                <div className="formatter-row">
                  <div>
                    <h2>Formatter</h2>
                    <p>{formatterSetting && source(formatterSetting)}</p>
                  </div>
                  {control("editor.defaultFormatter")}
                </div>
              </section>
              <details className="disclosure">
                <summary>Installed formatter tools</summary>
                <p>
                  Installed extensions are hints, not a guarantee of language
                  support. Review provider settings when needed.
                </p>
                <section className="provider-grid">
                  {state.providers.map((p) => (
                    <article key={p.id}>
                      <div className="provider-heading">
                        <h3>{p.name}</h3>
                        <span
                          className={`tag ${p.installed ? "installed" : ""}`}
                        >
                          {p.installed ? "Present" : "Not found"}
                        </span>
                      </div>
                      <code>{p.id}</code>
                      <p>{p.note}</p>
                      <small>
                        Enable setting:{" "}
                        {p.enabled === null
                          ? "Unknown"
                          : p.enabled
                            ? "Yes"
                            : "No"}{" "}
                        · Format setting:{" "}
                        {p.formattingEnabled === null
                          ? "Unknown"
                          : p.formattingEnabled
                            ? "Yes"
                            : "No"}
                      </small>
                      <small>
                        Candidate actions:{" "}
                        {p.actions.join(", ") ||
                          "None declared by this adapter"}
                      </small>
                      <details>
                        <summary>Provider setting evidence</summary>
                        <pre>{JSON.stringify(p.evidence, null, 2)}</pre>
                      </details>
                      <button
                        type="button"
                        disabled={disabled || !p.installed}
                        aria-label={`Open provider settings: ${p.name}`}
                        onClick={() =>
                          send({ type: "providerSettings", provider: p.id })
                        }
                      >
                        Open provider settings
                      </button>
                      <button
                        type="button"
                        disabled={disabled || !p.installed || !p.formatting}
                        aria-label={`${formatter.toLowerCase() === p.id.toLowerCase() ? "Selected formatter" : "Set default formatter"}: ${p.name}`}
                        onClick={() => mutate("editor.defaultFormatter", p.id)}
                      >
                        {formatter.toLowerCase() === p.id.toLowerCase()
                          ? "Selected formatter"
                          : "Set default formatter"}
                      </button>
                    </article>
                  ))}
                </section>
              </details>
              <section className="automatic-section">
                <div className="section-header">
                  <div className="status-heading">
                    <h2>Automatic formatting</h2>
                    <span className="format-status">
                      <Icon
                        name={
                          status === "Enabled"
                            ? "enabled"
                            : status === "Disabled"
                              ? "disabled"
                              : "mixed"
                        }
                      />
                      {status}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={paused ? "resume-button" : ""}
                    disabled={!canPause}
                    onClick={() =>
                      send({
                        type: "formattingPause",
                        revision: state.revision,
                      })
                    }
                  >
                    {paused ? "Resume" : "Pause"}
                  </button>
                </div>
                <div className="trigger-list">
                  {[
                    "editor.formatOnSave",
                    "editor.formatOnPaste",
                    "editor.formatOnType",
                  ].map((key) => {
                    const s = setting(key as Key);
                    return (
                      s && (
                        <article className="trigger-row" key={key}>
                          {control(key as Key)}
                          <div>
                            <h3>{labels[key]}</h3>
                            <p>{source(s)}</p>
                          </div>
                        </article>
                      )
                    );
                  })}
                </div>
                {paused && (
                  <p className="workflow-note">
                    Pause session active. Resume restores unchanged settings and
                    keeps your edits.
                  </p>
                )}
                {!paused && state.scope.target === "user" && (
                  <p className="workflow-note">
                    Choose Workspace or Folder to pause automatic formatting.
                  </p>
                )}
              </section>
              <details className="disclosure">
                <summary>Advanced formatting settings</summary>
                {settingRow("editor.formatOnSaveMode")}
                <h3>Custom formatter</h3>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    mutate("editor.defaultFormatter", customFormatter);
                  }}
                >
                  <input
                    aria-label="Custom formatter extension ID"
                    maxLength={200}
                    placeholder="publisher.extension"
                    value={customFormatter}
                    onChange={(e) => setCustomFormatter(e.target.value)}
                    required
                    pattern="[\w\-]+\.[\w.\-]+"
                    disabled={disabled}
                  />
                  <button disabled={disabled} type="submit">
                    Use ID
                  </button>
                </form>
                <p>
                  Reset removes only the selected scope’s override; inherited
                  settings apply.
                </p>
                {state.settings
                  .filter(
                    (s) =>
                      s.key.startsWith("editor.format") ||
                      s.key === "editor.defaultFormatter",
                  )
                  .map(inspection)}
              </details>
            </>
          )}
          {page === "actions" && (
            <>
              <section className="save-section">
                <h2>Auto Save</h2>
                {settingRow("files.autoSave")}
                {settingRow("files.autoSaveDelay")}
                {state.scope.language && (
                  <p>Select All languages to edit Auto Save.</p>
                )}
                <details className="disclosure">
                  <summary>Auto Save setting sources</summary>
                  {state.settings
                    .filter((s) => s.key.startsWith("files."))
                    .map(inspection)}
                </details>
              </section>
              <section className="save-section">
                <h2>Code actions on save</h2>
                <p>
                  Requested separately from formatting; execution depends on the
                  provider. Always includes focus/window Auto Save, without
                  promising afterDelay or action ordering.
                </p>
                {Array.isArray(actions) && (
                  <p className="error" role="alert">
                    Legacy action arrays must be migrated in VS Code Settings
                    before editing.
                  </p>
                )}
                <section className="settings-list">
                  {["source.fixAll", "source.organizeImports"].map(actionRow)}
                </section>
                <details className="disclosure">
                  <summary>Provider-specific actions</summary>
                  <input
                    className="search"
                    type="search"
                    aria-label="Search code actions"
                    placeholder="Find an action…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <section className="settings-list">
                    {ids
                      .filter(
                        (id) =>
                          !["source.fixAll", "source.organizeImports"].includes(
                            id,
                          ) && matches(`${id} ${actionNames[id] ?? ""}`),
                      )
                      .map(actionRow)}
                  </section>
                  <form
                    className="custom-action"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send({
                        type: "action",
                        action: customAction,
                        value: "explicit",
                        revision: state.revision,
                      });
                    }}
                  >
                    <label>
                      Another provider action
                      <input
                        value={customAction}
                        onChange={(e) => setCustomAction(e.target.value)}
                        placeholder="source.fixAll.provider"
                        maxLength={200}
                        required
                        pattern="source(\.[a-zA-Z0-9_\-]+)+"
                        disabled={disabled}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={disabled || Array.isArray(actions)}
                    >
                      Add for explicit save
                    </button>
                  </form>
                </details>
              </section>
            </>
          )}
          {page === "welcome" && (
            <section className="welcome">
              <span className="eyebrow">WELCOME TO A CALMER WORKFLOW</span>
              <h2>
                Your formatting.
                <br />
                Under control.
              </h2>
              <p>
                Keep your editor’s formatting and save actions understandable,
                with native quick controls and a dashboard that shows what
                actually applies.
              </p>
              <div className="welcome-steps">
                <article>
                  <span>01</span>
                  <h3>Choose the scope</h3>
                  <p>
                    Select User, Workspace, or a specific folder above. Add a
                    language when you need an override.
                  </p>
                </article>
                <article>
                  <span>02</span>
                  <h3>Pick your behavior</h3>
                  <p>
                    Review effective values, then change individual settings.
                    Nothing is changed just by opening this page.
                  </p>
                </article>
                <article>
                  <span>03</span>
                  <h3>Keep your flow</h3>
                  <p>
                    Use the status bar for everyday adjustments. Come here to
                    inspect overrides and source actions.
                  </p>
                </article>
              </div>
              <div className="welcome-buttons">
                <button
                  type="button"
                  className="primary"
                  onClick={() => setPage("formatting")}
                >
                  Set up my formatting →
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => open("docs")}
                >
                  Documentation ↗
                </button>
              </div>
            </section>
          )}
          <footer>
            <button
              type="button"
              disabled={disabled}
              onClick={() => open("docs")}
            >
              Documentation ↗
            </button>
            <span>
              {state.scope.target === "user"
                ? "User settings"
                : (selectedFolder?.name ?? "Workspace")}{" "}
              ·{" "}
              {state.scope.language
                ? languageName(state.scope.language)
                : "All languages"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
};
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
