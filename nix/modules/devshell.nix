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
        ]);

        shellHook = ''
          # Only use sccache locally -- in CI it has no warm cache and adds overhead
          if [ -z "''${CI:-}" ]; then
            export RUSTC_WRAPPER="${pkgs.sccache}/bin/sccache"
            export SCCACHE_DIR="$HOME/.cache/sccache-jam"
          fi

          # Nix sets SDKROOT/DEVELOPER_DIR to a nix-provided Apple SDK, but its
          # .swiftinterface files are tied to a specific Swift compiler version.
          # Since we use Xcode's Swift compiler (not nix's), there's always a
          # version mismatch. Point DEVELOPER_DIR at Xcode so xcrun can still
          # find tools, and unset SDKROOT so swift resolves the SDK from within
          # Xcode's developer dir (which always matches its own compiler).
          # The nix C toolchain wrappers have SDK paths baked in and don't need
          # these env vars.
          export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
          unset SDKROOT
        '';
      };
    };
}
