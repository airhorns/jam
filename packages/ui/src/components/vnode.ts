import type { VChild, VNode } from "@jam/core/jsx";

export function isVNode(child: VChild): child is VNode {
  return typeof child === "object" && child !== null && "__vnode" in child;
}

/** Whether any node in the (not yet expanded) subtree has one of the given tags. */
export function containsTag(children: VChild | VChild[] | undefined, tags: ReadonlyArray<VNode["tag"]>): boolean {
  const visit = (nodes: VChild[]): boolean => {
    for (const child of nodes.flat(10)) {
      if (!isVNode(child)) continue;
      if (tags.includes(child.tag)) return true;
      if (visit(child.children)) return true;
    }
    return false;
  };
  return visit([children].flat(10) as VChild[]);
}
