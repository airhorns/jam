// Renderer — two-phase reactive pipeline over the unified fact database.
//
// Phase 1 (expand + emit): a reaction whose tracked data function expands
//   the whole component tree (executing every component, so when() reads in
//   nested components are tracked) and whose effect writes the expanded tree
//   into the fact database as VDOM claims.
//
// Phase 2 (patch): autorun reads db.facts directly and reconciles ALL
//   claims (component + external) into real DOM.

import { autorun, reaction, runInAction } from "mobx";
import { db, type Term } from "./db";
import { type VChild, type ElementRef, expandRoot, emitExpanded } from "./jsx";

// Props applied as element properties (so form state updates live).
const DOM_PROPERTIES = new Set([
  "checked", "value", "disabled", "selected", "indeterminate", "readOnly", "multiple", "open",
  "defaultValue", "defaultChecked",
]);

// Properties whose reflected attribute has a different name.
const PROPERTY_ATTRIBUTES: Record<string, string> = {
  defaultValue: "value",
  defaultChecked: "checked",
};

// True boolean attributes: `false` removes them, `true` sets them empty.
// Everything else (aria-*, draggable, contenteditable…) stringifies booleans.
const BOOLEAN_ATTRIBUTES = new Set([
  "checked", "selected", "disabled", "readonly", "required", "multiple", "hidden",
  "open", "autofocus", "inert", "autoplay", "controls", "loop", "muted", "default",
  "defer", "async", "novalidate", "formnovalidate", "allowfullscreen", "itemscope",
  "nomodule", "playsinline", "reversed", "ismap",
]);

const ATTRIBUTE_ALIASES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  tabIndex: "tabindex",
  readOnly: "readonly",
  autoFocus: "autofocus",
  autoComplete: "autocomplete",
  autoCorrect: "autocorrect",
  autoCapitalize: "autocapitalize",
  spellCheck: "spellcheck",
  contentEditable: "contenteditable",
  crossOrigin: "crossorigin",
  srcSet: "srcset",
  maxLength: "maxlength",
  minLength: "minlength",
  enterKeyHint: "enterkeyhint",
  inputMode: "inputmode",
  colSpan: "colspan",
  rowSpan: "rowspan",
  noValidate: "novalidate",
  acceptCharset: "accept-charset",
  httpEquiv: "http-equiv",
  dateTime: "datetime",
  encType: "enctype",
  formAction: "formaction",
  frameBorder: "frameborder",
  allowFullScreen: "allowfullscreen",
  referrerPolicy: "referrerpolicy",
  viewBox: "viewBox",
};

const SVG_NS = "http://www.w3.org/2000/svg";

// HTML lowercases attribute names on set, so match that or the cleanup sweep
// below would strip every camelCase attribute it just wrote. SVG is case-sensitive.
function attributeName(key: string, svg: boolean): string {
  const name = ATTRIBUTE_ALIASES[key] ?? key;
  return svg ? name : name.toLowerCase();
}

/**
 * Mount a component tree into a DOM container.
 * Returns a disposer to unmount.
 */
export function mount(rootVnode: VChild, container: HTMLElement): () => void {
  const mountOwner = db.createChildOwner(db.getCurrentOwnerId(), "mount");

  // --- Phase 1: Expand and emit VDOM claims from component tree ---
  const emitDisposer = reaction(
    () => expandRoot(rootVnode, "dom"),
    (nodes) => {
      // Writes to db.facts but doesn't re-trigger the data function because
      // reaction separates tracking from effects. Revoking the mount owner
      // drops the previous render's claims.
      runInAction(() => {
        db.revokeOwner(mountOwner);
        db.withOwnerScope(mountOwner, () => emitExpanded(nodes, "dom", 0));
      });
    },
    // Always fire effect when data function re-runs — expanded trees are new
    // objects each time so reference equality would always trigger anyway.
    { fireImmediately: true, equals: () => false },
  );

  // --- Phase 2: Patch DOM from all VDOM claims ---
  const managed = new Map<string, Element | Text>();
  const pendingFocus: HTMLElement[] = [];
  const mountedRefs = new Map<string, { element: Element; refKey: string; callback: ElementRef }>();

  function releaseElementRef(entityId: string) {
    const mounted = mountedRefs.get(entityId);
    if (!mounted) return;
    mounted.callback(null);
    mountedRefs.delete(entityId);
  }

  const patchDisposer = autorun(() => {
    const allFacts = Array.from(db.facts.values());

    const tags = new Map<string, string>();
    const classes = new Map<string, Set<string>>();
    const props = new Map<string, Map<string, Term>>();
    const texts = new Map<string, string>();
    const handlers = new Map<string, Map<string, string>>();
    const elementRefs = new Map<string, string>();
    const childModes = new Map<string, string>();
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
      } else if (attr === "elementRef") {
        elementRefs.set(entity, String(fact[2]));
      } else if (attr === "childMode") {
        childModes.set(entity, String(fact[2]));
      } else if (attr === "child") {
        if (!children.has(entity)) children.set(entity, []);
        children.get(entity)!.push([fact[2] as number, String(fact[3])]);
      }
    }

    for (const [, list] of children) list.sort((a, b) => a[0] - b[0]);

    const visited = new Set<string>();

    function syncElementRef(entityId: string, el: Element) {
      const refKey = elementRefs.get(entityId);
      const callback = refKey ? (db.getRef(refKey) as ElementRef | undefined) : undefined;
      if (!refKey || !callback) {
        releaseElementRef(entityId);
        return;
      }
      const mounted = mountedRefs.get(entityId);
      if (mounted?.refKey === refKey && mounted.element === el) return;
      if (mounted) mounted.callback(null);
      callback(el as HTMLElement);
      mountedRefs.set(entityId, { element: el, refKey, callback });
    }

    function reconcile(entityId: string, inSvg = false): Node | null {
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

      const svg = inSvg || tag === "svg";
      let el = managed.get(entityId);
      let created = false;
      if (!(el instanceof Element) || el.tagName.toLowerCase() !== tag.toLowerCase()) {
        el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
        managed.set(entityId, el);
        created = true;
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
          const attr = PROPERTY_ATTRIBUTES[key] ?? attributeName(key, svg);
          if (DOM_PROPERTIES.has(key) && key in el) {
            if ((el as any)[key] !== value) (el as any)[key] = value;
            // Keep any attribute the property reflects to (e.g. a hidden input's value).
            activeAttrs.add(attr);
            // Reflect boolean state as an attribute too so CSS selectors and
            // tests can see it.
            if (typeof value === "boolean") {
              if (value) {
                if (!el.hasAttribute(attr)) el.setAttribute(attr, "");
              } else if (el.hasAttribute(attr)) {
                el.removeAttribute(attr);
              }
            }
            continue;
          }
          if (typeof value === "boolean" && BOOLEAN_ATTRIBUTES.has(attr)) {
            if (value) {
              activeAttrs.add(attr);
              if (!el.hasAttribute(attr)) el.setAttribute(attr, "");
              if (created && attr === "autofocus" && el instanceof HTMLElement) pendingFocus.push(el);
            } else if (el.hasAttribute(attr)) {
              el.removeAttribute(attr);
            }
            continue;
          }
          activeAttrs.add(attr);
          const strVal = String(value);
          if (el.getAttribute(attr) !== strVal) el.setAttribute(attr, strVal);
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

      syncElementRef(entityId, el);

      // Imperative hosts own their subtree; leave whatever the callback put there.
      if (childModes.get(entityId) === "imperative") return el;

      const childList = children.get(entityId) ?? [];
      const childNodes: Node[] = [];
      for (const [, childId] of childList) {
        const node = reconcile(childId, svg && tag !== "foreignObject");
        if (node) childNodes.push(node);
      }
      // Drop stale nodes first so surviving siblings keep their place instead of
      // being re-inserted (which would restart their CSS animations).
      const keep = new Set(childNodes);
      for (let i = el.childNodes.length - 1; i >= 0; i--) {
        if (!keep.has(el.childNodes[i])) el.removeChild(el.childNodes[i]);
      }
      for (let i = 0; i < childNodes.length; i++) {
        if (el.childNodes[i] !== childNodes[i]) {
          el.insertBefore(childNodes[i], el.childNodes[i] || null);
        }
      }

      return el;
    }

    const rootChildren = children.get("dom") ?? [];
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
      if (!visited.has(id)) {
        releaseElementRef(id);
        managed.delete(id);
      }
    }

    // Focus after the tree is attached so focus() actually takes effect.
    while (pendingFocus.length > 0) {
      const el = pendingFocus.shift()!;
      if (el.isConnected) el.focus();
    }
  });

  return () => {
    emitDisposer();
    runInAction(() => db.revokeOwner(mountOwner));
    patchDisposer();
    for (const id of Array.from(mountedRefs.keys())) releaseElementRef(id);
  };
}
