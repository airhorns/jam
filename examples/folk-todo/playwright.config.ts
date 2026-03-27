import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 15000,
  use: {
    baseURL: "http://localhost:5174",
    headless: true,
  },
  webServer: {
    command: "npx vite --port 5174",
    port: 5174,
    reuseExistingServer: true,
  },
});
