import { languageName } from "../../shared/language";
import type { Key, Snapshot } from "../../shared/protocol";
import { formatterSource, settingForAction } from "../../shared/status-details";
import { actionNames, display, labels, saveModeLabels } from "./catalog";
import { Icon } from "./Icon";

const autoSaveLabels: Record<string, string> = {
  off: "Off",
  afterDelay: "After a delay",
  onFocusChange: "When the editor loses focus",
  onWindowChange: "When the window loses focus",
};
const actionMode = (value: unknown): string => {
  switch (value) {
    case "explicit":
    case true:
      return "Explicit save";
    case "always":
      return "Always";
    case "never":
    case false:
      return "Never";
    default:
      return display(value);
  }
};

const formattingStatus = {
  ON: { label: "Enabled", icon: "enabled" },
  OFF: { label: "Disabled", icon: "disabled" },
  MIXED: { label: "Mixed", icon: "mixed" },
} as const;
const settingValue = (
  key: Key,
  value: unknown,
  formatterName: string,
): string => {
  switch (key) {
    case "editor.defaultFormatter":
      return formatterName;
    case "editor.formatOnSaveMode":
      return saveModeLabels[String(value)] ?? display(value);
    case "files.autoSave":
      return autoSaveLabels[String(value)] ?? display(value);
    case "files.autoSaveDelay":
      return typeof value === "number"
        ? `${value.toLocaleString()} ms`
        : display(value);
    default:
      return typeof value === "boolean"
        ? value
          ? "On"
          : "Off"
        : display(value);
  }
};

export const Diagnostics = ({
  state,
  navigate,
}: {
  state: Snapshot;
  navigate: (page: string) => void;
}) => {
  const formatter = state.settings.find(
    (setting) => setting.key === "editor.defaultFormatter",
  )?.effective;
  const formatterName =
    typeof formatter === "string"
      ? (state.providers.find(
          (provider) => provider.id.toLowerCase() === formatter.toLowerCase(),
        )?.name ?? formatter)
      : "Not configured";
  const saveActions = state.settings.find(
    (setting) => setting.key === "editor.codeActionsOnSave",
  );
  const rawActions = saveActions?.effective;
  const actions =
    rawActions && typeof rawActions === "object" && !Array.isArray(rawActions)
      ? Object.entries(rawActions)
      : [];
  const status = formattingStatus[state.status];
  const triggerCount = state.settings.filter(
    (setting) =>
      (setting.key === "editor.formatOnSave" ||
        setting.key === "editor.formatOnPaste" ||
        setting.key === "editor.formatOnType") &&
      setting.effective === true,
  ).length;
  const source = (setting: Snapshot["settings"][number]) =>
    formatterSource(setting, state.scope, languageName(state.activeLanguage));
  return (
    <div className="diagnostics">
      <section
        className="diagnostics-section"
        aria-labelledby="diagnostics-summary"
      >
        <h2 id="diagnostics-summary">What applies now</h2>
        <ul className="diagnostics-summary">
          <li>
            <Icon name={status.icon} />
            <div>
              <h3>Automatic formatting · {status.label}</h3>
              <p>
                {triggerCount} of 3 triggers enabled across save, paste, and
                type.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => navigate("formatting")}
              >
                Review formatting →
              </button>
            </div>
          </li>
          <li>
            <Icon name="sliders" />
            <div>
              <h3>Default formatter · {formatterName}</h3>
              <p>
                {formatterName === "Not configured"
                  ? "VS Code may use an available formatter for this language."
                  : "The configured formatter must support the language and operation."}
              </p>
            </div>
          </li>
          <li>
            <Icon name="save" />
            <div>
              <h3>Save actions run separately</h3>
              <p>
                Fixes and import actions can still change the file when
                formatting is off.
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => navigate("actions")}
              >
                Review save actions →
              </button>
            </div>
          </li>
        </ul>
      </section>
      {(state.findings.length > 0 || state.focusFinding) && (
        <section
          className="diagnostics-section"
          aria-labelledby="diagnostics-findings"
        >
          <h2 id="diagnostics-findings">Findings</h2>
          {state.focusFinding &&
            !state.findings.some(
              (finding) => finding.id === state.focusFinding,
            ) && (
              <p role="status">
                The previously reported problem is no longer detected.
              </p>
            )}
          {state.findings.map((finding) => (
            <article
              className={`finding${state.focusFinding === finding.id ? " finding-focused" : ""}`}
              key={finding.id}
              id={`finding-${finding.id}`}
              tabIndex={-1}
              aria-label={finding.title}
            >
              <div className="provider-heading">
                <h3>{finding.title}</h3>
                <span className="tag">
                  {
                    {
                      verified: "Verified",
                      possible: "Possible",
                      info: "Info",
                    }[finding.confidence]
                  }
                </span>
              </div>
              <p>{finding.detail}</p>
              {[
                "formatter-unavailable",
                "provider-off",
                "provider-language",
              ].includes(finding.id) && (
                <button type="button" onClick={() => navigate("formatting")}>
                  Review formatter
                </button>
              )}
              {finding.id === "pause-failed" &&
                state.recovery?.kind === "pause" && (
                  <button type="button" onClick={() => navigate("profiles")}>
                    Review pause recovery
                  </button>
                )}
            </article>
          ))}
        </section>
      )}
      <section
        className="diagnostics-section"
        aria-labelledby="diagnostics-sources"
      >
        <h2 id="diagnostics-sources">Setting sources</h2>
        <p>See the effective value and where it comes from.</p>
        <div
          className="diagnostic-columns diagnostic-column-headings"
          aria-hidden="true"
        >
          <span>Setting</span>
          <span>Effective value</span>
          <span>Source</span>
        </div>
        <dl className="diagnostic-values">
          {state.settings
            .filter((setting) => setting.key !== "editor.codeActionsOnSave")
            .map((setting) => (
              <div className="diagnostic-columns" key={setting.key}>
                <dt>{labels[setting.key]}</dt>
                <dd>
                  {settingValue(setting.key, setting.effective, formatterName)}
                </dd>
                <dd className="diagnostic-source">{source(setting)}</dd>
              </div>
            ))}
        </dl>
        {saveActions && (
          <details className="formatting-disclosure diagnostic-actions">
            <summary>Code actions on save</summary>
            {actions.length > 0 ? (
              <dl className="diagnostic-values">
                {actions.map(([id, value]) => (
                  <div className="diagnostic-columns" key={id}>
                    <dt>
                      {Object.hasOwn(actionNames, id) ? (
                        actionNames[id]
                      ) : (
                        <code>{id}</code>
                      )}
                    </dt>
                    <dd>{actionMode(value)}</dd>
                    <dd className="diagnostic-source">
                      {source(settingForAction(saveActions, id, value))}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : Array.isArray(rawActions) ? (
              <pre>{JSON.stringify(rawActions, null, 2)}</pre>
            ) : (
              <p>No code actions configured.</p>
            )}
          </details>
        )}
      </section>
    </div>
  );
};
