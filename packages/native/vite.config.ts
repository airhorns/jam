import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: "src/bridge-shim.ts",
      formats: ["iife"],
      name: "JamNative",
      fileName: () => "jam-runtime.iife.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    target: "es2020",
    minify: false,
  },
  esbuild: {
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  resolve: {
    alias: {
      "@jam/core/jsx": "../core/src/jsx.ts",
      "@jam/core": "../core/src/index.ts",
      "@jam/ui": "../jamagui/src/index.ts",
    },
  },
});
