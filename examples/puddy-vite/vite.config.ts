import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
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
