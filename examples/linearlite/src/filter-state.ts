import type { Issue } from "./types";

export interface FilterState {
  orderBy: string;
  orderDirection: "asc" | "desc";
  status: string[];
  priority: string[];
  query?: string;
}

const ORDERABLE = new Set(["created", "modified", "title", "priority", "status", "kanbanorder"]);

export function filterStateFromParams(params: URLSearchParams): FilterState {
  const orderBy = params.get("orderBy") ?? "created";
  const orderDirection = params.get("orderDirection") === "asc" ? "asc" : "desc";
  const status = params.getAll("status").flatMap((s) => s.toLowerCase().split(",")).filter(Boolean);
  const priority = params.getAll("priority").flatMap((p) => p.toLowerCase().split(",")).filter(Boolean);
  const query = params.get("query") || undefined;
  return { orderBy: ORDERABLE.has(orderBy) ? orderBy : "created", orderDirection, status, priority, query };
}

export function filterStateToParams(state: Partial<FilterState>, base = new URLSearchParams()): URLSearchParams {
  const params = new URLSearchParams(base);
  const apply = (key: string, value: string | undefined) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  if ("orderBy" in state) apply("orderBy", state.orderBy === "created" ? undefined : state.orderBy);
  if ("orderDirection" in state) apply("orderDirection", state.orderDirection === "desc" ? undefined : state.orderDirection);
  if ("status" in state) apply("status", state.status?.join(","));
  if ("priority" in state) apply("priority", state.priority?.join(","));
  if ("query" in state) apply("query", state.query);
  return params;
}

/** Issues matching the filter; a search query is a case-insensitive substring match on title and description. */
export function filterIssues<T extends Partial<Issue>>(issues: T[], state: FilterState): T[] {
  const query = state.query?.trim().toLowerCase();
  return issues.filter(
    (issue) =>
      (state.status.length === 0 || state.status.includes(issue.status ?? "")) &&
      (state.priority.length === 0 || state.priority.includes(issue.priority ?? "")) &&
      (!query || `${issue.title ?? ""}\n${issue.description ?? ""}`.toLowerCase().includes(query)),
  );
}

/** Stable ordering: the chosen column, then id, so windows over the list never jump. */
export function sortIssues<T extends Partial<Issue> & { id: string }>(issues: T[], state: Pick<FilterState, "orderBy" | "orderDirection">): T[] {
  const column = state.orderBy as keyof Issue;
  const direction = state.orderDirection === "asc" ? 1 : -1;
  return [...issues].sort((a, b) => {
    const av = String(a[column] ?? "");
    const bv = String(b[column] ?? "");
    return (av < bv ? -1 : av > bv ? 1 : 0) * direction || a.id.localeCompare(b.id);
  });
}
