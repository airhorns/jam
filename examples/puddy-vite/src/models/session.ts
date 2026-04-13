// Session status helpers.
// Session state now lives in the fact database via remember/forget.

export function isTerminalStatus(status: string): boolean {
  return status === "ended" || status === "failed";
}
