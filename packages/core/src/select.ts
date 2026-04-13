// select() — CSS selector queries against VDOM facts.
//
// Returns a reactive computed of VdomElement objects matching the selector.
// Reads db.facts directly (tracks the map), uses structural comparison
// so downstream observers only re-run when the matching remember changes.
//
// Supported selectors:
//   tag:        div, button, span
//   class:      .connection-bar
//   id:         #detail
//   attribute:  [data-testid="sidebar"]
//   compound:   div.message.fg-blue
//   descendant: .sidebar .session-row
//   child:      .sidebar > button

import { computed, comparer } from "mobx";
import { db, type Term } from "./db";

// --- Public types ---

export interface VdomElement {
  id: string;
  tag: string;
  classes: string[];
  props: Record<string, Term>;
}

// --- Selector AST ---

interface SimpleSelector {
  tag?: string;
  classes: string[];
  id?: string;
  attrs: { name: string; value: string }[];
}

type Combinator = " " | ">";

interface SelectorSegment {
  simple: SimpleSelector;
  combinator?: Combinator; // combinator BEFORE this segment (undefined for the first)
}

// --- Parser ---

function parseSelector(input: string): SelectorSegment[] {
  const segments: SelectorSegment[] = [];
  let i = 0;
  const len = input.length;

  function skipWs() {
    while (i < len && input[i] === " ") i++;
  }

  function readIdent(): string {
    const start = i;
    while (i < len && /[\w-]/.test(input[i])) i++;
    return input.slice(start, i);
  }

  while (i < len) {
    skipWs();
    if (i >= len) break;

    // Determine combinator before this segment
    let combinator: Combinator | undefined;
    if (segments.length > 0) {
      // We already consumed whitespace. Check if there's a > combinator
      if (input[i] === ">") {
        combinator = ">";
        i++;
        skipWs();
      } else {
        combinator = " "; // descendant
      }
    }

    // Parse simple selector
    const simple: SimpleSelector = { classes: [], attrs: [] };

    while (i < len && input[i] !== " " && input[i] !== ">") {
      if (input[i] === ".") {
        i++; // skip dot
        simple.classes.push(readIdent());
      } else if (input[i] === "#") {
        i++; // skip hash
        simple.id = readIdent();
      } else if (input[i] === "[") {
        i++; // skip [
        const name = readIdent();
        let value = "";
        if (i < len && input[i] === "=") {
          i++; // skip =
          if (input[i] === '"' || input[i] === "'") {
            const quote = input[i];
            i++; // skip opening quote
            const vstart = i;
            while (i < len && input[i] !== quote) i++;
            value = input.slice(vstart, i);
            i++; // skip closing quote
          } else {
            value = readIdent();
          }
        }
        if (i < len && input[i] === "]") i++; // skip ]
        simple.attrs.push({ name, value });
      } else if (/[\w-]/.test(input[i])) {
        simple.tag = readIdent();
      } else {
        break;
      }
    }

    segments.push({ simple, combinator });
  }

  return segments;
}

// --- VDOM tree builder (shared logic) ---

export interface VdomIndex {
  tags: Map<string, string>;
  classes: Map<string, Set<string>>;
  props: Map<string, Map<string, Term>>;
  children: Map<string, string[]>; // parent → ordered child IDs
  parents: Map<string, string>; // child → parent
}

export function buildVdomIndex(): VdomIndex {
  const tags = new Map<string, string>();
  const classes = new Map<string, Set<string>>();
  const props = new Map<string, Map<string, Term>>();
  const childEntries = new Map<string, [number, string][]>();
  const parents = new Map<string, string>();

  for (const fact of db.facts.values()) {
    const entity = String(fact[0]);
    const attr = fact[1];

    if (attr === "tag") {
      tags.set(entity, String(fact[2]));
    } else if (attr === "class") {
      if (!classes.has(entity)) classes.set(entity, new Set());
      classes.get(entity)!.add(String(fact[2]));
    } else if (attr === "prop") {
      if (!props.has(entity)) props.set(entity, new Map());
      props.get(entity)!.set(String(fact[2]), fact[3]);
    } else if (attr === "child") {
      const parent = entity;
      const index = fact[2] as number;
      const childId = String(fact[3]);
      if (!childEntries.has(parent)) childEntries.set(parent, []);
      childEntries.get(parent)!.push([index, childId]);
      parents.set(childId, parent);
    }
  }

  // Sort and flatten children
  const children = new Map<string, string[]>();
  for (const [parent, entries] of childEntries) {
    entries.sort((a, b) => a[0] - b[0]);
    children.set(
      parent,
      entries.map(([, id]) => id),
    );
  }

  return { tags, classes, props, children, parents };
}

// --- Matcher ---

function matchesSimple(
  entityId: string,
  sel: SimpleSelector,
  idx: VdomIndex,
): boolean {
  if (sel.tag) {
    const tag = idx.tags.get(entityId);
    if (tag !== sel.tag) return false;
  }
  if (sel.id) {
    const elProps = idx.props.get(entityId);
    if (elProps?.get("id") !== sel.id) return false;
  }
  for (const cls of sel.classes) {
    const elClasses = idx.classes.get(entityId);
    if (!elClasses?.has(cls)) return false;
  }
  for (const attr of sel.attrs) {
    const elProps = idx.props.get(entityId);
    if (String(elProps?.get(attr.name) ?? "") !== attr.value) return false;
  }
  return true;
}

function isDescendantOf(
  entityId: string,
  ancestorId: string,
  idx: VdomIndex,
): boolean {
  let current = idx.parents.get(entityId);
  while (current) {
    if (current === ancestorId) return true;
    current = idx.parents.get(current);
  }
  return false;
}

function isChildOf(
  entityId: string,
  parentId: string,
  idx: VdomIndex,
): boolean {
  return idx.parents.get(entityId) === parentId;
}

function matchSelector(segments: SelectorSegment[], idx: VdomIndex): string[] {
  if (segments.length === 0) return [];

  // Start with all entities matching the first segment
  let candidates: string[] = [];
  for (const entityId of idx.tags.keys()) {
    if (matchesSimple(entityId, segments[0].simple, idx)) {
      candidates.push(entityId);
    }
  }

  // Apply each subsequent segment as a filter
  for (let i = 1; i < segments.length; i++) {
    const { simple, combinator } = segments[i];
    const next: string[] = [];

    // Find all entities matching this segment's simple selector
    const matching: string[] = [];
    for (const entityId of idx.tags.keys()) {
      if (matchesSimple(entityId, simple, idx)) {
        matching.push(entityId);
      }
    }

    // Filter by combinator relationship with candidates
    for (const entityId of matching) {
      for (const ancestor of candidates) {
        if (combinator === ">" && isChildOf(entityId, ancestor, idx)) {
          next.push(entityId);
          break;
        } else if (
          combinator === " " &&
          isDescendantOf(entityId, ancestor, idx)
        ) {
          next.push(entityId);
          break;
        }
      }
    }

    candidates = next;
  }

  return candidates;
}

function toVdomElement(entityId: string, idx: VdomIndex): VdomElement {
  return {
    id: entityId,
    tag: idx.tags.get(entityId) ?? "",
    classes: Array.from(idx.classes.get(entityId) ?? []).sort(),
    props: Object.fromEntries(idx.props.get(entityId) ?? []),
  };
}

// --- Public API ---

// Cache parsed selectors → MobX computeds (so repeated select() calls reuse the same computed)
const selectorCache = new Map<string, { get(): VdomElement[] }>();

/** Clear the selector cache (called by db.clear()). */
export function clearSelectCache(): void {
  selectorCache.clear();
}

/**
 * Reactive CSS selector query against VDOM facts.
 * Returns VdomElement[] matching the selector. When called inside
 * a MobX tracking context, establishes dependency on the fact map
 * so the context re-runs when VDOM facts change.
 */
export function select(cssSelector: string): VdomElement[] {
  let cached = selectorCache.get(cssSelector);
  if (!cached) {
    const segments = parseSelector(cssSelector);
    cached = computed(
      () => {
        // Read db.facts.values() — tracks the full map
        const idx = buildVdomIndex();
        const entityIds = matchSelector(segments, idx);
        return entityIds.map((id) => toVdomElement(id, idx));
      },
      { equals: comparer.structural },
    );
    selectorCache.set(cssSelector, cached);
  }
  return cached.get();
}
