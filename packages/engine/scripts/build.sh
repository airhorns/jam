#!/usr/bin/env bash
# Build crates/jam-engine-wasm and emit the JS glue into packages/engine/pkg.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
cd "$root/crates"
# Registry sources are referenced by absolute path in panic locations; remapping them keeps the
# artifact byte-identical across machines so CI can check the committed build against the source.
registry="${CARGO_HOME:-$HOME/.cargo}/registry/src"
RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$registry=/cargo/registry/src" \
  cargo build --locked --release -p jam-engine-wasm --target wasm32-unknown-unknown
# The producers section records how the wasm-bindgen binary itself was built (git hash or not).
wasm-bindgen --target web --remove-producers-section --out-dir "$here/pkg" --out-name jam_engine_wasm \
  target/wasm32-unknown-unknown/release/jam_engine_wasm.wasm
rm -f "$here/pkg/.gitignore" "$here/pkg/package.json"
ls -la "$here/pkg"
