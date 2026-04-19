export function worktreePort(basePort, envVar) {
  const override = process.env[envVar] ?? process.env.PLAYWRIGHT_PORT;
  if (override) {
    const port = Number.parseInt(override, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${envVar} must be a valid TCP port, got ${override}`);
    }
    return port;
  }

  let hash = 0;
  for (const char of process.cwd()) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  }
  return basePort + hash;
}
