// Loads the wasm module once, wherever this runs: fetched by URL in browsers
// (Vite rewrites the asset URL at build time), read from disk under Node and
// Vitest. Importers see an initialised module because this file awaits at top level.

import init, { JamEngine } from "../pkg/jam_engine_wasm.js";

const wasmUrl = new URL("../pkg/jam_engine_wasm_bg.wasm", import.meta.url);
const nodeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
const isNode = typeof nodeProcess?.versions?.node === "string";

let exports: Awaited<ReturnType<typeof init>>;
if (isNode) {
  const fsModule = "node:fs/promises";
  const urlModule = "node:url";
  const { readFile } = (await import(/* @vite-ignore */ fsModule)) as { readFile(path: string): Promise<Uint8Array> };
  const { fileURLToPath } = (await import(/* @vite-ignore */ urlModule)) as { fileURLToPath(url: URL): string };
  // Vitest's DOM environments serve modules from `http://localhost/@fs/<absolute path>`.
  const path = wasmUrl.protocol === "file:" ? fileURLToPath(wasmUrl) : decodeURIComponent(wasmUrl.pathname.replace(/^\/@fs/, ""));
  exports = await init({ module_or_path: await readFile(path) });
} else {
  exports = await init({ module_or_path: wasmUrl });
}

/** The linear memory every `JamEngine` in this module shares. */
export const wasmMemory: WebAssembly.Memory = exports.memory;

export { JamEngine };
