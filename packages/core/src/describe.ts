// describeUI() — the rendered tree as an accessibility outline, read from the
// VDOM facts the renderer already emits (tags, attributes, text, children) plus
// the component structure of the current mount. Nothing extra is written for
// it; it is what a screen reader would be told, with entity ids so that
// drive()/press() can act on what it names.

import type { Term } from "./db";
import { buildVdomIndex, type VdomIndex } from "./select";
import { componentChain, componentInfo, entityId, nodeFor } from "./mounts";
import { drivenComponents, driversFor } from "./drive";

export interface UINode {
  /** Entity id, for `drive()`, `press()` and `describeUI({ root })`. Absent on text. */
  id?: string;
  /**
   * ARIA role, explicit or implied by the tag; `text` for a text run, `generic`
   * for an unnamed container, `hidden` for a drivable component that currently
   * renders nothing visible (a closed sheet or toast).
   */
  role: string;
  name?: string;
  description?: string;
  /** The component(s) whose first rendered element this is, outermost first, joined with `/` when they share an id. */
  component?: string;
  /** ARIA/DOM state: expanded, checked, selected, pressed, disabled, value, level, href… */
  state: Record<string, Term>;
  /** The nearest component whose state `drive()` can set, with current values, reported once at its first element. */
  drive?: { id: string; component?: string; keys: Record<string, Term | undefined> };
  children: UINode[];
}

export interface DescribeOptions {
  /** Entity id to describe from — an element, or a component whose elements are described; defaults to the whole mount. */
  root?: string;
  /** Keep only interactive and drivable nodes, headings and the structure around them. */
  interactive?: boolean;
}

const IMPLICIT_ROLES: Record<string, string> = {
  button: "button",
  textarea: "textbox",
  select: "combobox",
  option: "option",
  h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
  ul: "list", ol: "list", li: "listitem",
  nav: "navigation", main: "main", aside: "complementary",
  form: "form", article: "article", dialog: "dialog", fieldset: "group", details: "group", summary: "button",
  img: "img", table: "table", thead: "rowgroup", tbody: "rowgroup", tfoot: "rowgroup",
  tr: "row", th: "columnheader", td: "cell", hr: "separator",
  progress: "progressbar", output: "status", meter: "meter", menu: "list",
};

/** Sectioning content, inside which `header` and `footer` stop being page landmarks. */
const SECTIONING_TAGS = new Set(["article", "aside", "main", "nav", "section"]);
const SECTIONING_ROLES = new Set(["article", "complementary", "main", "navigation", "region"]);

const INPUT_ROLES: Record<string, string> = {
  checkbox: "checkbox", radio: "radio", range: "slider", number: "spinbutton", search: "searchbox",
  submit: "button", button: "button", reset: "button", image: "button",
};

const NAME_FROM_CONTENT = new Set([
  "button", "link", "heading", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "treeitem",
  "cell", "columnheader", "rowheader", "gridcell", "checkbox", "radio", "switch", "tooltip", "summary",
]);

/** Roles whose descendants ARIA hides from assistive technology; only misplaced controls inside them are still reported. */
const CHILDREN_PRESENTATIONAL = new Set([
  "button", "checkbox", "img", "math", "menuitemcheckbox", "menuitemradio", "meter", "option", "progressbar",
  "radio", "scrollbar", "separator", "slider", "switch", "tab",
]);

const INTERACTIVE = new Set([
  "button", "link", "textbox", "searchbox", "checkbox", "radio", "switch", "slider", "spinbutton", "combobox",
  "listbox", "option", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "treeitem", "scrollbar",
]);

const ARIA_STATE: Record<string, string> = {
  "aria-expanded": "expanded",
  "aria-checked": "checked",
  "aria-selected": "selected",
  "aria-pressed": "pressed",
  "aria-current": "current",
  "aria-invalid": "invalid",
  "aria-modal": "modal",
  "aria-haspopup": "haspopup",
  "aria-level": "level",
  "aria-valuenow": "value",
  "aria-valuetext": "valuetext",
  "aria-valuemin": "min",
  "aria-valuemax": "max",
  "aria-orientation": "orientation",
  "aria-live": "live",
  "aria-busy": "busy",
  "aria-multiselectable": "multiselectable",
};

function parseTerm(value: Term): Term {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

function isTruthyAttribute(value: Term | undefined): boolean {
  return value !== undefined && value !== false && value !== "false";
}

const whitespace = (s: string) => s.replace(/\s+/g, " ").trim();

class Describer {
  private labelsFor = new Map<string, string[]>();
  private byDomId = new Map<string, string>();
  private seenComponents = new Set<string>();

  constructor(private idx: VdomIndex) {
    for (const [el, props] of idx.props) {
      const domId = props.get("id");
      if (domId !== undefined) this.byDomId.set(String(domId), el);
      const target = props.get("for") ?? props.get("htmlFor");
      if (idx.tags.get(el) === "label" && target !== undefined) {
        const list = this.labelsFor.get(String(target)) ?? [];
        list.push(el);
        this.labelsFor.set(String(target), list);
      }
    }
  }

  private prop(el: string, name: string): Term | undefined {
    return this.idx.props.get(el)?.get(name);
  }

  private hidden(el: string): boolean {
    const props = this.idx.props.get(el);
    if (!props) return false;
    if (props.get("aria-hidden") === "true" || props.get("aria-hidden") === true) return true;
    if (isTruthyAttribute(props.get("hidden"))) return true;
    if (props.get("type") === "hidden") return true;
    const style = props.get("style");
    return typeof style === "string" && /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)/.test(style);
  }

  /** Text of a subtree, as name-from-content computes it: text runs plus descendants' labels, skipping hidden parts. */
  textContent(el: string): string {
    const text = this.idx.texts.get(el);
    if (text !== undefined) return text;
    if (this.hidden(el)) return "";
    const label = this.prop(el, "aria-label") ?? this.prop(el, "alt");
    if (label !== undefined && String(label)) return String(label);
    return (this.idx.children.get(el) ?? []).map((child) => this.textContent(child)).join(" ");
  }

  private referencedText(refs: Term | undefined): string | undefined {
    if (refs === undefined) return undefined;
    const text = String(refs)
      .split(/\s+/)
      .filter(Boolean)
      .map((ref) => {
        const el = this.byDomId.get(ref);
        return el ? this.textContent(el) : "";
      })
      .join(" ");
    return whitespace(text) || undefined;
  }

  private role(el: string): string {
    const tag = this.idx.tags.get(el) ?? "";
    const explicit = this.prop(el, "role");
    if (explicit !== undefined) return String(explicit).split(/\s+/)[0];
    if (tag === "input") return INPUT_ROLES[String(this.prop(el, "type") ?? "text")] ?? "textbox";
    if (tag === "a") return this.prop(el, "href") !== undefined ? "link" : "generic";
    if (tag === "section") return this.prop(el, "aria-label") !== undefined || this.prop(el, "aria-labelledby") !== undefined ? "region" : "generic";
    if (tag === "select") return isTruthyAttribute(this.prop(el, "multiple")) ? "listbox" : "combobox";
    if (tag === "svg") return this.prop(el, "aria-label") !== undefined ? "img" : "generic";
    if (tag === "header") return this.inSectioningContent(el) ? "generic" : "banner";
    if (tag === "footer") return this.inSectioningContent(el) ? "generic" : "contentinfo";
    return IMPLICIT_ROLES[tag] ?? "generic";
  }

  private inSectioningContent(el: string): boolean {
    for (let parent = this.idx.parents.get(el); parent; parent = this.idx.parents.get(parent)) {
      const role = this.prop(parent, "role");
      if (role !== undefined ? SECTIONING_ROLES.has(String(role)) : SECTIONING_TAGS.has(this.idx.tags.get(parent) ?? "")) return true;
    }
    return false;
  }

  private name(el: string, role: string): string | undefined {
    const labelled = this.referencedText(this.prop(el, "aria-labelledby"));
    if (labelled) return labelled;
    const label = this.prop(el, "aria-label");
    if (label !== undefined && whitespace(String(label))) return whitespace(String(label));
    const domId = this.prop(el, "id");
    const labels = domId !== undefined ? this.labelsFor.get(String(domId)) : undefined;
    if (labels?.length) {
      const text = whitespace(labels.map((l) => this.textContent(l)).join(" "));
      if (text) return text;
    }
    for (let parent = this.idx.parents.get(el); parent; parent = this.idx.parents.get(parent)) {
      if (this.idx.tags.get(parent) === "label") {
        const text = whitespace(this.textContent(parent));
        if (text) return text;
        break;
      }
    }
    if (NAME_FROM_CONTENT.has(role)) {
      const text = whitespace(this.textContent(el));
      if (text) return text;
    }
    for (const attr of ["title", "placeholder", "alt"]) {
      const value = this.prop(el, attr);
      if (value !== undefined && whitespace(String(value))) return whitespace(String(value));
    }
    if (this.idx.tags.get(el) === "input" && role === "button") {
      const value = this.prop(el, "value");
      if (value !== undefined) return whitespace(String(value)) || undefined;
    }
    return undefined;
  }

  private state(el: string, role: string): Record<string, Term> {
    const state: Record<string, Term> = {};
    const props = this.idx.props.get(el);
    const tag = this.idx.tags.get(el) ?? "";
    if (props) {
      for (const [attr, key] of Object.entries(ARIA_STATE)) {
        const value = props.get(attr);
        if (value !== undefined) state[key] = parseTerm(value);
      }
      if (props.get("aria-disabled") === "true" || isTruthyAttribute(props.get("disabled"))) state.disabled = true;
      if (props.get("aria-required") === "true" || isTruthyAttribute(props.get("required"))) state.required = true;
      if (props.get("aria-readonly") === "true" || isTruthyAttribute(props.get("readonly") ?? props.get("readOnly"))) state.readonly = true;
      if (role === "link" && props.get("href") !== undefined) state.href = props.get("href")!;
      if (role === "textbox" || role === "searchbox" || role === "spinbutton") {
        const placeholder = props.get("placeholder");
        if (placeholder !== undefined) state.placeholder = placeholder;
      }
    }
    if (role === "heading" && state.level === undefined && /^h[1-6]$/.test(tag)) state.level = Number(tag[1]);
    if (role === "combobox" && tag !== "input" && tag !== "select") {
      const shown = whitespace(this.textContent(el));
      if (shown) state.value = shown;
    }
    const node = nodeFor(el) as (Element & { value?: string; checked?: boolean }) | undefined;
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const type = props?.get("type");
      if (type === "checkbox" || type === "radio") {
        if (state.checked === undefined) state.checked = node?.checked ?? isTruthyAttribute(props?.get("checked"));
      } else if (state.value === undefined) {
        const live = node && "value" in node ? node.value : undefined;
        state.value = live ?? props?.get("value") ?? props?.get("defaultValue") ?? "";
      }
    }
    return state;
  }

  /** Whether a `label` names a control, so its text is reported as that control's name rather than as content. */
  private labelsControl(el: string): boolean {
    const target = this.prop(el, "for") ?? this.prop(el, "htmlFor");
    if (target !== undefined) return this.byDomId.has(String(target));
    const hasControl = (id: string): boolean => {
      const tag = this.idx.tags.get(id);
      if (tag === "input" || tag === "textarea" || tag === "select" || tag === "button" || tag === "meter" || tag === "progress" || tag === "output") return true;
      return (this.idx.children.get(id) ?? []).some(hasControl);
    };
    return hasControl(el);
  }

  /** Components this element is the first rendered element of, innermost first. */
  private newComponents(el: string): string[] {
    const fresh: string[] = [];
    for (const componentId of componentChain(el)) {
      if (this.seenComponents.has(componentId)) break;
      this.seenComponents.add(componentId);
      fresh.push(componentId);
    }
    return fresh;
  }

  describe(el: string): UINode[] {
    const tag = this.idx.tags.get(el);
    if (tag === undefined) return [];
    if (tag === "__text") {
      const text = whitespace(this.idx.texts.get(el) ?? "");
      return text ? [{ role: "text", name: text, state: {}, children: [] }] : [];
    }
    if (this.hidden(el)) return [];

    const role = this.role(el);
    const fresh = this.newComponents(el);
    const node: UINode = { id: el, role, state: this.state(el, role), children: [] };
    const name = this.name(el, role);
    if (name !== undefined) node.name = name;
    const description = this.referencedText(this.prop(el, "aria-describedby"));
    if (description) node.description = description;
    if (this.idx.handlers.get(el)?.has("click") && !INTERACTIVE.has(role)) node.state.clickable = true;
    const semantic = fresh.map((id) => componentInfo(id)).filter((info) => info && !info.presentational);
    if (semantic.length) node.component = semantic[semantic.length - 1]!.name;
    for (const componentId of fresh) {
      const found = driversFor(componentId);
      if (found && found.id === componentId) {
        node.drive = { id: componentId, component: componentInfo(componentId)?.name, keys: found.keys };
        break;
      }
    }

    for (const child of this.idx.children.get(el) ?? []) node.children.push(...this.describe(child));
    if (CHILDREN_PRESENTATIONAL.has(role)) node.children = controlsWithin(node.children);
    else if ((NAME_FROM_CONTENT.has(role) && node.name !== undefined) || (tag === "label" && this.labelsControl(el))) {
      node.children = withoutText(node.children);
    }
    if (role === "generic" && node.name === undefined && !node.component && !node.drive && !node.state.clickable) return node.children;
    return [node];
  }

  /**
   * Describe from an element, or from a component: the topmost elements it
   * renders (portalled ones included), or its hidden node when it renders
   * nothing. Components begun before the root count as seen, so the root is
   * labelled as the full outline labels it.
   */
  describeFrom(root: string): UINode[] {
    const tops = this.idx.tags.has(root) ? [root] : this.elementsOf(root);
    if (tops.length === 0) {
      const found = driversFor(root);
      return found && found.id === root ? [this.hiddenNode(root, found.keys)] : [];
    }
    this.markSeenBefore(tops[0]!);
    return tops.flatMap((el) => this.describe(el));
  }

  /** The elements rendered by `componentId` (or components inside it) that have no such element above them, in document order. */
  private elementsOf(componentId: string): string[] {
    const tops: string[] = [];
    const visit = (el: string) => {
      if (componentChain(el).includes(componentId)) tops.push(el);
      else for (const child of this.idx.children.get(el) ?? []) visit(child);
    };
    for (const top of this.idx.children.get("dom") ?? []) visit(top);
    return tops;
  }

  private markSeenBefore(root: string): void {
    const visit = (el: string): boolean => {
      if (el === root) return true;
      for (const componentId of componentChain(el)) this.seenComponents.add(componentId);
      return (this.idx.children.get(el) ?? []).some(visit);
    };
    (this.idx.children.get("dom") ?? []).some(visit);
  }

  private hiddenNode(componentId: string, keys: Record<string, Term | undefined>): UINode {
    const component = componentInfo(componentId)?.name;
    return { id: componentId, role: "hidden", component, state: {}, drive: { id: componentId, component, keys }, children: [] };
  }

  /** Drivable components no described element belongs to, so their state stays readable and settable. */
  unseenDrivable(): UINode[] {
    const nodes: UINode[] = [];
    for (const componentId of drivenComponents()) {
      if (this.seenComponents.has(componentId)) continue;
      const found = driversFor(componentId);
      if (found && found.id === componentId) nodes.push(this.hiddenNode(componentId, found.keys));
    }
    return nodes;
  }
}

/** Interactive or drivable nodes anywhere under `nodes`, lifted out of the presentational structure around them. */
function controlsWithin(nodes: UINode[]): UINode[] {
  return nodes.flatMap((node) => (INTERACTIVE.has(node.role) || node.drive ? [node] : controlsWithin(node.children)));
}

/** `nodes` without the text runs (and the unnamed containers that only held text) an element's name already spells out. */
function withoutText(nodes: UINode[]): UINode[] {
  const kept: UINode[] = [];
  for (const node of nodes) {
    if (node.role === "text") continue;
    const children = withoutText(node.children);
    if (node.role === "generic" && node.name === undefined && !node.drive && !node.state.clickable && children.length === 0) continue;
    kept.push({ ...node, children });
  }
  return kept;
}

function onlyInteractive(nodes: UINode[]): UINode[] {
  const kept: UINode[] = [];
  for (const node of nodes) {
    const children = onlyInteractive(node.children);
    if (INTERACTIVE.has(node.role) || node.drive || node.state.clickable || node.role === "heading" || children.length) {
      kept.push({ ...node, children });
    }
  }
  return kept;
}

/**
 * The rendered UI as a tree of named, role-bearing nodes with their state,
 * read from the VDOM facts. Unnamed containers that start no component are
 * collapsed into their parents; hidden subtrees are omitted. Drivable
 * components with nothing visible are listed last as `hidden` nodes.
 */
export function describeUI(options: DescribeOptions = {}): UINode[] {
  const idx = buildVdomIndex();
  const describer = new Describer(idx);
  let nodes: UINode[];
  if (options.root !== undefined) nodes = describer.describeFrom(entityId(options.root));
  else {
    nodes = (idx.children.get("dom") ?? []).flatMap((root) => describer.describe(root));
    nodes.push(...describer.unseenDrivable());
  }
  return options.interactive ? onlyInteractive(nodes) : nodes;
}

function formatValue(value: Term | undefined): string {
  return value === undefined ? "?" : typeof value === "string" ? JSON.stringify(value) : String(value);
}

function formatNode(node: UINode, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);
  if (node.role === "text") {
    lines.push(`${indent}text ${JSON.stringify(node.name)}`);
    return;
  }
  const parts = [node.role];
  if (node.name !== undefined) parts.push(JSON.stringify(node.name));
  if (node.id !== undefined) parts.push(`#${node.id}`);
  for (const [key, value] of Object.entries(node.state)) parts.push(`${key}=${formatValue(value)}`);
  if (node.component && !node.drive) parts.push(`<${node.component}>`);
  if (node.drive) {
    const keys = Object.entries(node.drive.keys).map(([key, value]) => `${key}=${formatValue(value)}`);
    parts.push(`(${node.drive.component ?? node.drive.id}${keys.length ? " " + keys.join(" ") : ""})`);
  }
  if (node.description) parts.push(`— ${node.description}`);
  lines.push(indent + parts.join(" "));
  for (const child of node.children) formatNode(child, depth + 1, lines);
}

/** `describeUI()` as indented text, one node per line: `role "name" #id key=value… (Component key=value…)`. */
export function outlineUI(options: DescribeOptions = {}): string {
  const lines: string[] = [];
  for (const node of describeUI(options)) formatNode(node, 0, lines);
  return lines.join("\n");
}
