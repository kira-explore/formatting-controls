import {
  type ActionValue,
  type Key,
  type Scope,
  settingKeys,
  validValue,
} from "./protocol";
export type ActionMap = Record<string, boolean | ActionValue>;
export type Value = boolean | string | number | null | ActionMap;
export type Slot = { present: false } | { present: true; value: Value };
export interface Profile {
  version: 1;
  name: string;
  language?: string;
  settings: Partial<Record<Key, Value>>;
}
export interface ProfileSummary {
  name: string;
  builtin: boolean;
  description: string;
  count: number;
  language?: string;
}
export interface Change {
  attempted?: boolean;
  key: Key;
  action?: string;
  containerPresent?: boolean;
  before: Slot;
  after: Slot;
}
export interface Journal {
  version: 1;
  kind: "profile" | "pause";
  phase: "prepared" | "applied" | "restoring" | "conflicts";
  name: string;
  scope: Scope;
  owner: string;
  created: string;
  changes: Change[];
}
export interface Recovery {
  kind: Journal["kind"];
  phase: Journal["phase"];
  name: string;
  scope: Scope;
  created: string;
  count: number;
}
export const absent: Slot = { present: false };
export const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const actionId = (id: unknown): id is string =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length <= 200 &&
  !["__proto__", "constructor", "prototype"].includes(id) &&
  /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(id);
export function actionMap(value: unknown): ActionMap {
  if (!record(value) || Object.keys(value).length > 100)
    throw new Error(
      "Use a source-action object with at most 100 entries; migrate legacy arrays in Settings first.",
    );
  for (const [id, mode] of Object.entries(value))
    if (
      !actionId(id) ||
      ![true, false, "explicit", "always", "never"].includes(mode as string)
    )
      throw new Error(`Unsupported save action: ${id}`);
  return value as ActionMap;
}
export function parseProfile(raw: unknown): Profile {
  if (
    !record(raw) ||
    raw.version !== 1 ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    raw.name.length > 80 ||
    [...raw.name].some((c) => c.charCodeAt(0) < 32) ||
    !record(raw.settings) ||
    JSON.stringify(raw).length > 131072
  )
    throw new Error(
      "Invalid Formatting Controls profile (version 1 required).",
    );
  if (
    raw.language !== undefined &&
    (typeof raw.language !== "string" ||
      !raw.language ||
      raw.language.length > 100)
  )
    throw new Error("Invalid profile language.");
  const keys = Object.keys(raw.settings);
  if (!keys.length || keys.some((key) => !settingKeys.includes(key as Key)))
    throw new Error(
      "Profiles may only contain supported formatting and save settings.",
    );
  for (const [key, value] of Object.entries(raw.settings)) {
    if (key === "editor.codeActionsOnSave") actionMap(value);
    else if (
      !(key === "editor.defaultFormatter" && value === null) &&
      !validValue(key as Key, value)
    )
      throw new Error(`Invalid profile value for ${key}`);
    if (raw.language && key.startsWith("files."))
      throw new Error("Auto Save cannot be language-specific.");
  }
  return {
    version: 1,
    name: raw.name.trim(),
    ...(typeof raw.language === "string" ? { language: raw.language } : {}),
    settings: raw.settings as Profile["settings"],
  };
}
export function slot(value: unknown): Slot {
  return value === undefined
    ? absent
    : { present: true, value: value as Value };
}
export function same(a: Slot, b: Slot): boolean {
  if (!a.present || !b.present) return a.present === b.present;
  if (record(a.value) && record(b.value)) {
    const left = a.value,
      right = b.value;
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => left[key] === right[key])
    );
  }
  return a.value === b.value;
}
export function plan(profile: Profile, read: (key: Key) => unknown): Change[] {
  const changes: Change[] = [];
  for (const [key, value] of Object.entries(profile.settings) as [
    Key,
    Value,
  ][]) {
    const current = read(key);
    if (key === "editor.codeActionsOnSave") {
      const before = current === undefined ? {} : actionMap(current);
      for (const [action, mode] of Object.entries(actionMap(value))) {
        const item: Change = {
          key,
          action,
          containerPresent: current !== undefined,
          before: slot(before[action]),
          after: slot(mode),
        };
        if (!same(item.before, item.after)) changes.push(item);
      }
    } else {
      const item: Change = { key, before: slot(current), after: slot(value) };
      if (!same(item.before, item.after)) changes.push(item);
    }
  }
  return changes;
}
export interface BatchPort {
  save(journal: Journal | undefined): PromiseLike<void>;
  read(change: Change): Slot;
  write(change: Change, value: Slot): PromiseLike<void>;
}
export async function restoreBatch(
  journal: Journal,
  port: BatchPort,
): Promise<number> {
  await port.save({ ...journal, phase: "restoring" });
  const conflicts: Change[] = [];
  for (const change of [...journal.changes].reverse()) {
    if (!change.attempted) continue;
    const current = port.read(change);
    if (same(current, change.before)) continue;
    if (!same(current, change.after)) {
      conflicts.push(change);
      continue;
    }
    await port.write(change, change.before);
  }
  await port.save(
    conflicts.length
      ? { ...journal, phase: "conflicts", changes: conflicts.reverse() }
      : undefined,
  );
  return conflicts.length;
}
export async function applyBatch(
  journal: Journal,
  port: BatchPort,
): Promise<void> {
  let progress = journal;
  await port.save(progress);
  try {
    for (let index = 0; index < progress.changes.length; index++) {
      const change = progress.changes[index];
      if (!change) throw new Error("Invalid change index.");
      if (!same(port.read(change), change.before))
        throw new Error(
          "Settings changed since the preview. Review the new values.",
        );
      const next: Journal = {
        ...progress,
        changes: progress.changes.map((entry, i) =>
          i === index ? { ...entry, attempted: true } : entry,
        ),
      };
      await port.save(next);
      progress = next;
      await port.write(change, change.after);
    }
    await port.save({ ...progress, phase: "applied" });
  } catch (error) {
    try {
      await restoreBatch(progress, port);
    } catch {
      throw new Error(
        "The change could not finish or fully roll back. A saved recovery record is available in Profiles.",
      );
    }
    throw error;
  }
}
export function parseJournal(raw: unknown): Journal {
  if (
    !record(raw) ||
    raw.version !== 1 ||
    typeof raw.kind !== "string" ||
    typeof raw.phase !== "string" ||
    !["profile", "pause"].includes(String(raw.kind)) ||
    !["prepared", "applied", "restoring", "conflicts"].includes(
      String(raw.phase),
    ) ||
    typeof raw.name !== "string" ||
    raw.name.length > 80 ||
    !record(raw.scope) ||
    typeof raw.scope.target !== "string" ||
    !["user", "workspace", "folder"].includes(String(raw.scope.target)) ||
    typeof raw.owner !== "string" ||
    typeof raw.created !== "string" ||
    !Array.isArray(raw.changes) ||
    raw.changes.length > 110
  )
    throw new Error(
      "Invalid recovery record. Open an issue before changing the stored recovery data.",
    );
  if (raw.scope.folder !== undefined && typeof raw.scope.folder !== "string")
    throw new Error("Invalid recovery folder.");
  if (
    raw.scope.language !== undefined &&
    (typeof raw.scope.language !== "string" || raw.scope.language.length > 100)
  )
    throw new Error("Invalid recovery language.");
  for (const c of raw.changes) {
    if (
      !record(c) ||
      (c.attempted !== undefined && typeof c.attempted !== "boolean") ||
      !settingKeys.includes(c.key as Key) ||
      (c.action !== undefined &&
        (c.key !== "editor.codeActionsOnSave" || !actionId(c.action))) ||
      (c.containerPresent !== undefined &&
        typeof c.containerPresent !== "boolean")
    )
      throw new Error("Invalid recovery setting.");
    for (const value of [c.before, c.after]) {
      if (!record(value) || typeof value.present !== "boolean")
        throw new Error("Invalid recovery value.");
      if (value.present) {
        if (c.action !== undefined) {
          if (
            ![true, false, "explicit", "always", "never"].includes(
              value.value as string,
            )
          )
            throw new Error("Invalid recovery action.");
        } else if (
          !(c.key === "editor.defaultFormatter" && value.value === null) &&
          !validValue(c.key as Key, value.value)
        )
          throw new Error("Invalid recovery setting value.");
      }
    }
    if (raw.scope.language && String(c.key).startsWith("files."))
      throw new Error("Invalid language-specific recovery setting.");
  }
  return raw as unknown as Journal;
}
