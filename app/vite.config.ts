import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The theme script has to run before the page first draws, so it can't be
// a module (modules run after parsing). It's written in TypeScript and
// inlined, compiled, as the first script in each page's <head>.
function inlineTheme(): Plugin {
  const file = resolve(__dirname, "ui/src/theme.ts");
  return {
    name: "inline-theme",
    async transformIndexHtml() {
      const { code } = await transformWithEsbuild(readFileSync(file, "utf8"), file, { format: "iife", minify: true, target: "es2022" });
      return [{ tag: "script", children: code, injectTo: "head-prepend" }];
    },
  };
}

// The UI lives in ui/; Tauri loads the built pages from dist/.
export default defineConfig({
  root: "ui",
  base: "./",
  clearScreen: false,
  plugins: [inlineTheme()],
  server: { port: 5179, strictPort: true, host: "127.0.0.1" },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: { main: resolve(__dirname, "ui/index.html"), download: resolve(__dirname, "ui/download.html") },
    },
  },
});
