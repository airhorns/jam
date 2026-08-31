// The VDOM index and select() — CSS selector queries against VDOM facts.
//
// The index is maintained incrementally from the row deltas of eight
// registered wildcard queries over `[entity, attr, …]` facts; the renderer
// reconciles the DOM from it and select() matches selectors against it.
//
// Supported selectors:
//   tag:        div, button, span
//   class:      .connection-bar
//   id:         #detail
//   attribute:  [data-testid="sidebar"]
//   compound:   div.message.fg-blue
//   descendant: .sidebar .session-row
//   child:      .sidebar > button

import { db, $, type Pattern, type Term } from "./db";
import { markDirty, recordRead, registerDrainer, type Dependency } from "./reactive";

// --- Public types ---

export interface VdomElement {
  id: string;
  tag: string;
  classes: string[];
  props: Record<string, Term>;
}

// --- VDOM index ---

const VDOM_PATTERNS: Pattern[][] = [
  [[$.e, "tag", $.v]],
  [[$.e, "class", $.v]],
  [[$.e, "prop", $.k, $.v]],
  [[$.e, "text", $.v]],
  [[$.e, "handler", $.k, $.v]],
  [[$.e, "elementRef", $.v]],
  [[$.e, "childMode", $.v]],
  [[$.e, "child", $.k, $.v]],
];

export class VdomIndex {
  readonly tags = new Map<string, string>();
  readonly classes = new Map<string, Set<string>>();
  readonly props = new Map<string, Map<string, Term>>();
  readonly texts = new Map<string, string>();
  readonly handlers = new Map<string, Map<string, string>>();
  readonly elementRefs = new Map<string, string>();
  readonly childModes = new Map<string, string>();
  readonly parents = new Map<string, string>();
  private readonly childEntries = new Map<string, Map<number, string>>();
  private readonly sorted = new Map<string, string[]>();
  version = 0;
  readonly dep: Dependency;
  private readonly watch: { dep: Dependency; dispose(): void };

  constructor() {
    this.watch = db.watch(VDOM_PATTERNS, (set, row, added) => this.apply(set, row, added));
    this.dep = this.watch.dep;
  }

  /** Subscribe the running effect to every VDOM change and bring the index up to date. */
  track(): void {
    recordRead(this.dep);
    db.drain();
  }

  children(parent: string): string[] {
    let list = this.sorted.get(parent);
    if (!list) {
      const entries = this.childEntries.get(parent);
      list = entries ? Array.from(entries.entries()).sort((a, b) => a[0] - b[0]).map(([, id]) => id) : [];
      this.sorted.set(parent, list);
    }
    return list;
  }

  private apply(set: number, row: Uint32Array, added: boolean): void {
    this.version++;
    const entity = String(db.engine.term(row[0]));
    switch (set) {
      case 0:
        return setSingle(this.tags, entity, String(db.engine.term(row[1])), added);
      case 1:
        return setMulti(this.classes, entity, String(db.engine.term(row[1])), added);
      case 2:
        return setKeyed(this.props, entity, String(db.engine.term(row[1])), db.engine.term(row[2]), added);
      case 3:
        return setSingle(this.texts, entity, String(db.engine.term(row[1])), added);
      case 4:
        return setKeyed(this.handlers, entity, String(db.engine.term(row[1])), String(db.engine.term(row[2])), added);
      case 5:
        return setSingle(this.elementRefs, entity, String(db.engine.term(row[1])), added);
      case 6:
        return setSingle(this.childModes, entity, String(db.engine.term(row[1])), added);
      case 7: {
        const index = db.engine.term(row[1]) as number;
        const child = String(db.engine.term(row[2]));
        this.sorted.delete(entity);
        if (added) {
          let entries = this.childEntries.get(entity);
          if (!entries) this.childEntries.set(entity, (entries = new Map()));
          entries.set(index, child);
          this.parents.set(child, entity);
        } else {
          const entries = this.childEntries.get(entity);
          if (entries?.get(index) === child) entries.delete(index);
          if (entries?.size === 0) this.childEntries.delete(entity);
          if (this.parents.get(child) === entity) this.parents.delete(child);
        }
        return;
      }
    }
  }

  dispose(): void {
    this.watch.dispose();
  }
}

function setSingle(map: Map<string, string>, entity: string, value: string, added: boolean): void {
  if (added) map.set(entity, value);
  else if (map.get(entity) === value) map.delete(entity);
}

function setMulti(map: Map<string, Set<string>>, entity: string, value: string, added: boolean): void {
  let values = map.get(entity);
  if (added) {
    if (!values) map.set(entity, (values = new Set()));
    values.add(value);
  } else if (values) {
    values.delete(value);
    if (values.size === 0) map.delete(entity);
  }
}

function setKeyed<V>(map: Map<string, Map<string, V>>, entity: string, key: string, value: V, added: boolean): void {
  let values = map.get(entity);
  if (added) {
    if (!values) map.set(entity, (values = new Map()));
    values.set(key, value);
  } else if (values && values.get(key) === value) {
    values.delete(key);
    if (values.size === 0) map.delete(entity);
  }
}

let vdomIndex: VdomIndex | null = null;

/** The shared VDOM index over the global db, started on first use. */
export function vdom(): VdomIndex {
  if (!vdomIndex) {
    vdomIndex = new VdomIndex();
    registerDrainer(refreshSelections);
  }
  return vdomIndex;
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

    let combinator: Combinator | undefined;
    if (segments.length > 0) {
      if (input[i] === ">") {
        combinator = ">";
        i++;
        skipWs();
      } else {
        combinator = " ";
      }
    }

    const simple: SimpleSelector = { classes: [], attrs: [] };

    while (i < len && input[i] !== " " && input[i] !== ">") {
      if (input[i] === ".") {
        i++;
        simple.classes.push(readIdent());
      } else if (input[i] === "#") {
        i++;
        simple.id = readIdent();
      } else if (input[i] === "[") {
        i++;
        const name = readIdent();
        let value = "";
        if (i < len && input[i] === "=") {
          i++;
          if (input[i] === '"' || input[i] === "'") {
            const quote = input[i];
            i++;
            const vstart = i;
            while (i < len && input[i] !== quote) i++;
            value = input.slice(vstart, i);
            i++;
          } else {
            value = readIdent();
          }
        }
        if (i < len && input[i] === "]") i++;
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

// --- Matcher ---

function matchesSimple(entityId: string, sel: SimpleSelector, idx: VdomIndex): boolean {
  if (sel.tag && idx.tags.get(entityId) !== sel.tag) return false;
  if (sel.id && idx.props.get(entityId)?.get("id") !== sel.id) return false;
  for (const cls of sel.classes) {
    if (!idx.classes.get(entityId)?.has(cls)) return false;
  }
  for (const attr of sel.attrs) {
    if (String(idx.props.get(entityId)?.get(attr.name) ?? "") !== attr.value) return false;
  }
  return true;
}

function isDescendantOf(entityId: string, ancestorId: string, idx: VdomIndex): boolean {
  let current = idx.parents.get(entityId);
  while (current) {
    if (current === ancestorId) return true;
    current = idx.parents.get(current);
  }
  return false;
}

function matchSelector(segments: SelectorSegment[], idx: VdomIndex): string[] {
  if (segments.length === 0) return [];

  let candidates: string[] = [];
  for (const entityId of idx.tags.keys()) {
    if (matchesSimple(entityId, segments[0].simple, idx)) candidates.push(entityId);
  }

  for (let i = 1; i < segments.length; i++) {
    const { simple, combinator } = segments[i];
    const next: string[] = [];
    for (const entityId of idx.tags.keys()) {
      if (!matchesSimple(entityId, simple, idx)) continue;
      for (const ancestor of candidates) {
        const related = combinator === ">" ? idx.parents.get(entityId) === ancestor : isDescendantOf(entityId, ancestor, idx);
        if (related) {
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

function sameElements(a: VdomElement[], b: VdomElement[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.tag !== y.tag || x.classes.length !== y.classes.length) return false;
    for (let c = 0; c < x.classes.length; c++) if (x.classes[c] !== y.classes[c]) return false;
    const xk = Object.keys(x.props);
    if (xk.length !== Object.keys(y.props).length) return false;
    for (const k of xk) if (x.props[k] !== y.props[k]) return false;
  }
  return true;
}

// --- Public API ---

interface Selection extends Dependency {
  segments: SelectorSegment[];
  version: number;
  result: VdomElement[];
}

const selections = new Map<string, Selection>();

function refresh(selection: Selection, idx: VdomIndex): boolean {
  if (selection.version === idx.version) return false;
  selection.version = idx.version;
  const next = matchSelector(selection.segments, idx).map((id) => toVdomElement(id, idx));
  if (sameElements(selection.result, next)) return false;
  selection.result = next;
  return true;
}

/** Re-match every observed selector after a VDOM change; only changed selections wake their effects. */
function refreshSelections(): void {
  const idx = vdomIndex!;
  for (const selection of selections.values()) {
    if (selection.subscribers.size > 0 && refresh(selection, idx)) markDirty(selection);
  }
}

/**
 * Reactive CSS selector query against VDOM facts. Returns the matching
 * elements; inside an effect the caller re-runs only when that list changes.
 */
export function select(cssSelector: string): VdomElement[] {
  const idx = vdom();
  let selection = selections.get(cssSelector);
  if (!selection) {
    selection = { segments: parseSelector(cssSelector), version: -1, result: [], subscribers: new Set() };
    selections.set(cssSelector, selection);
  }
  recordRead(selection);
  db.drain();
  refresh(selection, idx);
  return selection.result;
}
