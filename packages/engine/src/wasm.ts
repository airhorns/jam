// Loads the wasm module once, wherever this runs: fetched by URL in browsers
// (Vite rewrites the asset URL at build time), read from disk under Node and
// Vitest. Importers see an initialised module because this file awaits at top level.

import init, { JamEngine } from "../pkg/jam_engine_wasm.js";

const wasmUrl = new URL("../pkg/jam_engine_wasm_bg.wasm", import.meta.url);
const isNode = typeof process !== "undefined" && typeof process.versions?.node === "string";

if (isNode) {
  const fsModule = "node:fs/promises";
  const urlModule = "node:url";
  const { readFile } = (await import(/* @vite-ignore */ fsModule)) as typeof import("node:fs/promises");
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlModule)) as typeof import("node:url");
  // Vitest's DOM environments serve modules from `http://localhost/@fs/<absolute path>`.
  const path = wasmUrl.protocol === "file:" ? fileURLToPath(wasmUrl) : decodeURIComponent(wasmUrl.pathname.replace(/^\/@fs/, ""));
  await init({ module_or_path: await readFile(path) });
} else {
  await init({ module_or_path: wasmUrl });
}

export { JamEngine };
