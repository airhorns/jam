{ inputs, ... }:
{
  perSystem = { config, self', pkgs, lib, system, ... }:
    let
      # Set up rust overlay for the toolchain
      rustPkgs = import inputs.nixpkgs {
        inherit system;
        overlays = [ inputs.rust-overlay.overlays.default ];
      };

      # Get rust toolchain from rust-toolchain.toml
      rustToolchain = rustPkgs.rust-bin.fromRustupToolchainFile ../../rust-toolchain.toml;
    in
    {
      devShells.default = pkgs.mkShell {
        name = "jam-shell";
        packages = [
          rustToolchain
        ] ++ (with pkgs; [
          git
          just
          nixd
          bacon
          sccache
          clang
          libclang.lib
          pnpm
          nodejs_24
        ]);

        LIBCLANG_PATH = "${pkgs.libclang.lib}/lib";

        shellHook = ''
          # Only use sccache locally -- in CI it has no warm cache and adds overhead
          if [ -z "''${CI:-}" ]; then
            export RUSTC_WRAPPER="${pkgs.sccache}/bin/sccache"
            export SCCACHE_DIR="$HOME/.cache/sccache-jam"
          fi
        '';
      };
    };
}
