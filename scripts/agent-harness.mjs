#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { worktreePort } from "../playwright.worktree-port.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = join(root, ".jam");
const runsDir = join(stateDir, "runs");
const logsDir = join(stateDir, "logs");

const targets = {
  "folk-todo": {
    cwd: "examples/folk-todo",
    basePort: 5173,
    envVar: "FOLK_TODO_AGENT_PORT",
    command: (port) => ["corepack", ["pnpm", "dev", "--host", "127.0.0.1", "--port", String(port)]],
    smoke: (url) => [
      `open ${url}`,
      "wait --text todos",
      'fill .new-todo "Agent harness smoke"',
      "press Enter",
      'wait --text "Agent harness smoke"',
      'click ".todo-item .toggle"',
      'wait --fn "document.querySelector(\'.todo-item\')?.className.includes(\'done\')"',
      'eval "(() => { const item = document.querySelector(\'.todo-item\'); if (!item?.className.includes(\'done\')) throw new Error(\'todo was not toggled done\'); return item.textContent; })()"',
    ],
  },
  counter: {
    cwd: "examples/counter",
    basePort: 5183,
    envVar: "COUNTER_AGENT_PORT",
    command: (port) => ["corepack", ["pnpm", "dev", "--host", "127.0.0.1", "--port", String(port)]],
    smoke: (url) => [`open ${url}`, "snapshot -i"],
  },
  "puddy-vite": {
    cwd: "examples/puddy-vite",
    basePort: 5193,
    envVar: "PUDDY_VITE_AGENT_PORT",
    command: (port) => ["corepack", ["pnpm", "dev", "--host", "127.0.0.1", "--port", String(port)]],
    smoke: (url) => [`open ${url}`, "snapshot -i"],
  },
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const command = args.shift() ?? "help";
  if (args[0] === "--") args.shift();

  switch (command) {
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "start":
      start(args);
      return;
    case "status":
      status();
      return;
    case "logs":
      logs(args);
      return;
    case "stop":
      stop(args);
      return;
    case "browser-smoke":
      await browserSmoke(args);
      return;
    case "native":
      await native(args);
      return;
    default:
      throw new Error(`Unknown command "${command}". Run "node scripts/agent-harness.mjs --help".`);
  }
}

function printHelp() {
  console.log(`Jam agentic development harness

Usage:
  node scripts/agent-harness.mjs start <target> [--port <port>]
  node scripts/agent-harness.mjs start custom -- <command...>
  node scripts/agent-harness.mjs status
  node scripts/agent-harness.mjs logs [run-id] [--lines <n>]
  node scripts/agent-harness.mjs stop [run-id|all]
  node scripts/agent-harness.mjs browser-smoke [target] [--url <url>]
  node scripts/agent-harness.mjs native <doctor|build|test|run> [package-path]

Targets:
  ${Object.keys(targets).join(", ")}

Transient run state and logs are written under .jam/ (ignored by git).`);
}

function start(args) {
  const port = readOption(args, "--port");
  const name = args.shift() ?? "folk-todo";
  let cwd = root;
  let command;
  let commandArgs;
  let url = null;

  if (name === "custom") {
    const separator = args.indexOf("--");
    const customArgs = separator === -1 ? args : args.slice(separator + 1);
    if (customArgs.length === 0) {
      throw new Error("Custom starts require a command after --.");
    }
    [command, ...commandArgs] = customArgs;
  } else {
    const target = targets[name];
    if (!target) {
      throw new Error(`Unknown target "${name}". Known targets: ${Object.keys(targets).join(", ")}.`);
    }
    const targetPort = parsePort(port, target.envVar, target.basePort);
    [command, commandArgs] = target.command(targetPort);
    cwd = join(root, target.cwd);
    url = `http://127.0.0.1:${targetPort}`;
  }

  ensureStateDirs();
  const runId = `${sanitize(name)}-${timestamp()}`;
  const logPath = join(logsDir, `${runId}.log`);
  const logFd = openSync(logPath, "a");
  writeFileSync(logFd, headerForRun(name, command, commandArgs, cwd, url), { flag: "a" });

  const child = spawn(command, commandArgs, {
    cwd,
    detached: true,
    env: process.env,
    stdio: ["ignore", logFd, logFd],
  });

  child.unref();

  const record = {
    id: runId,
    name,
    pid: child.pid,
    command: [command, ...commandArgs],
    cwd,
    logPath,
    url,
    startedAt: new Date().toISOString(),
  };

  writeRun(record);
  console.log(`started ${runId}`);
  console.log(`pid: ${child.pid}`);
  if (url) console.log(`url: ${url}`);
  console.log(`log: ${relative(root, logPath)}`);
}

function status() {
  ensureStateDirs();
  const records = readRuns();
  if (records.length === 0) {
    console.log("No harness runs recorded.");
    return;
  }

  for (const record of records) {
    const state = isRunning(record.pid) ? "running" : "stopped";
    const url = record.url ? ` ${record.url}` : "";
    console.log(`${record.id} ${state} pid=${record.pid}${url}`);
    console.log(`  log: ${relative(root, record.logPath)}`);
  }
}

function logs(args) {
  ensureStateDirs();
  const lineOption = readOption(args, "--lines") ?? "80";
  const lineCount = Number.parseInt(lineOption, 10);
  if (!Number.isInteger(lineCount) || lineCount < 1) {
    throw new Error(`--lines must be a positive integer, got "${lineOption}".`);
  }

  const record = resolveRun(args[0]);
  if (!record) {
    console.log("No harness runs recorded.");
    return;
  }
  console.log(`==> ${record.id} (${relative(root, record.logPath)}) <==`);
  console.log(tailFile(record.logPath, lineCount));
}

function stop(args) {
  ensureStateDirs();
  const runId = args[0] ?? "all";
  const records = runId === "all" ? readRuns() : readRuns().filter((record) => record.id === runId);

  if (records.length === 0) {
    console.log(runId === "all" ? "No harness runs recorded." : `No run found for "${runId}".`);
    return;
  }

  for (const record of records) {
    if (!isRunning(record.pid)) {
      console.log(`${record.id} already stopped`);
      continue;
    }
    killProcessGroup(record.pid);
    console.log(`stopped ${record.id}`);
  }
}

async function browserSmoke(args) {
  const url = readOption(args, "--url");
  const name = args.shift() ?? "folk-todo";
  const target = targets[name];
  if (!target) {
    throw new Error(`Unknown target "${name}". Known targets: ${Object.keys(targets).join(", ")}.`);
  }
  const targetUrl = url ?? `http://127.0.0.1:${parsePort(null, target.envVar, target.basePort)}`;
  const smoke = target.smoke(targetUrl);
  const [command, commandArgs] = agentBrowserCommand(["batch", "--bail", ...smoke]);
  await runForeground(command, commandArgs, root);
}

async function native(args) {
  const action = args.shift() ?? "doctor";
  const packagePath = args.shift() ?? "packages/native";

  switch (action) {
    case "doctor":
      nativeDoctor();
      return;
    case "build":
      requireSwift();
      if (packagePath === "packages/native" || packagePath.startsWith("examples/")) {
        await runForeground("corepack", ["pnpm", "--dir", "packages/native", "build"], root);
      }
      await runForeground("swift", ["build", "--package-path", packagePath], root);
      return;
    case "test":
      requireSwift();
      await runForeground("swift", ["test", "--package-path", packagePath], root);
      return;
    case "run":
      requireSwift();
      await runForeground("swift", ["run", "--package-path", packagePath], root);
      return;
    default:
      throw new Error(`Unknown native action "${action}". Use doctor, build, test, or run.`);
  }
}

function nativeDoctor() {
  const checks = [
    ["swift", commandExists("swift")],
    ["xcrun", commandExists("xcrun")],
    ["packages/native", existsSync(join(root, "packages/native/Package.swift"))],
    ["examples/counter-ios", existsSync(join(root, "examples/counter-ios/Package.swift"))],
    ["examples/puddy-native", existsSync(join(root, "examples/puddy-native/Package.swift"))],
  ];

  console.log("Jam native harness doctor");
  for (const [label, ok] of checks) {
    console.log(`${ok ? "ok" : "missing"} ${label}`);
  }
  if (!checks[0][1]) {
    console.log("Swift commands are available through this harness, but this machine does not have swift on PATH.");
  }
}

function requireSwift() {
  if (!commandExists("swift")) {
    throw new Error("swift is not on PATH. Install Swift/Xcode before running native build, test, or run commands.");
  }
}

function agentBrowserCommand(args) {
  const local = join(root, "node_modules/.bin/agent-browser");
  if (existsSync(local)) return [local, args];
  return ["corepack", ["pnpm", "exec", "agent-browser", ...args]];
}

function parsePort(value, envVar, basePort) {
  const raw = value ?? process.env[envVar];
  if (raw) {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`Invalid port "${raw}".`);
    }
    return parsed;
  }
  return worktreePort(basePort, envVar);
}

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  args.splice(index, 2);
  return value;
}

function runForeground(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${[command, ...args].join(" ")} failed with ${signal ?? `exit code ${code}`}.`));
    });
  });
}

function ensureStateDirs() {
  mkdirSync(runsDir, { recursive: true });
  mkdirSync(logsDir, { recursive: true });
}

function readRuns() {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(runsDir, file), "utf8")))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

function writeRun(record) {
  writeFileSync(join(runsDir, `${record.id}.json`), `${JSON.stringify(record, null, 2)}\n`);
}

function resolveRun(runId) {
  const records = readRuns();
  if (records.length === 0) return null;
  if (!runId) return records[records.length - 1];
  const record = records.find((candidate) => candidate.id === runId);
  if (!record) throw new Error(`No run found for "${runId}".`);
  return record;
}

function tailFile(path, lineCount) {
  if (!existsSync(path)) return "(log file missing)";
  const content = readFileSync(path, "utf8");
  return content.split(/\r?\n/).slice(-lineCount).join("\n");
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessGroup(pid) {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    process.kill(pid, "SIGTERM");
  }
}

function commandExists(command) {
  const paths = (process.env.PATH ?? "").split(":");
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  return paths.some((path) => extensions.some((ext) => existsSync(join(path, `${command}${ext}`))));
}

function headerForRun(name, command, args, cwd, url) {
  return [
    `# Jam harness run ${name}`,
    `# started: ${new Date().toISOString()}`,
    `# cwd: ${cwd}`,
    `# command: ${[command, ...args].join(" ")}`,
    url ? `# url: ${url}` : null,
    "",
  ].filter(Boolean).join("\n") + "\n\n";
}

function sanitize(value) {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
}
