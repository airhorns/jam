import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  worker: {
    format: "es",
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
