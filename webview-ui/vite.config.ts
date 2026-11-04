import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
export default defineConfig({
  root: resolve(import.meta.dirname),
  base: "./",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "import.meta.env.VITE_EXTENSION_VERSION": JSON.stringify(version),
  },
  build: {
    outDir: resolve(import.meta.dirname, "../dist/webview"),
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "src/main.tsx"),
      formats: ["es"],
      fileName: () => "dashboard.js",
      cssFileName: "dashboard",
    },
    minify: true,
    rolldownOptions: { output: { codeSplitting: false } },
  },
});
