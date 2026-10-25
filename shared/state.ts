import type { Snapshot } from "./protocol";

type Version = Pick<Snapshot, "revision" | "navigation">;
/** A late snapshot must not roll back either configuration or navigation. */
export function isCurrentSnapshot(
  previous: Version | undefined,
  next: Version,
): boolean {
  return (
    !previous ||
    (next.revision >= previous.revision &&
      next.navigation >= previous.navigation)
  );
}
