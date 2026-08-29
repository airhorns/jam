// JSX type declarations for our custom factory

declare namespace JSX {
  type Element = import("./jsx").VNode;

  interface IntrinsicElements {
    [tagName: string]: Record<string, unknown>;
  }

  // Accepted on every element and component; consumed by the renderer for
  // entity identity rather than passed to the component.
  interface IntrinsicAttributes {
    key?: string | number;
  }

  interface ElementChildrenAttribute {
    children: {};
  }

  interface IntrinsicAttributes {
    key?: unknown;
    id?: string;
  }
}
