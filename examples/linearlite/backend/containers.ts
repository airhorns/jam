// Runs the Postgres + Electric backend with plain `docker` or `podman` commands
// (no compose), so the same script works on a laptop with podman and in CI.
//
//   tsx backend/containers.ts up     # start both, wait until healthy
//   tsx backend/containers.ts down   # remove containers and network

import { execFileSync, spawnSync } from "node:child_process";

const NAME = "jam-linearlite";
const POSTGRES = `${NAME}-postgres`;
const ELECTRIC = `${NAME}-electric`;
const POSTGRES_PORT = Number(process.env.JAM_POSTGRES_PORT ?? 54321);
const ELECTRIC_PORT = Number(process.env.JAM_ELECTRIC_PORT ?? 3033);
const ELECTRIC_URL = `http://localhost:${ELECTRIC_PORT}`;

const runtime = (() => {
  for (const candidate of [process.env.CONTAINER_RUNTIME, "docker", "podman"]) {
    if (candidate && spawnSync(candidate, ["version"], { stdio: "ignore" }).status === 0) return candidate;
  }
  throw new Error("backend: neither docker nor podman is available");
})();

function run(args: string[], options: { quiet?: boolean; check?: boolean } = {}): string {
  const result = spawnSync(runtime, args, { encoding: "utf8", stdio: options.quiet ? "pipe" : ["ignore", "pipe", "inherit"] });
  if (options.check !== false && result.status !== 0) {
    throw new Error(`${runtime} ${args.join(" ")} failed${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
  }
  return result.stdout ?? "";
}

const exists = (container: string) => spawnSync(runtime, ["container", "inspect", container], { stdio: "ignore" }).status === 0;

async function waitFor(what: string, probe: () => boolean | Promise<boolean>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await Promise.resolve().then(probe).catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`backend: ${what} did not become ready within ${timeoutMs / 1000}s`);
}

async function up(): Promise<void> {
  run(["network", "create", NAME], { quiet: true, check: false });
  if (!exists(POSTGRES)) {
    run([
      "run", "-d", "--name", POSTGRES, "--network", NAME,
      "-p", `${POSTGRES_PORT}:5432`,
      "-e", "POSTGRES_DB=linearlite", "-e", "POSTGRES_USER=postgres", "-e", "POSTGRES_PASSWORD=password",
      "--tmpfs", "/var/lib/postgresql/data", "--tmpfs", "/tmp",
      "postgres:16-alpine", "postgres", "-c", "wal_level=logical",
    ]);
  }
  await waitFor("postgres", () => {
    const result = spawnSync(runtime, ["exec", POSTGRES, "pg_isready", "-U", "postgres", "-d", "linearlite"], { stdio: "ignore" });
    return result.status === 0;
  });
  if (!exists(ELECTRIC)) {
    run([
      "run", "-d", "--name", ELECTRIC, "--network", NAME,
      "-p", `${ELECTRIC_PORT}:3000`,
      "-e", `DATABASE_URL=postgresql://postgres:password@${POSTGRES}:5432/linearlite?sslmode=disable`,
      "-e", "ELECTRIC_INSECURE=true",
      "electricsql/electric:latest",
    ]);
  }
  await waitFor("electric", async () => {
    const response = await fetch(`${ELECTRIC_URL}/v1/health`);
    return response.ok && (await response.json()).status === "active";
  });
  console.info(`backend: postgres on :${POSTGRES_PORT}, electric on ${ELECTRIC_URL} (${runtime})`);
}

function down(): void {
  for (const container of [ELECTRIC, POSTGRES]) run(["rm", "-f", container], { quiet: true, check: false });
  run(["network", "rm", NAME], { quiet: true, check: false });
  console.info("backend: stopped");
}

const command = process.argv[2];
if (command === "up") await up();
else if (command === "down") down();
else if (command === "logs") execFileSync(runtime, ["logs", process.argv[3] === "postgres" ? POSTGRES : ELECTRIC], { stdio: "inherit" });
else {
  console.error("usage: tsx backend/containers.ts up | down | logs [postgres|electric]");
  process.exit(1);
}
