// Renderer — two-phase reactive pipeline over the unified fact database.
//
// Phase 1 (emit): autorun executes the component tree. Components call
//   when().get() which reads per-pattern indexes — fine-grained tracking.
//   VDOM writes don't match app-state patterns, so no cycle.
//
// Phase 2 (patch): autorun reads db.facts directly and reconciles ALL
//   claims (component + external) into real DOM.

import { autorun, reaction, runInAction } from "mobx";
import { db, type Term } from "./db";
import { type VNode, type VChild, emitVdom } from "./jsx";

/**
 * Mount a component tree into a DOM container.
 * Returns a disposer to unmount.
 */
export function mount(rootVnode: VChild, container: HTMLElement): () => void {
  let componentKeys = new Set<string>();

  // --- Phase 1: Emit VDOM claims from component tree ---
  // Use reaction: the data function executes the component tree (tracking
  // per-pattern indexes via when()), the effect function writes VDOM claims.
  // This cleanly separates tracked reads from map writes.
  const emitDisposer = reaction(
    () => {
      // TRACKED: execute component tree. Components call when().get()
      // which reads per-pattern version counters (fine-grained tracking).
      let vnode: VChild = rootVnode;
      if (typeof rootVnode === "object" && rootVnode !== null && "__vnode" in rootVnode) {
        const rn = rootVnode as VNode;
        if (typeof rn.tag === "function") {
          vnode = (rn.tag as Function)(rn.props);
        }
      }
      return vnode;
    },
    (vnode) => {
      // EFFECT: clear old component claims and emit new ones.
      // This writes to db.facts but doesn't re-trigger the data function
      // because reaction separates tracking from effects.
      runInAction(() => {
        for (const key of componentKeys) db.facts.delete(key);
        componentKeys = new Set();

        const before = new Set(db.facts.keys());
        emitVdom(vnode, "__root", 0);

        for (const key of db.facts.keys()) {
          if (!before.has(key)) componentKeys.add(key);
        }
      });
    },
    // Always fire effect when data function re-runs — VNodes are new objects
    // each time so reference equality would always trigger anyway.
    { fireImmediately: true, equals: () => false },
  );

  // --- Phase 2: Patch DOM from all VDOM claims ---
  const managed = new Map<string, HTMLElement | Text>();

  const patchDisposer = autorun(() => {
    const allFacts = Array.from(db.facts.values());

    const tags = new Map<string, string>();
    const classes = new Map<string, Set<string>>();
    const props = new Map<string, Map<string, Term>>();
    const texts = new Map<string, string>();
    const handlers = new Map<string, Map<string, string>>();
    const children = new Map<string, [number, string][]>();

    for (const fact of allFacts) {
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
      } else if (attr === "text") {
        texts.set(entity, String(fact[2]));
      } else if (attr === "handler") {
        if (!handlers.has(entity)) handlers.set(entity, new Map());
        handlers.get(entity)!.set(String(fact[2]), String(fact[3]));
      } else if (attr === "child") {
        if (!children.has(entity)) children.set(entity, []);
        children.get(entity)!.push([fact[2] as number, String(fact[3])]);
      }
    }

    for (const [, list] of children) list.sort((a, b) => a[0] - b[0]);

    const visited = new Set<string>();

    function reconcile(entityId: string): Node | null {
      const tag = tags.get(entityId);
      if (!tag || visited.has(entityId)) return null;
      visited.add(entityId);

      if (tag === "__text") {
        const text = texts.get(entityId) ?? "";
        let node = managed.get(entityId);
        if (node instanceof Text) {
          if (node.textContent !== text) node.textContent = text;
        } else {
          node = document.createTextNode(text);
          managed.set(entityId, node);
        }
        return node;
      }

      let el = managed.get(entityId);
      if (!(el instanceof HTMLElement) || el.tagName.toLowerCase() !== tag) {
        el = document.createElement(tag);
        managed.set(entityId, el);
      }

      // Classes — merged from ALL sources
      const clsSet = classes.get(entityId);
      const clsStr = clsSet ? Array.from(clsSet).sort().join(" ") : "";
      if (el.getAttribute("class") !== clsStr) {
        if (clsStr) el.setAttribute("class", clsStr);
        else el.removeAttribute("class");
      }

      const elProps = props.get(entityId);
      const activeAttrs = new Set<string>();
      if (elProps) {
        for (const [key, value] of elProps) {
          activeAttrs.add(key);
          if (key === "checked" || key === "value" || key === "disabled") {
            if ((el as any)[key] !== value) (el as any)[key] = value;
          } else {
            const strVal = String(value);
            if (el.getAttribute(key) !== strVal) el.setAttribute(key, strVal);
          }
        }
      }
      for (let i = el.attributes.length - 1; i >= 0; i--) {
        const name = el.attributes[i].name;
        if (name === "class") continue;
        if (!activeAttrs.has(name)) el.removeAttribute(name);
      }

      const oldHandlers: Map<string, EventListener> = (el as any).__handlers ?? new Map();
      for (const [event, listener] of oldHandlers) el.removeEventListener(event, listener);
      const newHandlers = new Map<string, EventListener>();
      const elHandlers = handlers.get(entityId);
      if (elHandlers) {
        for (const [event, refKey] of elHandlers) {
          const fn = db.getRef(refKey) as EventListener;
          if (fn) {
            el.addEventListener(event, fn);
            newHandlers.set(event, fn);
          }
        }
      }
      (el as any).__handlers = newHandlers;

      const childList = children.get(entityId) ?? [];
      const childNodes: Node[] = [];
      for (const [, childId] of childList) {
        const node = reconcile(childId);
        if (node) childNodes.push(node);
      }
      for (let i = 0; i < childNodes.length; i++) {
        if (el.childNodes[i] !== childNodes[i]) {
          el.insertBefore(childNodes[i], el.childNodes[i] || null);
        }
      }
      while (el.childNodes.length > childNodes.length) {
        el.removeChild(el.lastChild!);
      }

      return el;
    }

    const rootChildren = children.get("__root") ?? [];
    const rootNodes: Node[] = [];
    for (const [, childId] of rootChildren) {
      const node = reconcile(childId);
      if (node) rootNodes.push(node);
    }
    for (let i = 0; i < rootNodes.length; i++) {
      if (container.childNodes[i] !== rootNodes[i]) {
        container.insertBefore(rootNodes[i], container.childNodes[i] || null);
      }
    }
    while (container.childNodes.length > rootNodes.length) {
      container.removeChild(container.lastChild!);
    }

    for (const id of managed.keys()) {
      if (!visited.has(id)) managed.delete(id);
    }
  });

  return () => { emitDisposer(); patchDisposer(); };
}
