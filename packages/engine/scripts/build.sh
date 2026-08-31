#!/usr/bin/env bash
# Build crates/jam-engine-wasm and emit the JS glue into packages/engine/pkg.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
cd "$root/crates"
cargo build --release -p jam-engine-wasm --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir "$here/pkg" --out-name jam_engine_wasm \
  target/wasm32-unknown-unknown/release/jam_engine_wasm.wasm
rm -f "$here/pkg/.gitignore" "$here/pkg/package.json"
ls -la "$here/pkg"
