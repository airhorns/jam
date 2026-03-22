// ============================================================================
// Jam SwiftUI Components
//
// Typed component functions that map to SwiftUI views.
// Each component validates props at the TypeScript level and produces
// the correct entity-attribute-value claims when rendered.
//
// These are JSX components: <Text font="title">Hello</Text>
// They transpile to: h(Text, { font: "title" }, "Hello")
// And render into claims: (entityId, "isa", "Text"), (entityId, "font", "title"), etc.
// ============================================================================

export type Font =
  | "largeTitle"
  | "title"
  | "title2"
  | "title3"
  | "headline"
  | "subheadline"
  | "body"
  | "callout"
  | "footnote"
  | "caption"
  | "caption2";

export type Color =
  | "red"
  | "blue"
  | "green"
  | "orange"
  | "purple"
  | "gray"
  | "white"
  | "black"
  | "yellow"
  | "pink"
  | "primary"
  | "secondary";

export type Alignment = "leading" | "center" | "trailing";

export type VStackProps = {
  key?: string;
  spacing?: number;
  alignment?: Alignment;
  padding?: number;
  children?: any;
};

export type HStackProps = {
  key?: string;
  spacing?: number;
  alignment?: Alignment;
  padding?: number;
  children?: any;
};

export type ZStackProps = {
  key?: string;
  padding?: number;
  children?: any;
};

export type TextProps = {
  key?: string;
  font?: Font;
  foregroundColor?: Color;
  padding?: number;
  children?: string;
};

export type ButtonProps = {
  key?: string;
  label: string;
  font?: Font;
  foregroundColor?: Color;
  padding?: number;
};

export type SpacerProps = {
  key?: string;
};

export type ImageProps = {
  key?: string;
  systemName: string;
  foregroundColor?: Color;
  font?: Font;
};

// ============================================================================
// Component functions
//
// Each returns a JamElement with the SwiftUI type name as the element type.
// The render() function handles emitting claims.
// ============================================================================

// h() is provided by the runtime on globalThis
declare var h: (type: any, props: any, ...children: any[]) => any;

export function VStack(props: VStackProps) {
  return h("VStack", props, ...(asArray(props.children)));
}

export function HStack(props: HStackProps) {
  return h("HStack", props, ...(asArray(props.children)));
}

export function ZStack(props: ZStackProps) {
  return h("ZStack", props, ...(asArray(props.children)));
}

export function Text(props: TextProps) {
  return h("Text", propsWithout(props, "children"), ...(asArray(props.children)));
}

export function Button(props: ButtonProps) {
  return h("Button", props);
}

export function Spacer(props: SpacerProps = {}) {
  return h("Spacer", props);
}

export function Image(props: ImageProps) {
  return h("Image", props);
}

// --- Helpers ---

function asArray(children: any): any[] {
  if (children == null) return [];
  if (Array.isArray(children)) return children;
  return [children];
}

function propsWithout(props: any, ...keys: string[]): any {
  const result: any = {};
  for (const k of Object.keys(props)) {
    if (!keys.includes(k)) result[k] = props[k];
  }
  return result;
}

// Export to globalThis for QuickJS
Object.assign(globalThis, { VStack, HStack, ZStack, Text, Button, Spacer, Image });
