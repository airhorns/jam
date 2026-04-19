import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { defineConfig, type Plugin } from "vite";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
  return stdout.trim();
}

function parsePorcelainStatus(output: string) {
  const files: { path: string; index: string; workingTree: string; kind: string }[] = [];

  for (const line of output.split("\n")) {
    if (!line || line.startsWith("## ")) continue;

    const index = line[0] ?? " ";
    const workingTree = line[1] ?? " ";
    const rawPath = line.slice(3);
    const path = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1)! : rawPath;
    const kind =
      index === "?" && workingTree === "?"
        ? "untracked"
        : index !== " " && workingTree !== " "
          ? "staged+modified"
          : index !== " "
            ? "staged"
            : "modified";

    files.push({ path, index, workingTree, kind });
  }

  return files;
}

function gitStatePlugin(): Plugin {
  return {
    name: "puddy-git-state",
    configureServer(server) {
      server.middlewares.use("/__puddy/git-state", async (_req, res) => {
        try {
          const [branch, porcelain, upstreamResult, originMainResult, head] = await Promise.all([
            git(["rev-parse", "--abbrev-ref", "HEAD"]),
            git(["status", "--porcelain=v1", "-b"]),
            git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]).catch(
              () => "",
            ),
            git(["rev-parse", "--verify", "--quiet", "origin/main"]).catch(() => ""),
            git(["rev-parse", "--short", "HEAD"]),
          ]);
          const upstream = originMainResult ? "origin/main" : upstreamResult || "HEAD~1";
          const [aheadResult, behindResult, lastCommit, aheadLog] = await Promise.all([
            git(["rev-list", "--count", `${upstream}..HEAD`]).catch(() => "0"),
            git(["rev-list", "--count", `HEAD..${upstream}`]).catch(() => "0"),
            git(["log", "-1", "--pretty=format:%h %s"]).catch(() => head),
            git(["log", "--pretty=format:%h%x09%s", `${upstream}..HEAD`]).catch(() => ""),
          ]);
          const files = parsePorcelainStatus(porcelain);
          const staged = files.filter((file) => file.index !== " " && file.index !== "?").length;
          const unstaged = files.filter((file) => file.workingTree !== " " && file.workingTree !== "?").length;
          const untracked = files.filter((file) => file.kind === "untracked").length;
          const commits = aheadLog
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const [hash, subject = ""] = line.split("\t");
              return { hash, subject };
            });

          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              branch,
              upstream,
              head,
              ahead: Number(aheadResult) || 0,
              behind: Number(behindResult) || 0,
              dirty: files.length > 0,
              staged,
              unstaged,
              untracked,
              files,
              commits,
              lastCommit,
              updatedAt: new Date().toISOString(),
            }),
          );
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              updatedAt: new Date().toISOString(),
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [gitStatePlugin()],
  esbuild: {
    jsxFactory: "h",
    jsxFragment: "Fragment",
  },
  optimizeDeps: {
    exclude: ["wa-sqlite"],
  },
  worker: {
    format: "es",
  },
  server: {
    proxy: {
      "/v1": {
        target: "http://localhost:2468",
        changeOrigin: true,
      },
    },
  },
  test: {
    exclude: ["e2e/**", "node_modules/**"],
  },
});
