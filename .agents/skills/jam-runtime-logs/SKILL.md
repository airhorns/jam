---
name: jam-runtime-logs
description: Start, monitor, and hand off logs for Jam dev servers or backend-like processes. Use whenever a long-running process is needed for validation or debugging.
allowed-tools: Bash(mkdir:*), Bash(pnpm:*), Bash(tail:*), Bash(ps:*), Bash(kill:*), Bash(lsof:*), Bash(cat:*), Bash(rg:*)
---

# Jam Runtime Logs

Always preserve logs for long-running processes you start so another agent can
inspect failures after the fact. Use the ignored `scratch/` directory.

## Foreground With Log Capture

```bash
mkdir -p scratch/logs
pnpm --dir examples/folk-todo dev 2>&1 | tee scratch/logs/folk-todo.log
```

## Background Process

```bash
mkdir -p scratch/logs
nohup pnpm --dir examples/folk-todo dev > scratch/logs/folk-todo.log 2>&1 &
echo $! > scratch/logs/folk-todo.pid
tail -f scratch/logs/folk-todo.log
```

## Inspect And Stop

```bash
tail -n 200 scratch/logs/folk-todo.log
cat scratch/logs/folk-todo.pid
kill "$(cat scratch/logs/folk-todo.pid)"
```

If a port is occupied, identify the owner before choosing a new port:

```bash
lsof -i :5173
```

Record the log path and any relevant error lines in the workpad or PR notes.
