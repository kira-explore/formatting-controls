import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  closeSync,
  existsSync,
  type FSWatcher,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { lock } from "proper-lockfile";
import { type Profile, parseProfile, record } from "../shared/workflows";
export interface ProfileRepository {
  read(): Profile[];
  commit(
    name: string,
    expected: Profile | undefined,
    next: Profile | undefined,
  ): Promise<void>;
  onDidChange(listener: () => void): { dispose(): void };
}
export class FileProfiles implements ProfileRepository {
  private readonly changed = new EventEmitter();
  private watcher: FSWatcher | undefined;
  private disposed = false;
  constructor(
    private readonly uri: { scheme: string; fsPath: string },
    private readonly legacy: { get<T>(key: string): T | undefined },
  ) {}
  private location(): string {
    // Desktop VS Code uses vscode-userdata for its native User-data directory.
    if (!["file", "vscode-userdata"].includes(this.uri.scheme))
      throw new Error(
        "Shared profiles require file-based extension storage in this host.",
      );
    mkdirSync(this.uri.fsPath, { recursive: true, mode: 0o700 });
    if (!this.watcher && !this.disposed) {
      try {
        this.watcher = watch(
          this.uri.fsPath,
          { persistent: false },
          (_event, name) => {
            if (!name || String(name) === "profiles-v2.json")
              this.changed.emit("change");
          },
        );
        this.watcher.on("error", () => {
          this.watcher?.close();
          this.watcher = undefined;
        });
      } catch {
        /* Window focus and Refresh profiles remain available if watching fails. */
      }
    }
    return join(this.uri.fsPath, "profiles-v2.json");
  }
  onDidChange(listener: () => void): { dispose(): void } {
    this.changed.on("change", listener);
    return {
      dispose: () => {
        this.changed.off("change", listener);
      },
    };
  }
  read(): Profile[] {
    const path = this.location();
    let raw: unknown;
    if (existsSync(path)) {
      if (statSync(path).size > 8388608)
        throw new Error("Stored profiles exceed the 8 MiB storage limit.");
      const data = readFileSync(path);
      if (data.length > 8388608)
        throw new Error("Stored profiles exceed the 8 MiB storage limit.");
      const document: unknown = JSON.parse(data.toString("utf8"));
      if (!record(document) || document.version !== 2)
        throw new Error("Invalid profile storage version.");
      raw = document.profiles;
    } else
      raw = this.legacy.get<unknown>("formattingControls.profiles.v1") ?? [];
    if (!Array.isArray(raw) || raw.length > 50)
      throw new Error("Invalid stored profiles.");
    const profiles = raw.map(parseProfile);
    if (new Set(profiles.map((p) => p.name)).size !== profiles.length)
      throw new Error("Stored profile names must be unique.");
    return profiles;
  }
  async commit(
    name: string,
    expected: Profile | undefined,
    next: Profile | undefined,
  ): Promise<void> {
    const path = this.location();
    let compromised: Error | undefined;
    let release: () => Promise<void>;
    try {
      release = await lock(path, {
        realpath: false,
        stale: 60000,
        update: 10000,
        retries: {
          retries: 15,
          minTimeout: 50,
          maxTimeout: 250,
          randomize: true,
        },
        onCompromised: (error) => {
          compromised = error;
        },
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOCKED")
        throw new Error(
          "Profiles are busy in another window. Try again shortly.",
        );
      throw error;
    }
    let temporary: string | undefined;
    try {
      const current = this.read();
      if (
        !isDeepStrictEqual(
          current.find((p) => p.name === name),
          expected,
        )
      )
        throw new Error(
          "This saved profile changed while confirmation was open. Review the profiles and try again.",
        );
      if (next && next.name !== name)
        throw new Error("Profile identity changed.");
      if (next && !expected && current.length >= 50)
        throw new Error("At most 50 custom profiles can be saved.");
      const profiles = current.filter((p) => p.name !== name);
      if (next) profiles.push(parseProfile(next));
      if (compromised)
        throw new Error(
          "Profile storage coordination was interrupted. Retry the operation.",
        );
      const data = Buffer.from(
        `${JSON.stringify({ version: 2, profiles }, null, 2)}\n`,
      );
      if (data.length > 8388608)
        throw new Error("Stored profiles exceed the 8 MiB storage limit.");
      temporary = join(this.uri.fsPath, `profiles-${randomUUID()}.tmp`);
      const fd = openSync(temporary, "wx", 0o600);
      try {
        writeFileSync(fd, data);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, path);
      temporary = undefined;
      this.changed.emit("change");
    } finally {
      if (temporary) rmSync(temporary, { force: true });
      await release();
    }
  }
  dispose(): void {
    this.disposed = true;
    this.watcher?.close();
    this.watcher = undefined;
    this.changed.removeAllListeners();
  }
}
