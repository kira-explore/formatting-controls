import { globSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
// VS Code loads the bundled host and its integration suite as CommonJS.
writeFileSync("dist/package.json", JSON.stringify({ type: "commonjs" }));

await build({
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["vscode"],
  sourcemap: true,
  minifySyntax: true,
  minifyWhitespace: true,
});
for (const file of globSync("test/{unit,integration}/**/*.ts"))
  await build({
    entryPoints: [file],
    outfile: join("dist", file).replace(/\.ts$/, ".js"),
    bundle: true,
    platform: "node",
    target: "node24",
    format: "cjs",
    external: ["vscode"],
  });

// The host loads the dashboard script and stylesheet as separate assets.
await build({
  entryPoints: [
    { in: "webview-ui/src/main.tsx", out: "dashboard" },
    { in: "webview-ui/src/styles.css", out: "dashboard" },
  ],
  outdir: "dist/webview",
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "chrome132",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
