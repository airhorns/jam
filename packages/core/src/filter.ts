// FactFilter — which slice of jam_facts a subscription wants. compileFilter()
// turns it into the where-clause a shape (or the local mirror) runs over the
// table's `scope`/`t0..t2` columns; parseFilter() is its inverse, so a proxy
// can check what a client asked for before letting the request through.

import { isBinding, type Fact, type PatternTerm, type Term, _ } from "./terms";

export interface FactFilter {
  /** Only facts in this partition; omit for every partition, "" for global facts. */
  scope?: string;
  /** Literal terms in the first three positions narrow the shape (`["issue", _, "project"]`); later positions must be wildcards. */
  pattern?: PatternTerm[];
}

export interface CompiledFilter {
  id: string;
  /** SQL over jam_facts columns with `$n` placeholders; empty for "everything". */
  where: string;
  params: string[];
  /** Whether a fact in `scope` belongs to this filter; omit `scope` to ask whether any scope could. */
  matches(terms: Fact, scope?: string): boolean;
}

export const FILTER_COLUMNS = ["t0", "t1", "t2"] as const;

export function compileFilter(filter: FactFilter = {}): CompiledFilter {
  const clauses: string[] = [];
  const params: string[] = [];
  const literals: Array<[number, Term]> = [];
  if (filter.scope !== undefined) {
    params.push(filter.scope);
    clauses.push(`scope = $${params.length}`);
  }
  (filter.pattern ?? []).forEach((term, i) => {
    if (term === _ || isBinding(term)) return;
    if (i >= FILTER_COLUMNS.length) throw new Error(`sync: pattern filters may only use the first ${FILTER_COLUMNS.length} terms`);
    literals.push([i, term]);
    params.push(JSON.stringify(term));
    clauses.push(`${FILTER_COLUMNS[i]} = $${params.length}`);
  });
  const where = clauses.join(" AND ");
  return {
    id: `jam_shape_${hash(where + "|" + JSON.stringify(params))}`,
    where,
    params,
    matches: (terms, scope) =>
      (filter.scope === undefined || scope === undefined || scope === filter.scope) &&
      literals.every(([i, term]) => terms[i] === term),
  };
}

const CLAUSE = /^(scope|t0|t1|t2) = \$(\d+)$/;

/**
 * Recover the FactFilter behind a where-clause compileFilter() produced, or
 * null when the clause is anything else (it must compile back to exactly the
 * same SQL). Wildcards fill the pattern positions that carry no literal.
 */
export function parseFilter(where: string, params: string[]): FactFilter | null {
  const filter: FactFilter = {};
  const pattern: PatternTerm[] = [];
  for (const clause of where ? where.split(" AND ") : []) {
    const match = CLAUSE.exec(clause);
    if (!match) return null;
    const value = params[Number(match[2]) - 1];
    if (value === undefined) return null;
    if (match[1] === "scope") {
      filter.scope = value;
      continue;
    }
    const position = FILTER_COLUMNS.indexOf(match[1] as (typeof FILTER_COLUMNS)[number]);
    const literal = parseLiteral(value);
    if (literal === undefined || pattern.length > position) return null;
    while (pattern.length < position) pattern.push(_);
    pattern.push(literal);
  }
  if (pattern.length) filter.pattern = pattern;
  const compiled = compileFilter(filter);
  const roundTrips = compiled.where === where && compiled.params.length === params.length && compiled.params.every((p, i) => p === params[i]);
  return roundTrips ? filter : null;
}

function parseLiteral(json: string): Term | undefined {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** cyrb53 — a small, stable string hash. */
export function hash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
