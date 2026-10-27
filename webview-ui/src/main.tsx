import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Key, Scope } from "../../shared/protocol";
import { actionNames, descriptions, display, labels, pages } from "./catalog";
import { useEditor } from "./useEditor";
import { WorkflowPages } from "./WorkflowPages";
import "./styles.css";
import { QuickControls } from "./QuickControls";
import "./quick-controls.css";

function App() {
  const { state, page, setPage, pending, error, setError, notice, send } =
    useEditor();
  const [search, setSearch] = useState("");
  const [customAction, setCustomAction] = useState("");
  const [customFormatter, setCustomFormatter] = useState("");
  const [delay, setDelay] = useState("");
  const effectiveDelay = state?.settings.find(
    (s) => s.key === "files.autoSaveDelay",
  )?.effective;
  useEffect(() => setDelay(String(effectiveDelay ?? 1000)), [effectiveDelay]);
  const ready = !!state;
  useEffect(() => {
    if (!ready) return;
    document.getElementById(`page-${page}`)?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [page, ready]);
  if (!state)
    return (
      <main className="loading">
        <div className="brand-mark">≋</div>
        <h1>Formatting Controls</h1>
        <p role="status">Connecting to your editor…</p>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  const setting = (key: Key) => state.settings.find((s) => s.key === key);
  const mutate = (key: Key, value: boolean | string | number) =>
    send({ type: "set", key, value, revision: state.revision });
  const open = (
    destination: "settings" | "github" | "docs" | "quickControls",
  ) => send({ type: "open", destination });
  const matches = (text: string) =>
    text.toLowerCase().includes(search.toLowerCase());
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
  const inherited = (key: Key) => {
    const s = setting(key);
    return s?.configured
      ? `At selected scope: ${display(s.owned)}`
      : "Inherited · no value at selected scope";
  };
  const control = (key: Key) => {
    const s = setting(key);
    if (!s) return null;
    const blocked =
      disabled || (!!state.scope.language && key.startsWith("files."));
    if (typeof s.effective === "boolean")
      return (
        <button
          type="button"
          role="switch"
          aria-checked={s.effective}
          aria-label={labels[key]}
          className={`switch ${s.effective ? "on" : ""}`}
          disabled={blocked}
          onClick={() => mutate(key, !s.effective)}
        >
          <span />
          {s.effective ? "On" : "Off"}
        </button>
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
              Choose a formatter
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
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              mutate(key, customFormatter);
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
              disabled={blocked}
            />
            <button disabled={blocked} type="submit">
              Use ID
            </button>
          </form>
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
  const rows = state.settings.filter(
    (s) =>
      s.key !== "editor.codeActionsOnSave" &&
      matches(`${s.key} ${labels[s.key]} ${descriptions[s.key]}`),
  );
  const formatter = display(setting("editor.defaultFormatter")?.effective);
  return (
    <div className="app">
      <a className="skip-link" href="#page-content">
        Skip to controls
      </a>
      <aside className="sidebar">
        <button
          type="button"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPage("overview");
          }}
        >
          <span className="brand-mark">≋</span>
          <span>
            Formatting
            <br /> <strong>Controls</strong>
          </span>
        </button>
        <div className="nav-caption">WORKSPACE TOOLS</div>
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
              <span aria-hidden="true">{p.glyph}</span>
              {p.name}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="privacy-dot" />
          VS Code settings. No telemetry.
          <button
            type="button"
            disabled={disabled}
            onClick={() => open("github")}
          >
            GitHub ↗
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>YOUR EDITOR, YOUR RULES</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => open("quickControls")}
          >
            Quick Controls ↗
          </button>
        </header>
        <main id="page-content" tabIndex={-1} aria-busy={disabled}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">FORMATTING CONTROLS</p>
              <h1 tabIndex={-1} id={`page-${page}`}>
                {pages.find((p) => p.id === page)?.name ?? "Overview"}
              </h1>
              <p className="subtitle">
                A clear view of what happens to your code.
              </p>
            </div>
            <span className={`status-pill ${state.status.toLowerCase()}`}>
              <i />
              {state.status === "MIXED"
                ? "Mixed formatting"
                : `Formatting ${state.status.toLowerCase()}`}
            </span>
          </div>
          <section className="scope-bar" aria-label="Configuration scope">
            <label>
              Write to
              <select
                value={state.scope.target}
                disabled={disabled}
                onChange={(e) => {
                  const target = e.target.value as Scope["target"];
                  send({ type: "read" }, {
                    ...state.scope,
                    target,
                    ...(target === "folder" && state.folders[0]
                      ? { folder: state.folders[0].uri }
                      : { folder: undefined }),
                  } as Scope);
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
                  value={state.scope.folder}
                  disabled={disabled}
                  onChange={(e) =>
                    send(
                      { type: "read" },
                      { ...state.scope, folder: e.target.value },
                    )
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
              Language
              <select
                value={state.scope.language ?? ""}
                disabled={disabled}
                onChange={(e) => {
                  const scope: Scope = {
                    target: state.scope.target,
                    ...(state.scope.folder
                      ? { folder: state.scope.folder }
                      : {}),
                    ...(e.target.value ? { language: e.target.value } : {}),
                  };
                  send({ type: "read" }, scope);
                }}
              >
                <option value="">All languages</option>
                {[...state.languages].sort().map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <div className="scope-note">
              <strong>Effective for {state.activeLanguage}</strong>
              <span title={state.resource}>
                {state.resource === "No active file"
                  ? state.resource
                  : state.resource.split("/").pop()}
              </span>
            </div>
          </section>
          {state.remoteName && state.scope.target === "user" && (
            <div className="callout" role="note">
              <div>
                <strong>Remote workspace</strong>
                <p>
                  User changes may affect local User settings or existing Remote
                  settings. Choose a workspace scope to keep changes in this
                  project. Use VS Code Settings to select Remote explicitly.
                </p>
              </div>
            </div>
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
          {state.recovery && (
            <div className="callout">
              <span aria-hidden="true">↶</span>
              <div>
                <strong>
                  {state.recovery.kind === "pause"
                    ? "A workspace pause / recovery record is saved"
                    : "A profile restore point is available"}
                </strong>
                <p>
                  {state.recovery.count} values · {state.recovery.scope.target}{" "}
                  · {state.recovery.phase}. External changes are preserved on
                  restore.
                </p>
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
              selectLanguage={(language) => {
                send({ type: "read" }, { ...state.scope, language });
                setPage("formatting");
              }}
            />
          )}
          {page === "overview" && (
            <>
              <section className="hero">
                <div>
                  <span className="eyebrow">LESS FRICTION. MORE FLOW.</span>
                  <h2>
                    Make every save
                    <br />
                    work your way.
                  </h2>
                  <p>
                    Formatting, fixes, and import actions in one place.
                    <br />
                    You choose the scope. VS Code applies the settings.
                  </p>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setPage("formatting")}
                  >
                    Configure formatting <span>→</span>
                  </button>
                </div>
                <fieldset
                  className="save-stack"
                  aria-label="Current formatting triggers"
                >
                  {[
                    "editor.formatOnSave",
                    "editor.formatOnPaste",
                    "editor.formatOnType",
                  ].map((k) => (
                    <div key={k}>
                      <span>{labels[k]}</span>
                      {control(k as Key)}
                    </div>
                  ))}
                </fieldset>
              </section>
              <section className="summary-grid">
                <article>
                  <span className="eyebrow">DEFAULT FORMATTER</span>
                  <h3 className="wrap">
                    {state.providers.find((p) => p.id === formatter)?.name ??
                      formatter}
                  </h3>
                  <p>
                    Configured preference; actual eligibility depends on your
                    language and provider.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPage("formatters")}
                  >
                    Review formatters →
                  </button>
                </article>
                <article>
                  <span className="eyebrow">SAVE-TIME ACTIONS</span>
                  <h3>
                    {
                      Object.values(actionObject).filter(
                        (v) => v === true || v === "explicit" || v === "always",
                      ).length
                    }{" "}
                    configured to run
                  </h3>
                  <p>
                    Code actions are separate from formatting and require a
                    compatible provider.
                  </p>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setPage("actions")}
                  >
                    Manage actions →
                  </button>
                </article>
              </section>
              <div className="callout">
                <span aria-hidden="true">◎</span>
                <div>
                  <strong>Understand the value that wins</strong>
                  <p>
                    Controls show effective values, including active-language
                    overrides. Each change writes only to your selected scope.
                    Inspect Formatting for the underlying sources.
                  </p>
                </div>
              </div>
            </>
          )}
          {page === "formatting" && (
            <>
              <div className="section-header">
                <div>
                  <h2>Formatting & save behavior</h2>
                  <p>Changes apply immediately to the scope above.</p>
                </div>
                <input
                  className="search"
                  type="search"
                  placeholder="Search settings…"
                  aria-label="Search settings"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <section className="settings-list">
                {rows.map((s) => (
                  <article className="setting-row" key={s.key}>
                    <div>
                      <h3>{labels[s.key]}</h3>
                      <p>{descriptions[s.key]}</p>
                      <code>{s.key}</code>
                      <small>{inherited(s.key)}</small>
                      {s.configured &&
                        typeof s.effective !== "object" &&
                        s.owned !== s.effective && (
                          <p className="override">
                            An override changes the selected value. Effective:{" "}
                            {display(s.effective)}
                          </p>
                        )}
                      {state.scope.language && s.key.startsWith("files.") && (
                        <p>Select All languages to edit Auto Save.</p>
                      )}
                    </div>
                    <div className="row-controls">
                      {control(s.key)}
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`Reset at this scope: ${labels[s.key] ?? s.key}`}
                        disabled={
                          disabled ||
                          !s.configured ||
                          (!!state.scope.language && s.key.startsWith("files."))
                        }
                        onClick={() =>
                          send({
                            type: "reset",
                            key: s.key,
                            revision: state.revision,
                          })
                        }
                      >
                        Reset at this scope
                      </button>
                    </div>
                    <details>
                      <summary>
                        Inspect sources for {labels[s.key] ?? s.key}
                      </summary>
                      <pre>{JSON.stringify(s.sources, null, 2)}</pre>
                    </details>
                  </article>
                ))}
                {!rows.length && (
                  <p className="empty">No settings match “{search}”.</p>
                )}
              </section>
            </>
          )}
          {page === "actions" && (
            <>
              <div className="section-header">
                <div>
                  <h2>Code actions on save</h2>
                  <p>Choose when a provider’s source actions should run.</p>
                </div>
                <input
                  className="search"
                  type="search"
                  aria-label="Search code actions"
                  placeholder="Find an action…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="callout">
                <span aria-hidden="true">↗</span>
                <div>
                  <strong>Configuration does not guarantee availability</strong>
                  <p>
                    These are candidate identifiers. Explicit runs on manual
                    save. Always also includes focus/window Auto Save, without
                    promising afterDelay or action ordering.
                  </p>
                </div>
              </div>
              {Array.isArray(actions) && (
                <p className="error" role="alert">
                  Legacy action arrays must be migrated in VS Code Settings
                  before editing.
                </p>
              )}
              <section className="settings-list">
                {ids
                  .filter((id) => matches(`${id} ${actionNames[id] ?? ""}`))
                  .map((id) => (
                    <article className="action-row" key={id}>
                      <div>
                        <h3>{actionNames[id] ?? "Custom source action"}</h3>
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
                            value: e.target.value as
                              | "explicit"
                              | "always"
                              | "never",
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
                  ))}
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
            </>
          )}
          {page === "formatters" && (
            <>
              <div className="section-header">
                <div>
                  <h2>Tools in your editor</h2>
                  <p>Known integrations and built-in language extensions.</p>
                </div>
              </div>
              <div className="callout">
                <span aria-hidden="true">⊞</span>
                <div>
                  <strong>Installed is a hint, not a capability check</strong>
                  <p>
                    VS Code does not expose a complete registry of eligible
                    formatters. An installed extension may be disabled or
                    unconfigured for the current language.
                  </p>
                </div>
              </div>
              <section className="provider-grid">
                {state.providers.map((p) => (
                  <article key={p.id}>
                    <div className="provider-heading">
                      <h3>{p.name}</h3>
                      <span className={`tag ${p.installed ? "installed" : ""}`}>
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
                      {p.actions.join(", ") || "None declared by this adapter"}
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
              <button
                type="button"
                className="text-button"
                onClick={() => setPage("formatting")}
              >
                Use another formatter ID in Formatting →
              </button>
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
            <span>Formatting Controls · 0.5.0</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => open("settings")}
            >
              Open VS Code Settings ↗
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      {document.body.dataset.surface === "controls" ? (
        <QuickControls />
      ) : (
        <App />
      )}
    </StrictMode>,
  );
