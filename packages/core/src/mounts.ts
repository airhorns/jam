// Live mounts, so describe()/drive() can map an element id back to the
// component it renders within and to its DOM node without either being facts.

import type { ComponentInfo } from "./jsx";

export type MountRecord = {
  /** Component instances in the latest render, by id. */
  components: Map<string, ComponentInfo>;
  /** The component within whose output each element renders, by element id. */
  owners: Map<string, string>;
  /** DOM nodes the patch phase manages, by entity id. */
  nodes: Map<string, Element | Text>;
};

const mounts = new Set<MountRecord>();

export function registerMount(record: MountRecord): () => void {
  mounts.add(record);
  return () => mounts.delete(record);
}

export function componentInfo(componentId: string): ComponentInfo | undefined {
  for (const mount of mounts) {
    const info = mount.components.get(componentId);
    if (info) return info;
  }
  return undefined;
}

/** The innermost component the element renders within, if any. */
export function ownerOf(elementId: string): string | undefined {
  for (const mount of mounts) {
    const owner = mount.owners.get(elementId);
    if (owner) return owner;
  }
  return undefined;
}

/** Component ids enclosing an element or component, innermost first. */
export function componentChain(id: string): string[] {
  const chain: string[] = [];
  let current: string | undefined = componentInfo(id) ? id : ownerOf(id);
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = componentInfo(current)?.parent ?? undefined;
  }
  return chain;
}

/** An id as `outlineUI()` prints it, with or without its `#` prefix. */
export function entityId(id: string): string {
  return id.startsWith("#") ? id.slice(1) : id;
}

/** The DOM node currently rendered for an entity id, if a mount manages one. */
export function nodeFor(id: string): Element | Text | undefined {
  for (const mount of mounts) {
    const node = mount.nodes.get(id);
    if (node) return node;
  }
  return undefined;
}
