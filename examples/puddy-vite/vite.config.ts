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
  server: {
    proxy: {
      "/v1": {
        target: "http://localhost:2468",
        changeOrigin: true,
      },
    },
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
  },
});
