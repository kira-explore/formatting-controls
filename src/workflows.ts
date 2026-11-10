import { isDeepStrictEqual } from "node:util";
import * as vscode from "vscode";
import { type Scope, settingKeys } from "../shared/protocol";
import {
  actionMap,
  applyBatch,
  type BatchPort,
  type Change,
  type Journal,
  type Profile,
  type ProfileSummary,
  parseJournal,
  parseProfile,
  plan,
  profileLanguages,
  type Recovery,
  restoreBatch,
  same,
  slot,
  type Value,
} from "../shared/workflows";
import {
  assertSettingsSaved,
  own,
  type Selection,
  waitForSettingsSave,
  write,
} from "./configuration";
import type { ProfileRepository } from "./profile-store";
export interface Store {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}
export type Confirm = (
  title: string,
  changes: readonly Change[],
  scope: Scope,
) => Promise<boolean>;
const profileKey = "formattingControls.profiles.v1",
  journalKey = "formattingControls.recovery.v1";
const formattingPresets = [
  {
    name: "Manual Formatting",
    save: false,
    paste: false,
    type: false,
    description: "Format only when you run a formatting command.",
  },
  {
    name: "Format on Save",
    save: true,
    paste: false,
    type: false,
    description: "Format when you save.",
  },
  {
    name: "Format on Save and Paste",
    save: true,
    paste: true,
    type: false,
    description: "Format when you save or paste.",
  },
  {
    name: "Format on Save, Paste and Type",
    save: true,
    paste: true,
    type: true,
    description: "Format when you save, paste, or type.",
  },
];
const builtinNames = formattingPresets.map(({ name }) => name);
export const confirmChanges: Confirm = async (title, changes, scope) => {
  let previewUri: string | undefined;
  if (changes.length) {
    const preview = await vscode.workspace.openTextDocument({
      language: "json",
      content: JSON.stringify(
        {
          operation: title,
          target: scope,
          changes: changes.map((c) => ({
            setting: c.key,
            ...(c.language ? { language: c.language } : {}),
            ...(c.action ? { action: c.action } : {}),
            before: c.before.present ? c.before.value : "Inherited (unset)",
            after: c.after.present ? c.after.value : "Inherited (unset)",
          })),
        },
        null,
        2,
      ),
    });
    await vscode.window.showTextDocument(preview, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true,
    });
    previewUri = preview.uri.toString();
  }
  const cancellation = new vscode.CancellationTokenSource();
  const showsPreview = ({ input }: vscode.Tab) =>
    input instanceof vscode.TabInputText && input.uri.toString() === previewUri;
  const previewIsOpen = () =>
    vscode.window.tabGroups.all.some((group) => group.tabs.some(showsPreview));
  const tabListener = previewUri
    ? vscode.window.tabGroups.onDidChangeTabs(({ closed }) => {
        if (closed.some(showsPreview) && !previewIsOpen())
          cancellation.cancel();
      })
    : undefined;
  try {
    if (previewUri && !previewIsOpen()) return false;
    const choice = await vscode.window.showQuickPick(
      [
        {
          label: "Continue",
          description: `${scope.target} · ${changes.some((c) => c.language) ? "language overrides" : (scope.language ?? "all languages")}`,
          detail: `${scope.folder ?? ""} ${changes.length ? `${changes.length} setting/action changes. Review the JSON preview.` : "No editor preferences will change."}${scope.target === "user" && changes.length ? " User settings affect other workspaces." : ""}`,
        },
        { label: "Cancel", description: "Keep current preferences" },
      ],
      {
        title,
        placeHolder: "Review the preview, then choose Continue to confirm.",
        ignoreFocusOut: true,
      },
      cancellation.token,
    );
    return (
      choice?.label === "Continue" &&
      !cancellation.token.isCancellationRequested
    );
  } finally {
    tabListener?.dispose();
    cancellation.dispose();
  }
};
export interface ProfileFiles {
  open(): PromiseLike<vscode.Uri | undefined>;
  save(name: string): PromiseLike<vscode.Uri | undefined>;
}
const nativeFiles: ProfileFiles = {
  async open() {
    return (
      await vscode.window.showOpenDialog({
        title: "Import Formatting Controls profile",
        canSelectMany: false,
        filters: { "Formatting Controls JSON": ["json"] },
      })
    )?.[0];
  },
  async save(name) {
    return vscode.window.showSaveDialog({
      title: `Export profile ${name}`,
      saveLabel: "Export profile",
      filters: { "Formatting Controls JSON": ["json"] },
    });
  },
};
export class Workflows implements vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;
  private busy = false;
  private readonly profileListener: { dispose(): void } | undefined;
  constructor(
    private readonly global: Store,
    private readonly workspace: Store,
    private readonly confirm: Confirm = confirmChanges,
    private readonly files: ProfileFiles = nativeFiles,
    private readonly profiles?: ProfileRepository,
  ) {
    this.profileListener = profiles?.onDidChange(() => this.changed.fire());
  }
  private async exclusive<T>(run: () => Promise<T>): Promise<T> {
    if (this.busy)
      throw new Error(
        "Another profile or recovery operation is still running.",
      );
    this.busy = true;
    try {
      return await run();
    } finally {
      this.busy = false;
    }
  }
  private saved(): Profile[] {
    if (this.profiles) return this.profiles.read();
    const raw = this.global.get<unknown>(profileKey);
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 50)
      throw new Error("Invalid stored profiles.");
    return raw.map(parseProfile);
  }
  private journals(): Journal[] {
    const raw = this.workspace.get<unknown>(journalKey);
    return raw === undefined
      ? []
      : (Array.isArray(raw) ? raw : [raw]).map(parseJournal);
  }
  private destination(journal: Journal): string {
    return JSON.stringify([journal.scope.target, journal.scope.folder]);
  }
  journal(id?: string): Journal | undefined {
    const journals = this.journals();
    return id
      ? journals.find(
          (journal) =>
            JSON.stringify([
              journal.scope.target,
              journal.scope.folder,
              journal.created,
            ]) === id && journal.kind === "profile",
        )
      : (journals.find(
          (journal) => journal.kind === "pause" || journal.phase !== "applied",
        ) ?? journals[0]);
  }
  private recoverySummary(journal: Journal): Recovery {
    return {
      id: JSON.stringify([
        journal.scope.target,
        journal.scope.folder,
        journal.created,
      ]),
      kind: journal.kind,
      phase: journal.phase,
      name: journal.name,
      scope: journal.scope,
      created: journal.created,
      count: journal.changes.length,
    };
  }
  recovery(): Recovery | null {
    const journal = this.journal();
    return journal ? this.recoverySummary(journal) : null;
  }
  restorePoints(): Recovery[] {
    return this.journals()
      .filter((journal) => journal.kind === "profile")
      .map((journal) => this.recoverySummary(journal));
  }
  private owner(): string {
    return (
      vscode.workspace.workspaceFile?.toString() ??
      vscode.workspace.workspaceFolders?.[0]?.uri.toString() ??
      "empty-window"
    );
  }
  private pausedActions(effective: unknown): Record<string, "never"> {
    return Object.fromEntries(
      Object.keys(effective === undefined ? {} : actionMap(effective)).map(
        (id) => [id, "never"],
      ),
    );
  }
  private presets(): Profile[] {
    return formattingPresets.map(({ name, save, paste, type }) => ({
      version: 1,
      name,
      settings: {
        "editor.formatOnSave": save,
        "editor.formatOnPaste": paste,
        "editor.formatOnType": type,
      },
    }));
  }
  summaries(_s: Selection, _scope: Scope): ProfileSummary[] {
    return [
      ...this.presets().map((p) => ({
        name: p.name,
        builtin: true,
        description:
          formattingPresets.find(({ name }) => name === p.name)?.description ??
          "",
        count: Object.keys(p.settings).length,
        ...(p.language ? { language: p.language } : {}),
      })),
      ...this.saved().map((p) => {
        const languages = profileLanguages(p);
        return {
          name: p.name,
          builtin: false,
          description:
            "Saved explicit preferences; unrelated action entries are preserved on apply.",
          count: Object.entries(p.settings).reduce(
            (count, [key, value]) =>
              count +
              (key.startsWith("[") && value && typeof value === "object"
                ? Object.keys(value).length
                : 1),
            0,
          ),
          ...(p.language ? { language: p.language } : {}),
          ...(languages.length ? { languages } : {}),
        };
      }),
    ];
  }
  private profile(name: string): Profile {
    const p = [...this.presets(), ...this.saved()].find((p) => p.name === name);
    if (!p) throw new Error("Profile not found.");
    return p;
  }
  private assertNewBatch(): void {
    const existing = this.journal();
    if (existing && (existing.kind === "pause" || existing.phase !== "applied"))
      throw new Error(
        "Restore or review the existing pause/recovery record before applying another batch.",
      );
  }
  private journalSelection(journal: Journal): Selection {
    const s: Selection = {
      target:
        journal.scope.target === "user"
          ? vscode.ConfigurationTarget.Global
          : journal.scope.target === "workspace"
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.WorkspaceFolder,
      ...(journal.scope.language ? { language: journal.scope.language } : {}),
      ...(journal.scope.folder
        ? { uri: vscode.Uri.parse(journal.scope.folder) }
        : {}),
    };
    if (
      s.target === vscode.ConfigurationTarget.Workspace &&
      journal.owner !== this.owner()
    )
      throw new Error("Reopen the original workspace to restore this record.");
    if (
      s.target === vscode.ConfigurationTarget.WorkspaceFolder &&
      !vscode.workspace.workspaceFolders?.some(
        (f) => f.uri.toString() === journal.scope.folder,
      )
    )
      throw new Error("Reopen the recorded workspace folder before restoring.");
    return s;
  }
  private port(journal: Journal, applying = false): BatchPort {
    const others = this.journals().filter(
      (entry) =>
        applying ||
        entry.kind !== journal.kind ||
        this.destination(entry) !== this.destination(journal) ||
        entry.created !== journal.created,
    );
    const s = this.journalSelection(journal);
    const ensure = () => {
      if (
        s.target === vscode.ConfigurationTarget.Workspace &&
        journal.owner !== this.owner()
      )
        throw new Error("The workspace changed during this operation.");
      if (
        s.target === vscode.ConfigurationTarget.WorkspaceFolder &&
        !vscode.workspace.workspaceFolders?.some(
          (f) => f.uri.toString() === journal.scope.folder,
        )
      )
        throw new Error("The workspace folder is no longer available.");
    };
    return {
      save: async (value) => {
        const remaining =
          applying && value?.phase === "applied" && value.kind === "profile"
            ? others.filter(
                (entry) =>
                  entry.kind !== "profile" ||
                  this.destination(entry) !== this.destination(journal),
              )
            : others;
        const records = value ? [value, ...remaining] : remaining;
        await this.workspace.update(
          journalKey,
          records.length ? records : undefined,
        );
        this.changed.fire();
      },
      read: (c) => {
        ensure();
        // A dirty buffer can contain an attempted write that is absent from
        // the saved configuration cache. Keep recovery instead of concluding
        // that the old disk value means this change was already restored.
        assertSettingsSaved(s);
        const current = own(
          c.language ? { ...s, language: c.language } : s,
          c.key,
        );
        if (!c.action) return slot(current);
        try {
          const actions = current === undefined ? {} : actionMap(current);
          return slot(
            Object.hasOwn(actions, c.action) ? actions[c.action] : undefined,
          );
        } catch {
          // An externally edited/legacy action map is a conflict, not a reason
          // to block restoration of unrelated formatting preferences.
          return slot({});
        }
      },
      write: async (c, value) => {
        ensure();
        const selection = c.language ? { ...s, language: c.language } : s;
        if (!c.action) {
          await write(
            selection,
            c.key,
            value.present ? value.value : undefined,
          );
          return;
        }
        const current = own(selection, c.key),
          map = { ...actionMap(current ?? {}) };
        if (value.present)
          map[c.action] = value.value as
            | "explicit"
            | "always"
            | "never"
            | boolean;
        else delete map[c.action];
        await write(
          selection,
          c.key,
          Object.keys(map).length || c.containerPresent ? map : undefined,
        );
      },
    };
  }

  private assertSelection(s: Selection, scope: Scope): void {
    const target =
      scope.target === "user"
        ? vscode.ConfigurationTarget.Global
        : scope.target === "workspace"
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.WorkspaceFolder;
    if (
      s.target !== target ||
      s.language !== scope.language ||
      (scope.target === "folder" &&
        (!s.uri ||
          vscode.workspace.getWorkspaceFolder(s.uri)?.uri.toString() !==
            scope.folder))
    )
      throw new Error(
        "The selected configuration scope changed. Choose the scope again.",
      );
  }
  private async applyProfile(
    profile: Profile,
    s: Selection,
    scope: Scope,
    kind: "profile" | "pause",
    review = true,
  ): Promise<string> {
    this.assertSelection(s, scope);
    this.assertNewBatch();
    if (profile.language && profile.language !== scope.language)
      throw new Error(
        `Select language ${profile.language} before applying this profile.`,
      );
    if (scope.language && profileLanguages(profile).length)
      throw new Error(
        "Select All languages to apply this profile's language blocks.",
      );
    if (
      scope.language &&
      Object.keys(profile.settings).some((key) => key.startsWith("files."))
    )
      throw new Error(
        "This profile includes Auto Save. Select All languages before applying.",
      );
    if (Object.keys(profile.settings).length) parseProfile(profile);
    const changes = plan(profile, (key, language) =>
      own(language ? { ...s, language } : s, key),
    );
    if (!changes.length && !(kind === "pause" && !review))
      return "These preferences already match the selected scope.";
    const scopeRecord: Scope = {
      target: scope.target,
      ...(scope.target === "folder" && scope.folder
        ? { folder: scope.folder }
        : {}),
      ...(scope.language ? { language: scope.language } : {}),
    };
    const journal = parseJournal({
      version: 1,
      kind,
      phase: "prepared",
      name: profile.name,
      scope: scopeRecord,
      owner: this.owner(),
      created: new Date().toISOString(),
      changes,
    });
    const title = `${kind === "pause" ? "Pause formatting at this scope" : `Apply profile ${profile.name}`}?${kind === "profile" && this.journals().some((entry) => entry.kind === "profile" && this.destination(entry) === this.destination(journal)) ? " This replaces the restore point for this destination." : ""}`;
    if (review && !(await this.confirm(title, changes, scopeRecord)))
      return "Cancelled. No settings were changed.";
    if (changes.length) await waitForSettingsSave(s);
    await applyBatch(journal, this.port(journal, true));
    return kind === "pause"
      ? "Paused at the selected scope. Resume from Profiles; overrides may still apply."
      : `Applied ${profile.name} to ${scope.target}. A restore point is saved.`;
  }
  async save(name: string, s: Selection, scope: Scope): Promise<string> {
    return this.exclusive(async () => {
      this.assertSelection(s, scope);
      if (
        builtinNames.some((n) => n.toLowerCase() === name.trim().toLowerCase())
      )
        throw new Error("Choose a custom name instead of a preset name.");
      const settings: Profile["settings"] = {};
      for (const key of settingKeys) {
        if (scope.language && key.startsWith("files.")) continue;
        const v = own(s, key);
        if (v !== undefined) settings[key] = v as Value;
      }
      if (!Object.keys(settings).length)
        throw new Error(
          "No explicit preferences are stored at this scope. Configure a setting here before saving a profile.",
        );
      const p = parseProfile({
        version: 1,
        name,
        ...(scope.language ? { language: scope.language } : {}),
        settings,
      });
      return this.storeProfile(p, scope);
    });
  }
  private async storeProfile(profile: Profile, scope: Scope): Promise<string> {
    const expected = structuredClone(
      this.saved().find((p) => p.name === profile.name),
    );
    const existing = expected !== undefined;
    if (
      existing &&
      !(await this.confirm(
        `Overwrite saved profile ${profile.name}?`,
        [],
        scope,
      ))
    )
      return "Profile save cancelled.";
    const current = this.saved();
    if (
      !isDeepStrictEqual(
        current.find((p) => p.name === profile.name),
        expected,
      )
    )
      throw new Error(
        "This saved profile changed while confirmation was open. Review the profiles and try again.",
      );
    if (!existing && current.length >= 50)
      throw new Error("At most 50 custom profiles can be saved.");
    if (this.profiles)
      await this.profiles.commit(profile.name, expected, profile);
    else
      await this.global.update(profileKey, [
        ...current.filter((p) => p.name !== profile.name),
        profile,
      ]);
    this.changed.fire();
    return `Saved profile ${profile.name}. No formatting settings were changed.`;
  }
  async apply(name: string, s: Selection, scope: Scope): Promise<string> {
    return this.exclusive(() =>
      this.applyProfile(this.profile(name), s, scope, "profile"),
    );
  }
  async pause(s: Selection, scope: Scope, effective: unknown): Promise<string> {
    return this.exclusive(async () => {
      if (scope.target === "user")
        throw new Error(
          "Temporary pause requires Workspace or Workspace folder; user-wide pause would affect other windows.",
        );
      const profile: Profile = {
        version: 1,
        name: "Temporary pause",
        ...(scope.language ? { language: scope.language } : {}),
        settings: {
          "editor.formatOnSave": false,
          "editor.formatOnPaste": false,
          "editor.formatOnType": false,
          "editor.codeActionsOnSave": this.pausedActions(effective),
        },
      };
      return this.applyProfile(profile, s, scope, "pause");
    });
  }
  async pauseFormatting(
    s: Selection,
    scope: Scope,
    interaction: "review" | "background" = "review",
  ): Promise<string> {
    return this.exclusive(async () => {
      if (scope.target === "user")
        throw new Error(
          "Temporary pause requires Workspace or Workspace folder.",
        );
      return this.applyProfile(
        {
          version: 1,
          name: "Automatic formatting pause",
          ...(scope.language ? { language: scope.language } : {}),
          settings: {
            "editor.formatOnSave": false,
            "editor.formatOnPaste": false,
            "editor.formatOnType": false,
          },
        },
        s,
        scope,
        "pause",
        interaction === "review",
      );
    });
  }
  async restore(id?: string): Promise<string> {
    return this.restoreSaved(true, id);
  }
  async resumePause(): Promise<string> {
    return this.restoreSaved(false);
  }
  private async restoreSaved(review: boolean, id?: string): Promise<string> {
    return this.exclusive(async () => {
      const journal = this.journal(id);
      if (!journal) return "No restore point is saved for this workspace.";
      if (
        !review &&
        (journal.kind !== "pause" || journal.scope.target === "user")
      )
        throw new Error("Open the dashboard to review this restore point.");
      await waitForSettingsSave(this.journalSelection(journal));
      const port = this.port(journal);
      const reviewed = new Set<Change>();
      const preview = journal.changes.flatMap((c) => {
        if (!c.attempted) return [];
        const current = port.read(c);
        if (!same(current, c.after) || same(current, c.before)) return [];
        reviewed.add(c);
        return [{ ...c, before: current, after: c.before }];
      });
      if (
        review &&
        !(await this.confirm(
          "Restore unchanged preferences? Externally edited values will be preserved.",
          preview,
          journal.scope,
        ))
      )
        return "Restore cancelled. Current preferences were kept.";
      const conflicts = await restoreBatch(journal, port, reviewed);
      if (!review && conflicts) {
        // Resume has finished restoring unchanged settings. Values edited
        // during the pause are now the user's current preferences, not pending
        // work: keeping this record would make every later Pause run Resume.
        // Failed/dirty writes still throw above and retain their recovery data.
        await port.save(undefined);
        return "Resumed formatting. Settings edited during the pause were kept.";
      }
      return conflicts
        ? `${conflicts} externally edited values were preserved. Review the record in Profiles or keep current values.`
        : "Restored previous preferences. Unrelated values were preserved.";
    });
  }
  async discard(id?: string): Promise<string> {
    return this.exclusive(async () => {
      const journal = this.journal(id);
      if (!journal) return "No restore point is saved.";
      if (
        !(await this.confirm(
          "Keep current settings and discard this restore point?",
          [],
          journal.scope,
        ))
      )
        return "Restore point kept.";
      await this.port(journal).save(undefined);
      return "Kept current preferences and discarded the restore point.";
    });
  }
  async remove(name: string, scope: Scope): Promise<string> {
    return this.exclusive(async () => {
      const expected = structuredClone(
        this.saved().find((p) => p.name === name),
      );
      if (!expected)
        throw new Error("Only saved custom profiles can be deleted.");
      if (!(await this.confirm(`Delete saved profile ${name}?`, [], scope)))
        return "Profile deletion cancelled.";
      const current = this.saved();
      if (
        !isDeepStrictEqual(
          current.find((p) => p.name === name),
          expected,
        )
      )
        throw new Error(
          "This saved profile changed while confirmation was open. Review the profiles and try again.",
        );
      if (this.profiles) await this.profiles.commit(name, expected, undefined);
      else
        await this.global.update(
          profileKey,
          current.filter((p) => p.name !== name),
        );
      this.changed.fire();
      return `Deleted saved profile ${name}.`;
    });
  }
  async export(name: string, _s: Selection, _scope: Scope): Promise<string> {
    return this.exclusive(async () => {
      const profile = parseProfile(this.profile(name));
      const uri = await this.files.save(name);
      if (!uri) return "Profile export cancelled.";
      await vscode.workspace.fs.writeFile(
        uri,
        new TextEncoder().encode(`${JSON.stringify(profile, null, 2)}\n`),
      );
      return `Exported profile ${name}.`;
    });
  }
  async import(scope: Scope): Promise<string> {
    return this.exclusive(async () => {
      const uri = await this.files.open();
      if (!uri) return "Profile import cancelled.";
      if ((await vscode.workspace.fs.stat(uri)).size > 131072)
        throw new Error("Profile files must be at most 128 KiB.");
      const data = await vscode.workspace.fs.readFile(uri);
      if (data.byteLength > 131072)
        throw new Error("Profile file is too large.");
      const profile = parseProfile(JSON.parse(new TextDecoder().decode(data)));
      if (
        builtinNames.some((n) => n.toLowerCase() === profile.name.toLowerCase())
      )
        profile.name = `${profile.name} (imported)`;
      return this.storeProfile(profile, scope);
    });
  }
  dispose(): void {
    this.profileListener?.dispose();
    this.changed.dispose();
  }
}
