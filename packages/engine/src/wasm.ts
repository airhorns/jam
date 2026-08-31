// Loads the wasm module once, wherever this runs: fetched by URL in browsers
// (Vite rewrites the asset URL at build time), read from disk under Node and
// Vitest. Importers see an initialised module because this file awaits at top level.

import init, { JamEngine } from "../pkg/jam_engine_wasm.js";

const wasmUrl = new URL("../pkg/jam_engine_wasm_bg.wasm", import.meta.url);

if (wasmUrl.protocol === "file:") {
  const fsModule = "node:fs/promises";
  const { readFile } = (await import(/* @vite-ignore */ fsModule)) as typeof import("node:fs/promises");
  await init({ module_or_path: await readFile(wasmUrl) });
} else {
  await init({ module_or_path: wasmUrl });
}

export { JamEngine };
