import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  build: {
    target: "es2022",
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
