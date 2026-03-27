{ inputs, ... }:
{
  perSystem = { config, self', pkgs, lib, system, ... }:
    let
      # Set up rust overlay for the toolchain from rust-toolchain.toml
      rustPkgs = import inputs.nixpkgs {
        inherit system;
        overlays = [ inputs.rust-overlay.overlays.default ];
      };

      # Get rust toolchain from rust-toolchain.toml
      rustToolchain = rustPkgs.rust-bin.fromRustupToolchainFile ../../rust-toolchain.toml;

      # Create crane lib with our toolchain
      craneLib = (inputs.crane.mkLib pkgs).overrideToolchain rustToolchain;

      tsFilter = path: _type:
        lib.hasSuffix ".ts" path || lib.hasSuffix ".tsx" path;

      src = lib.cleanSourceWith {
        src = inputs.self;
        filter = path: type:
          (tsFilter path type) || (craneLib.filterCargoSources path type);
      };

      # Vendor cargo deps, patching the llrt git checkout so `cargo package --list`
      # doesn't fail on its missing workspace-root LICENSE file.
      cargoVendorDir = craneLib.vendorCargoDeps {
        inherit src;
        overrideVendorGitCheckout = ps: drv:
          if lib.any (p: lib.hasPrefix "git+https://github.com/awslabs/llrt" (p.source or "")) ps then
            drv.overrideAttrs (old: {
              postUnpack = (old.postUnpack or "") + ''
                # cargo package --list validates that license-file and readme exist;
                # llrt subcrates inherit these from the workspace root, so they're
                # missing when cargo checks each subcrate directory individually.
                find "$sourceRoot" -name Cargo.toml -print0 | while IFS= read -r -d "" f; do
                  dir="$(dirname "$f")"
                  touch "$dir/LICENSE" "$dir/README.md"
                done
              '';
            })
          else drv;
      };

      # Common args for crane builds
      commonArgs = {
        inherit src cargoVendorDir;
        strictDeps = true;
      };

      # Build dependencies separately for caching
      cargoArtifacts = craneLib.buildDepsOnly commonArgs;

      # Main package
      jam = craneLib.buildPackage (commonArgs // {
        inherit cargoArtifacts;
      });
    in
    {
      packages.default = jam;
      packages.jam = jam;

      checks.jam = jam;
    };
}
