// JSX type declarations for our custom factory

declare namespace JSX {
  type Element = import("./jsx").VNode;

  interface IntrinsicElements {
    [tagName: string]: Record<string, unknown>;
  }

  interface ElementChildrenAttribute {
    children: {};
  }
}
