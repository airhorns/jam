import { defineConfig } from "@playwright/test";

// Override with CATALOG_PORT when 5175 is taken by something else.
const port = Number(process.env.CATALOG_PORT ?? 5175);

export default defineConfig({
  testDir: "./e2e",
  timeout: 20000,
  use: {
    baseURL: `http://localhost:${port}`,
    headless: true,
    viewport: { width: 1100, height: 800 },
  },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: true,
  },
  projects: [
    { name: "e2e", testIgnore: /shots\.spec\.ts/ },
    { name: "shots", testMatch: /shots\.spec\.ts/ },
  ],
});
