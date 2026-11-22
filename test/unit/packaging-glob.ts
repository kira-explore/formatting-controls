import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

test("the vsce file discovery adapter preserves case and dotfile options", async () => {
  const root = createRequire(resolve("package.json"));
  const fromVsce = createRequire(root.resolve("@vscode/vsce"));
  const { glob } = fromVsce("tinyglobby") as {
    glob(
      pattern: string,
      options: {
        cwd: string;
        onlyFiles: boolean;
        followSymbolicLinks: boolean;
        dot: boolean;
        ignore: string[];
        caseSensitiveMatch: boolean;
      },
    ): Promise<string[]>;
  };

  const cwd = await mkdtemp(join(tmpdir(), "fc-packaging-"));
  try {
    await mkdir(join(cwd, "NODE_MODULES"));
    await mkdir(join(cwd, "docs"));
    await writeFile(join(cwd, "NODE_MODULES", "sample.js"), "");
    await writeFile(join(cwd, "docs", "guide.md"), "");
    await writeFile(join(cwd, ".hidden"), "");

    const options = {
      cwd,
      onlyFiles: true,
      followSymbolicLinks: false,
      dot: true,
      ignore: ["node_modules/**"],
    };
    assert.deepEqual(
      (await glob("**", { ...options, caseSensitiveMatch: false })).sort(),
      [".hidden", "docs/guide.md"],
    );
    assert.deepEqual(
      (await glob("**", { ...options, caseSensitiveMatch: true })).sort(),
      [".hidden", "NODE_MODULES/sample.js", "docs/guide.md"],
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
