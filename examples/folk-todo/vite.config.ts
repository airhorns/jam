import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
  },
});
