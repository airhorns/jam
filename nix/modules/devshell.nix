{ inputs, ... }:
{
  perSystem = { config, self', pkgs, lib, system, ... }:
    {
      devShells.default = pkgs.mkShell {
        name = "jam-shell";
        packages = with pkgs; [
          git
          just
          nixd
          nodejs
          pnpm
        ];
      };
    };
}
