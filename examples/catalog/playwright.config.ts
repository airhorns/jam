import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 20000,
  use: {
    baseURL: "http://localhost:5175",
    headless: true,
    viewport: { width: 1100, height: 800 },
  },
  webServer: {
    command: "pnpm exec vite --port 5175",
    port: 5175,
    reuseExistingServer: true,
  },
  projects: [
    { name: "e2e", testIgnore: /shots\.spec\.ts/ },
    { name: "shots", testMatch: /shots\.spec\.ts/ },
  ],
});
