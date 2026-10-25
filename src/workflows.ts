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
  type Recovery,
  restoreBatch,
  same,
  slot,
  type Value,
} from "../shared/workflows";
import { configuration, own, type Selection, write } from "./configuration";
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
const builtinNames = [
  "Minimal",
  "Strict",
  "Formatting Only",
  "Project Default",
];
export const confirmChanges: Confirm = async (title, changes, scope) => {
  if (changes.length) {
    const preview = await vscode.workspace.openTextDocument({
      language: "json",
      content: JSON.stringify(
        {
          operation: title,
          target: scope,
          changes: changes.map((c) => ({
            setting: c.key,
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
  }
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: "Continue",
        description: `${scope.target} · ${scope.language ?? "all languages"}`,
        detail: `${scope.folder ?? ""} ${changes.length ? `${changes.length} setting/action changes. Review the JSON preview.` : "No editor preferences will change."}${scope.target === "user" && changes.length ? " User settings affect other workspaces." : ""}`,
      },
      { label: "Cancel", description: "Keep current preferences" },
    ],
    {
      title,
      placeHolder: "Review the preview, then choose Continue to confirm.",
      ignoreFocusOut: true,
    },
  );
  return choice?.label === "Continue";
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
  constructor(
    private readonly global: Store,
    private readonly workspace: Store,
    private readonly confirm: Confirm = confirmChanges,
    private readonly files: ProfileFiles = nativeFiles,
  ) {}
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
    const raw = this.global.get<unknown>(profileKey);
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 50)
      throw new Error("Invalid stored profiles.");
    return raw.map(parseProfile);
  }
  journal(): Journal | undefined {
    const raw = this.workspace.get<unknown>(journalKey);
    return raw === undefined ? undefined : parseJournal(raw);
  }
  recovery(): Recovery | null {
    const j = this.journal();
    return j
      ? {
          kind: j.kind,
          phase: j.phase,
          name: j.name,
          scope: j.scope,
          created: j.created,
          count: j.changes.length,
        }
      : null;
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
  private presets(s: Selection, scope: Scope): Profile[] {
    const base = {
      version: 1 as const,
      ...(scope.language ? { language: scope.language } : {}),
    };
    let disabled: Record<string, "never"> = {};
    try {
      disabled = this.pausedActions(
        configuration(s).get("editor.codeActionsOnSave"),
      );
    } catch {
      /* Legacy actions remain visible; applying a preset will explain migration. */
    }
    const project: Profile["settings"] = {};
    if (
      vscode.workspace.workspaceFile ||
      vscode.workspace.workspaceFolders?.length
    ) {
      const levels: Selection[] = [
        { ...s, target: vscode.ConfigurationTarget.Workspace },
        { ...s, target: vscode.ConfigurationTarget.WorkspaceFolder },
      ];
      for (const level of [
        ...levels.map((level) => {
          const regular = { ...level };
          delete regular.language;
          return regular;
        }),
        ...(scope.language ? levels : []),
      ])
        for (const key of settingKeys) {
          if (scope.language && key.startsWith("files.")) continue;
          const value = own(level, key);
          if (value !== undefined)
            project[key] =
              key === "editor.codeActionsOnSave" && !Array.isArray(value)
                ? {
                    ...actionMap(
                      Array.isArray(project[key]) ? {} : (project[key] ?? {}),
                    ),
                    ...actionMap(value),
                  }
                : (value as Value);
        }
    }
    return [
      {
        ...base,
        name: "Minimal",
        settings: {
          "editor.formatOnSave": false,
          "editor.formatOnPaste": false,
          "editor.formatOnType": false,
          "editor.codeActionsOnSave": disabled,
        },
      },
      {
        ...base,
        name: "Strict",
        settings: {
          "editor.formatOnSave": true,
          "editor.formatOnPaste": false,
          "editor.formatOnType": false,
          "editor.codeActionsOnSave": {
            "source.fixAll": "explicit",
            "source.organizeImports": "explicit",
          },
        },
      },
      {
        ...base,
        name: "Formatting Only",
        settings: {
          "editor.formatOnSave": true,
          "editor.formatOnPaste": false,
          "editor.formatOnType": false,
          "editor.codeActionsOnSave": disabled,
        },
      },
      { ...base, name: "Project Default", settings: project },
    ];
  }
  summaries(s: Selection, scope: Scope): ProfileSummary[] {
    const description: Record<string, string> = {
      Minimal:
        "Disable formatting triggers and currently configured save actions at this scope.",
      Strict:
        "Enable save formatting and generic explicit fix-all/import actions; provider-specific choices remain.",
      "Formatting Only":
        "Format on save and disable currently configured source actions at this scope.",
      "Project Default":
        "Copy explicit project settings for this context into the selected scope; no built-in defaults are invented.",
    };
    return [
      ...this.presets(s, scope).map((p) => ({
        name: p.name,
        builtin: true,
        description: description[p.name] ?? "",
        count: Object.keys(p.settings).length,
        ...(p.language ? { language: p.language } : {}),
      })),
      ...this.saved().map((p) => ({
        name: p.name,
        builtin: false,
        description:
          "Saved explicit preferences; unrelated action entries are preserved on apply.",
        count: Object.keys(p.settings).length,
        ...(p.language ? { language: p.language } : {}),
      })),
    ];
  }
  private profile(name: string, s: Selection, scope: Scope): Profile {
    const p = [...this.presets(s, scope), ...this.saved()].find(
      (p) => p.name === name,
    );
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
  private port(journal: Journal): BatchPort {
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
        await this.workspace.update(journalKey, value);
        this.changed.fire();
      },
      read: (c) => {
        ensure();
        const current = own(s, c.key);
        return c.action
          ? slot(
              current === undefined ? undefined : actionMap(current)[c.action],
            )
          : slot(current);
      },
      write: async (c, value) => {
        ensure();
        if (!c.action) {
          await write(s, c.key, value.present ? value.value : undefined);
          return;
        }
        const current = own(s, c.key),
          map = { ...actionMap(current ?? {}) };
        if (value.present)
          map[c.action] = value.value as
            | "explicit"
            | "always"
            | "never"
            | boolean;
        else delete map[c.action];
        await write(
          s,
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
  ): Promise<string> {
    this.assertSelection(s, scope);
    this.assertNewBatch();
    if (profile.language && profile.language !== scope.language)
      throw new Error(
        `Select language ${profile.language} before applying this profile.`,
      );
    if (
      scope.language &&
      Object.keys(profile.settings).some((key) => key.startsWith("files."))
    )
      throw new Error(
        "This profile includes Auto Save. Select All languages before applying.",
      );
    if (Object.keys(profile.settings).length) parseProfile(profile);
    const changes = plan(profile, (key) => own(s, key));
    if (!changes.length)
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
    const title = `${kind === "pause" ? "Pause formatting at this scope" : `Apply profile ${profile.name}`}?${this.journal() ? " This replaces the previous restore point." : ""}`;
    if (!(await this.confirm(title, changes, scopeRecord)))
      return "Cancelled. No settings were changed.";
    await applyBatch(journal, this.port(journal));
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
    const previous = this.saved(),
      existing = previous.some((p) => p.name === profile.name);
    if (
      existing &&
      !(await this.confirm(
        `Overwrite saved profile ${profile.name}?`,
        [],
        scope,
      ))
    )
      return "Profile save cancelled.";
    if (!existing && previous.length >= 50)
      throw new Error("At most 50 custom profiles can be saved.");
    await this.global.update(profileKey, [
      ...previous.filter((p) => p.name !== profile.name),
      profile,
    ]);
    this.changed.fire();
    return `Saved profile ${profile.name}. No formatting settings were changed.`;
  }
  async apply(name: string, s: Selection, scope: Scope): Promise<string> {
    return this.exclusive(() => {
      if (
        ["Minimal", "Formatting Only", "Project Default"].includes(name) &&
        Array.isArray(configuration(s).get("editor.codeActionsOnSave"))
      )
        throw new Error(
          "Migrate legacy save-action arrays in Settings before applying this preset.",
        );
      return this.applyProfile(
        this.profile(name, s, scope),
        s,
        scope,
        "profile",
      );
    });
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
  async restore(): Promise<string> {
    return this.exclusive(async () => {
      const journal = this.journal();
      if (!journal) return "No restore point is saved for this workspace.";
      const port = this.port(journal);
      if (
        !(await this.confirm(
          "Restore unchanged preferences? Externally edited values will be preserved.",
          journal.changes.flatMap((c) => {
            if (!c.attempted) return [];
            const current = port.read(c);
            return same(current, c.after) && !same(current, c.before)
              ? [{ ...c, before: current, after: c.before }]
              : [];
          }),
          journal.scope,
        ))
      )
        return "Restore cancelled. Current preferences were kept.";
      const conflicts = await restoreBatch(journal, port);
      return conflicts
        ? `${conflicts} externally edited values were preserved. Review the record in Profiles or keep current values.`
        : "Restored previous preferences. Unrelated values were preserved.";
    });
  }
  async discard(): Promise<string> {
    return this.exclusive(async () => {
      const journal = this.journal();
      if (!journal) return "No restore point is saved.";
      if (
        !(await this.confirm(
          "Keep current settings and discard this restore point?",
          [],
          journal.scope,
        ))
      )
        return "Restore point kept.";
      await this.workspace.update(journalKey, undefined);
      this.changed.fire();
      return "Kept current preferences and discarded the restore point.";
    });
  }
  async remove(name: string, scope: Scope): Promise<string> {
    return this.exclusive(async () => {
      const profiles = this.saved();
      if (!profiles.some((p) => p.name === name))
        throw new Error("Only saved custom profiles can be deleted.");
      if (!(await this.confirm(`Delete saved profile ${name}?`, [], scope)))
        return "Profile deletion cancelled.";
      await this.global.update(
        profileKey,
        profiles.filter((p) => p.name !== name),
      );
      this.changed.fire();
      return `Deleted saved profile ${name}.`;
    });
  }
  async export(name: string, s: Selection, scope: Scope): Promise<string> {
    return this.exclusive(async () => {
      const profile = parseProfile(this.profile(name, s, scope));
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
    this.changed.dispose();
  }
}
