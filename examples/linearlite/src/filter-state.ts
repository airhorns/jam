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

export const LIST_COLUMNS = "id, title, priority, status, modified, created, kanbanorder, username, synced";

/** Build the issue list query for a filter; the ORDER BY tie-breaks on id so windows are stable. */
export function filterStateToSql(state: FilterState): { sql: string; params: unknown[] } {
  const where: string[] = [];
  const params: unknown[] = [];
  const inList = (column: string, values: string[]) => {
    const placeholders = values.map((_, i) => `$${params.length + i + 1}`);
    where.push(`${column} IN (${placeholders.join(", ")})`);
    params.push(...values);
  };
  if (state.status.length) inList("status", state.status);
  if (state.priority.length) inList("priority", state.priority);
  if (state.query) {
    where.push(
      `(setweight(to_tsvector('simple', coalesce(title, '')), 'A') || ` +
        `setweight(to_tsvector('simple', coalesce(description, '')), 'B')) ` +
        `@@ plainto_tsquery('simple', $${params.length + 1})`,
    );
    params.push(state.query);
  }
  where.push("deleted = false");
  const sql =
    `SELECT ${LIST_COLUMNS} FROM issue WHERE ${where.join(" AND ")} ` +
    `ORDER BY ${state.orderBy} ${state.orderDirection.toUpperCase()}, id ASC`;
  return { sql, params };
}
