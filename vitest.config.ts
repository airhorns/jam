import { defineConfig } from "vitest/config";

// Runs the library packages' unit suites together so coverage is measured and gated as one number.
export default defineConfig({
  test: {
    projects: ["packages/core", "packages/engine", "packages/ui", "packages/meta-agent"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: ["**/__tests__/**", "**/*.test.*", "**/*.bench.*", "**/*.d.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
