import assert from "node:assert/strict";
export function verifyReleaseTag(
  version: string,
  revision: string,
  output: string,
): void {
  assert.match(revision, /^[a-f0-9]{40}$/i, "Invalid candidate revision");
  const ref = `refs/tags/v${version}`;
  const entries = new Map<string, string>();
  for (const line of output.trim().split("\n").filter(Boolean)) {
    const [sha, name, ...extra] = line.trim().split(/\s+/);
    assert.ok(
      sha &&
        /^[a-f0-9]{40}$/i.test(sha) &&
        (name === ref || name === `${ref}^{}`) &&
        extra.length === 0 &&
        !entries.has(name),
      "Invalid remote tag response",
    );
    entries.set(name, sha);
  }
  const target = entries.get(`${ref}^{}`) ?? entries.get(ref);
  if (target)
    assert.equal(
      target.toLowerCase(),
      revision.toLowerCase(),
      `Existing v${version} tag points to a different commit`,
    );
}
