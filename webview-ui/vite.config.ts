import { resolve } from "node:path";
import { defineConfig } from "vite";
export default defineConfig({
  root: resolve(import.meta.dirname),
  base: "./",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
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
