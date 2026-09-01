// Sync filters and the wire protocol shared by the client (sync.ts) and the
// server (server.ts). A filter selects a slice of the durable facts: a scope,
// literal terms in leading positions, or both.

import { _ } from "@jam/engine";
import type { Fact, PatternTerm, Term } from "./db";

export interface FactFilter {
  /** Only facts in this partition; omit for every partition, "" for global facts. */
  scope?: string;
  /** Literal terms narrow the slice (`["issue", _, "project"]`); wildcards and bindings match anything. Facts shorter than the pattern never match. */
  pattern?: PatternTerm[];
}

export interface CompiledFilter {
  /** Stable id derived from the filter's contents. */
  id: string;
  filter: FactFilter;
  /** Whether a fact in `scope` belongs to this filter; omit `scope` to ask whether any scope could. */
  matches(terms: readonly Term[], scope?: string): boolean;
}

export function compileFilter(filter: FactFilter = {}): CompiledFilter {
  const literals: Array<[number, Term]> = [];
  (filter.pattern ?? []).forEach((term, i) => {
    if (term === _ || (typeof term === "object" && term !== null)) return;
    literals.push([i, term]);
  });
  const normalized: FactFilter = {};
  if (filter.scope !== undefined) normalized.scope = filter.scope;
  if (literals.length > 0) {
    const pattern: PatternTerm[] = new Array(filter.pattern!.length).fill(_);
    for (const [i, term] of literals) pattern[i] = term;
    normalized.pattern = pattern;
  }
  const minLength = filter.pattern?.length ?? 0;
  return {
    id: `f_${hash(serializeFilter(normalized))}`,
    filter: normalized,
    matches: (terms, scope) =>
      (filter.scope === undefined || scope === undefined || scope === filter.scope) &&
      terms.length >= minLength &&
      literals.every(([i, term]) => terms[i] === term),
  };
}

/** Wire form of a filter: wildcards become `null`. */
export function serializeFilter(filter: FactFilter): string {
  return JSON.stringify({
    scope: filter.scope,
    pattern: filter.pattern?.map((t) => (t === _ || (typeof t === "object" && t !== null) ? null : t)),
  });
}

export function parseFilter(input: unknown): FactFilter {
  if (typeof input !== "object" || input === null) throw new Error("filter must be an object");
  const raw = input as { scope?: unknown; pattern?: unknown };
  const filter: FactFilter = {};
  if (raw.scope !== undefined) {
    if (typeof raw.scope !== "string") throw new Error("filter.scope must be a string");
    filter.scope = raw.scope;
  }
  if (raw.pattern !== undefined) {
    if (!Array.isArray(raw.pattern)) throw new Error("filter.pattern must be an array");
    filter.pattern = raw.pattern.map((t) => (t === null ? _ : parseTerm(t)));
  }
  return filter;
}

/** cyrb53 — a small, stable string hash. */
function hash(input: string): string {
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

// --- Wire protocol ---

export type SyncOp = "upsert" | "delete" | "replace";

export interface SyncChange {
  op: SyncOp;
  terms: Fact;
  scope: string;
}

export type ClientMessage =
  | { type: "subscribe"; id: string; filter: unknown; since?: number }
  | { type: "unsubscribe"; id: string }
  | { type: "push"; id: number; changes: SyncChange[] };

export type ServerMessage =
  | { type: "hello"; seq: number; heartbeat: number }
  | { type: "ping" }
  | { type: "snapshot"; id: string; seq: number; facts: Array<[Fact, string]> }
  | { type: "replay"; id: string; seq: number; changes: SyncChange[] }
  | { type: "changes"; seq: number; changes: SyncChange[] }
  | { type: "ack"; id: number; seq: number }
  | { type: "reject"; id: number; error: string };

export function parseTerm(value: unknown): Term {
  const kind = typeof value;
  if (kind === "string" || kind === "number" || kind === "boolean") return value as Term;
  throw new Error(`bad term ${JSON.stringify(value)}`);
}

export function parseFact(value: unknown): Fact {
  if (!Array.isArray(value) || value.length === 0) throw new Error("fact must be a non-empty array");
  return value.map(parseTerm);
}

export function parseChanges(value: unknown): SyncChange[] {
  if (!Array.isArray(value)) throw new Error("changes must be an array");
  return value.map((raw) => {
    if (typeof raw !== "object" || raw === null) throw new Error("change must be an object");
    const { op, terms, scope } = raw as { op?: unknown; terms?: unknown; scope?: unknown };
    if (op !== "upsert" && op !== "delete" && op !== "replace") throw new Error(`bad op ${JSON.stringify(op)}`);
    if (typeof scope !== "string") throw new Error("change.scope must be a string");
    return { op, terms: parseFact(terms), scope };
  });
}
