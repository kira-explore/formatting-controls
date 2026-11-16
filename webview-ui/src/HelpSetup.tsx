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
      <section className="faq-group" aria-labelledby="faq-formatting">
        <h3 id="faq-formatting">Formatting and saves</h3>
        <div className="profile-list help-questions">
          <details name="faq-formatting-and-saves" open>
            <summary>Why isn’t my file formatting as expected?</summary>
            <div className="help-answer">
              <p>
                Open the affected file and run Diagnostics to check its
                formatter, automatic triggers, and setting sources.
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
          <details name="faq-formatting-and-saves">
            <summary>Why does my file change with formatting off?</summary>
            <div className="help-answer">
              <p>
                Save actions can still apply fixes or organize imports when you
                save.
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
          <details name="faq-formatting-and-saves">
            <summary>Why did my setting get overridden?</summary>
            <p className="help-answer">
              A folder or language-specific setting can take precedence.
              Diagnostics shows which value applies to the open file.
            </p>
          </details>
        </div>
      </section>
      <section className="faq-group" aria-labelledby="faq-recovery">
        <h3 id="faq-recovery">Pause and restore</h3>
        <div className="profile-list help-questions">
          <details name="faq-pause-and-restore">
            <summary>Why can formatting still run while paused?</summary>
            <p className="help-answer">
              A pause applies to its selected scope. Another folder or a
              language override can still have formatting enabled.
            </p>
          </details>
          <details name="faq-pause-and-restore">
            <summary>What does Resume restore?</summary>
            <p className="help-answer">
              Resume restores the previous values for settings changed by the
              pause and preserves edits you made during it.
            </p>
          </details>
          <details name="faq-pause-and-restore">
            <summary>Why did my restore point disappear?</summary>
            <p className="help-answer">
              Restoring uses up the point. Applying another profile or preset at
              the same scope replaces it.
            </p>
          </details>
        </div>
      </section>
    </section>
  </section>
);
