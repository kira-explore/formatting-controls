import { globSync } from "node:fs";
import { build } from "esbuild";

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.cjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
});
for (const file of globSync("test/**/*.ts"))
  await build({
    entryPoints: [file],
    outfile: file.replace("test/", "dist/test/").replace(".ts", ".cjs"),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["vscode"],
  });
