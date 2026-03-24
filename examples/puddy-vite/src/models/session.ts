// Session status helpers.
// Session state now lives in the fact database via assert/retract.

export function isTerminalStatus(status: string): boolean {
  return status === "ended" || status === "failed";
}
