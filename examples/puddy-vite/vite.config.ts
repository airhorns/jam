import { defineConfig } from "vite";

const sandboxAgentURL = process.env.SANDBOX_AGENT_URL ?? "http://localhost:2468";

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
        target: sandboxAgentURL,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
  },
});
