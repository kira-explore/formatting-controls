import { globSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { build as buildWebview } from "vite";
import webviewConfig from "./webview-ui/vite.config";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
// VS Code loads the bundled host and its integration suite as CommonJS.
writeFileSync("dist/package.json", JSON.stringify({ type: "commonjs" }));

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
  minifySyntax: true,
});
for (const file of globSync("test/{unit,integration}/**/*.ts"))
  await build({
    entryPoints: [file],
    outfile: join("dist", file).replace(/\.ts$/, ".js"),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: ["vscode"],
  });

await buildWebview({ ...webviewConfig, configFile: false });
