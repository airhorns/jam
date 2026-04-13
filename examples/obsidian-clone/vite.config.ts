import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  optimizeDeps: {
    exclude: ["wa-sqlite"],
  },
  worker: {
    format: "es",
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
  },
});
