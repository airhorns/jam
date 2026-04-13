import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/__tests__/**/*.ts"],
    exclude: ["e2e/**"],
  },
});
