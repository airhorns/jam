import { $, orderBy, where, type QueryClause } from "@jam/core";

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

/** Clauses selecting the project's issues that pass `state`, binding `$.id`. */
export function issueClauses(projectId: string, state: FilterState): QueryClause[] {
  const clauses: QueryClause[] = [["issue", $.id, "project", projectId], ...oneOf("status", state.status), ...oneOf("priority", state.priority)];
  const query = state.query?.trim();
  if (query) {
    clauses.push(
      ["issue", $.id, "title", $.title],
      ["issue", $.id, "description", $.description],
      where.any(where($.title, "icontains", query), where($.description, "icontains", query)),
    );
  }
  return clauses;
}

function oneOf(column: string, values: string[]): QueryClause[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [["issue", $.id, column, values[0]]];
  return [["issue", $.id, column, $[column]], where($[column], "in", values)];
}

/** `issueClauses` sorted by the chosen column, then id, so windows over the list never jump. */
export function orderedIssueClauses(projectId: string, state: FilterState): QueryClause[] {
  return [...issueClauses(projectId, state), ["issue", $.id, state.orderBy, $.key], orderBy($.key, state.orderDirection), orderBy($.id)];
}
