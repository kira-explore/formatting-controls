export const HelpSetup = ({
  navigate,
}: {
  navigate: (page: string) => void;
}) => (
  <section
    className="help-content"
    aria-label="Setup guide and common questions"
  >
    <section className="setup-guide" aria-labelledby="get-started">
      <h2 id="get-started">Get started</h2>
      <ol className="setup-steps">
        <li>
          <span className="setup-number" aria-hidden="true">
            1
          </span>
          <div>
            <h3>Choose a scope</h3>
            <p>
              Use User across projects, Workspace for this project, or Folder
              for one folder.
            </p>
          </div>
        </li>
        <li>
          <span className="setup-number" aria-hidden="true">
            2
          </span>
          <div>
            <h3>Choose a language</h3>
            <p>
              Use All languages for shared settings, or pick one language for an
              exception.
            </p>
          </div>
        </li>
        <li>
          <span className="setup-number" aria-hidden="true">
            3
          </span>
          <div>
            <h3>Pick a formatter</h3>
            <p>Choose which tool VS Code uses to format your code.</p>
          </div>
        </li>
        <li>
          <span className="setup-number" aria-hidden="true">
            4
          </span>
          <div>
            <h3>Choose when it runs</h3>
            <p>Turn on formatting when you save, paste, or type.</p>
          </div>
        </li>
      </ol>
      <button
        type="button"
        className="primary"
        onClick={() => navigate("formatting")}
      >
        Open Formatting →
      </button>
    </section>
    <section className="common-questions" aria-labelledby="common-questions">
      <h2 id="common-questions">Common questions</h2>
      <div className="profile-list help-questions">
        <details name="help-questions" open>
          <summary>Why isn’t my file formatting as expected?</summary>
          <div className="help-answer">
            <p>
              Open the file and run Diagnostics. Check the formatter, the
              formatting triggers, and where their settings came from.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => navigate("diagnostics")}
            >
              Open Diagnostics →
            </button>
          </div>
        </details>
        <details name="help-questions">
          <summary>Why does my file change with formatting off?</summary>
          <div className="help-answer">
            <p>
              Code actions can still fix your code or organize imports when you
              save. Check which actions are enabled in Save actions.
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => navigate("actions")}
            >
              Open Save actions →
            </button>
          </div>
        </details>
        <details name="help-questions">
          <summary>Why did my setting get overridden?</summary>
          <p className="help-answer">
            Folder settings can override workspace settings, and a
            language-specific setting can override an all-language setting. Run
            Diagnostics with the file open to see which value applies.
          </p>
        </details>
        <details name="help-questions">
          <summary>Why can formatting still run while paused?</summary>
          <p className="help-answer">
            A pause applies to the folder or workspace shown beside Pause
            active. Another folder or a language override can still have
            formatting enabled.
          </p>
        </details>
        <details name="help-questions">
          <summary>What does Resume restore?</summary>
          <p className="help-answer">
            Resume restores the previous values for settings changed by the
            pause. Edits you made after pausing are kept.
          </p>
        </details>
        <details name="help-questions">
          <summary>Why did my restore point disappear?</summary>
          <p className="help-answer">
            A successful restore uses up that restore point. Applying another
            profile or preset at the same scope replaces the previous restore
            point.
          </p>
        </details>
      </div>
    </section>
  </section>
);
