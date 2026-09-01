import { defineConfig } from "vite";

// CATALOG_BASE sets the public path for a subpath deploy, e.g. /jam/ on GitHub Pages.
export default defineConfig({
  base: process.env.CATALOG_BASE ?? "/",
  esbuild: {
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  build: {
    // @jam/engine awaits its wasm module at top level, which Vite's default es2020 target rejects.
    target: "es2022",
  },
});
