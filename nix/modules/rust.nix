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

      src = craneLib.cleanCargoSource inputs.self;

      # Common args for crane builds
      commonArgs = {
        inherit src;
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
