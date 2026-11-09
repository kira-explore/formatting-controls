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
          <h3>Choose where settings apply</h3>
          <p>Select User, Workspace or a folder.</p>
        </li>
        <li>
          <h3>Choose a language</h3>
          <p>
            Select All languages or a specific language for language-specific
            settings.
          </p>
        </li>
        <li>
          <h3>Pick a formatter</h3>
          <p>Choose the tool VS Code should use to format your code.</p>
        </li>
        <li>
          <h3>Choose when it runs</h3>
          <p>Turn on formatting for save, paste or type.</p>
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
      <details name="help-questions" open>
        <summary>My file isn’t formatting as expected</summary>
        <div className="help-answer">
          <p>
            Open the file, then check its effective formatter and formatting
            triggers in Diagnostics. The setting sources show where each value
            comes from.
          </p>
          <button type="button" onClick={() => navigate("diagnostics")}>
            Open Diagnostics →
          </button>
        </div>
      </details>
      <details name="help-questions">
        <summary>My file changes even with formatting off</summary>
        <div className="help-answer">
          <p>
            Fixes and import organization can run separately from formatting.
            Check the code actions configured to run when you save.
          </p>
          <button type="button" onClick={() => navigate("actions")}>
            Open Save actions →
          </button>
        </div>
      </details>
      <details name="help-questions">
        <summary>What does Resume restore?</summary>
        <div className="help-answer">
          <p>
            Resume restores formatting settings saved when you paused and
            preserves changes you made during the pause.
          </p>
        </div>
      </details>
    </section>
  </section>
);
