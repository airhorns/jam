import { when, $ } from "@jam/core";
import { createContext, h, useContext } from "@jam/core/jsx";
import type { Context, VChild, VNode } from "@jam/core/jsx";
import type { AllStyleProps, ThemeableProps } from "./types";
import { getToken, getTokens, isTokenRef, resolveTokenValue } from "./tokens";
import {
  ThemeContext,
  ensureThemeCSS,
  getResolvedThemeValues,
  isThemeKey,
  resolveThemeName,
  themeClassNames,
  useThemeName,
} from "./themes";
import { getMediaPrecedence, getMediaQuery, isMediaKey, useMedia } from "./media";
import { getFont, getFontFamily, getFontValue, hasFont, type ResolvedFont } from "./fonts";
import { getAnimation, getDefaultFont } from "./settings";
import {
  camelToKebab,
  expandShorthand,
  fontPropertyMap,
  isMediaProp,
  isPseudoProp,
  isStyleProp,
  pseudoSelectorMap,
  stylesToCSS,
  tokenCategoryMap,
} from "./style-props";
import { atomicClassName, injectAtomic, injectRule } from "./css";
import { isNativeMode } from "./native-mode";

type StyleObject = Record<string, unknown>;

// ---- Public types ----

export type VariantExtras = {
  /** All props after defaults and context were applied. */
  props: Record<string, unknown>;
  /** Every token, keyed both "4" and "$4": `tokens.size["$4"]`. */
  tokens: Record<string, Record<string, string | number>>;
  /** Theme refs: `theme.shadowColor` is "$shadowColor" when the key exists, so it resolves to a CSS variable. */
  theme: Record<string, string | undefined>;
  /** Concrete values of the theme in effect. */
  themeValues: Record<string, string>;
  /** The font in effect (tables keyed "4" and "$4"). */
  font: ResolvedFont | undefined;
  fontName: string;
};

export type VariantFunction = (value: any, extras: VariantExtras) => StyleObject | null | undefined | void;

/**
 * A variant definition: either a function of the prop value, or a map whose
 * keys are matched against the value. Special keys:
 *   - `true` / `false` for boolean props
 *   - `...size`, `...space`, `...radius`, `...color`, `...zIndex`, `...fontSize` spread
 *     over every token in that category (functional; receives the token string)
 *   - `:number`, `:string`, `:boolean` catch-alls by type
 * A variant's result may itself name other variants (`{ size: "$true" }`); those
 * act as defaults for props that weren't passed.
 */
export type VariantSpec = Record<string, StyleObject | VariantFunction> | VariantFunction;

export type StyledContextValue = Record<string, unknown>;

export type StyledContext<T extends StyledContextValue = StyledContextValue> = Context<T> & {
  __styledContext: true;
  /** Read the nearest provided values from a component. */
  useStyledContext: () => T;
};

export type StyledConfig = {
  /** Component name; also selects a component theme (`light_Button`) when one exists. */
  name?: string;
  /** Override the element rendered when extending another styled component. */
  tag?: string;
  /** Default style and non-style props. Style defaults are skipped when `unstyled` is set, except those declared alongside `unstyled: true` (or by a component extending one that did). */
  defaultProps?: Record<string, unknown>;
  variants?: Record<string, VariantSpec>;
  defaultVariants?: Record<string, unknown>;
  /** Share variant values (like `size`) with descendants created with the same context. */
  context?: StyledContext<any>;
  /** Text components default `fontFamily` to the configured default font. */
  isText?: boolean;
  /** Extra props consumed by this component rather than passed to the DOM. */
  consumedProps?: string[];
};

export type StyledProps = Partial<AllStyleProps> &
  ThemeableProps & {
    children?: VChild | VChild[];
    [key: string]: unknown;
  };

export type StyledComponent<P = {}> = {
  /** `P` wins over `StyledProps`, so a component can narrow or repurpose a style prop such as `position`. */
  (props: Omit<StyledProps, keyof P> & P): VNode;
  displayName?: string;
  /** The merged configuration, so `styled(Component, …)` can extend it. */
  staticConfig: ResolvedStyledConfig;
};

export type ResolvedStyledConfig = StyledConfig & {
  tag: string;
  /** A plain function component to render instead of an intrinsic tag. */
  render?: (props: Record<string, unknown>) => VChild;
  /** Defaults declared by the config that set `unstyled: true` and any config extending it; these still apply. */
  unstyledDefaults?: Record<string, unknown>;
};

// ---- Styled context ----

/**
 * Create a context whose values act as prop defaults for every styled
 * component that declares `context: ctx`. A component that receives one of
 * the context's keys as a prop provides the new values to its descendants.
 *
 *   const ButtonContext = createStyledContext({ size: "$true" });
 *   const Frame = styled("button", { context: ButtonContext, variants: { size: … } });
 *   const Label = styled("span", { context: ButtonContext, variants: { size: … } });
 */
export function createStyledContext<T extends StyledContextValue>(defaults: T): StyledContext<T> {
  const ctx = createContext<T>(defaults) as StyledContext<T>;
  ctx.__styledContext = true;
  ctx.useStyledContext = () => useContext(ctx);
  return ctx;
}

// ---- Style accumulation ----

type Flattened = {
  base: StyleObject;
  pseudo: Record<string, StyleObject>;
  media: Record<string, { base: StyleObject; pseudo: Record<string, StyleObject> }>;
};

function newFlattened(): Flattened {
  return { base: {}, pseudo: {}, media: {} };
}

function addStyles(target: { base: StyleObject; pseudo: Record<string, StyleObject> }, styles: StyleObject): void {
  for (const [key, value] of Object.entries(styles)) {
    if (value === undefined) continue;
    if (isPseudoProp(key)) {
      if (value && typeof value === "object") {
        target.pseudo[key] = { ...target.pseudo[key], ...expandAll(value as StyleObject) };
      }
    } else if (isStyleProp(key)) {
      for (const [prop, val] of expandShorthand(key, value)) target.base[prop] = val;
    }
  }
}

function expandAll(styles: StyleObject): StyleObject {
  const out: StyleObject = {};
  for (const [key, value] of Object.entries(styles)) {
    if (value === undefined) continue;
    if (isStyleProp(key)) {
      for (const [prop, val] of expandShorthand(key, value)) out[prop] = val;
    }
  }
  return out;
}

/** Merge one layer of props (defaults, a variant result, or inline props) into the accumulator. */
function addLayer(acc: Flattened, styles: StyleObject): void {
  addStyles(acc, styles);
  for (const [key, value] of Object.entries(styles)) {
    if (!isMediaProp(key) || !value || typeof value !== "object") continue;
    const name = key.slice(1);
    if (!isMediaKey(name)) continue;
    const block = (acc.media[name] ??= { base: {}, pseudo: {} });
    addStyles(block, value as StyleObject);
  }
}

// ---- Value resolution ----

type ResolveContext = {
  themeName: string | undefined;
  fontName: string;
  native: boolean;
};

const themeRefProxy: Record<string, string | undefined> = new Proxy({} as Record<string, string | undefined>, {
  get: (_, key) => (typeof key === "string" && isThemeKey(key) ? `$${key}` : undefined),
  has: (_, key) => typeof key === "string" && isThemeKey(key),
});

function resolveValue(prop: string, value: unknown, ctx: ResolveContext): unknown {
  if (typeof value !== "string" || !value.startsWith("$") || value.length < 2) return value;

  if (isTokenRef(value)) {
    const resolved = resolveTokenValue(value);
    return resolved !== undefined ? resolved : value;
  }

  const key = value.slice(1);

  if (prop === "fontFamily") {
    return getFontFamily(key) ?? value;
  }

  const fontProp = fontPropertyMap[prop];
  if (fontProp) {
    const fromFont = getFontValue(ctx.fontName, fontProp, key);
    if (fromFont !== undefined) return fromFont;
  }

  if (isThemeKey(key)) {
    if (ctx.native) {
      return ctx.themeName ? getResolvedThemeValues(ctx.themeName)[key] ?? value : value;
    }
    return `var(--${key})`;
  }

  const category = tokenCategoryMap[prop];
  if (category) {
    const token = getToken(category, key);
    if (token !== undefined) return token;
  }

  const color = getToken("color", key);
  if (color !== undefined) return color;

  return value;
}

function resolveStyles(styles: StyleObject, ctx: ResolveContext): StyleObject {
  const out: StyleObject = {};
  for (const [prop, value] of Object.entries(styles)) {
    if (value == null) continue;
    out[prop] = resolveValue(prop, value, ctx);
  }
  return out;
}

// ---- Variants ----

const spreadCategories: Record<string, string> = {
  "...size": "size",
  "...space": "space",
  "...radius": "radius",
  "...color": "color",
  "...zIndex": "zIndex",
  "...fontSize": "fontSize",
};

function matchVariant(spec: VariantSpec, value: unknown, extras: VariantExtras): StyleObject | null {
  if (value == null) return null;
  if (typeof spec === "function") return (spec(value, extras) as StyleObject | null | undefined) ?? null;
  const key = String(value);
  let match: StyleObject | VariantFunction | undefined = spec[key];

  // Token spreads accept "$4" and the bare key "4"; numbers are literal values.
  if (match === undefined && typeof value === "string") {
    for (const [spread, category] of Object.entries(spreadCategories)) {
      if (!(spread in spec)) continue;
      const exists =
        category === "fontSize"
          ? extras.font?.size[key] !== undefined
          : extras.tokens[category]?.[key] !== undefined;
      if (exists) {
        match = spec[spread];
        break;
      }
    }
  }

  if (match === undefined) {
    if (typeof value === "number" && spec[":number"]) match = spec[":number"];
    else if (typeof value === "string" && spec[":string"]) match = spec[":string"];
    else if (typeof value === "boolean" && spec[":boolean"]) match = spec[":boolean"];
  }

  if (match === undefined) return null;
  if (typeof match === "function") return (match(value, extras) as StyleObject | null | undefined) ?? null;
  return match;
}

// Variant props that are also meaningful DOM attributes are forwarded as well as styled.
const domVariantProps = new Set(["disabled", "checked", "open", "hidden", "readOnly", "required", "selected"]);

const controlProps = new Set([
  "theme", "themeInverse", "unstyled", "asChild", "tag", "animation", "animateOnly", "className", "class", "style", "children",
]);

// ---- Rendering ----

function isStyledComponent(fn: unknown): fn is StyledComponent {
  return typeof fn === "function" && "staticConfig" in fn;
}

function mergeDefaults(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b ?? {})) {
    const prev = out[key];
    if (isPseudoProp(key) && prev && value && typeof prev === "object" && typeof value === "object") {
      out[key] = { ...(prev as object), ...(value as object) };
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Variants merge one level deep so a child can extend `unstyled.false`; a function replaces the parent's spec.
function mergeVariants(
  parent: Record<string, VariantSpec> | undefined,
  own: Record<string, VariantSpec> | undefined,
): Record<string, VariantSpec> {
  const out: Record<string, VariantSpec> = { ...parent };
  for (const [name, spec] of Object.entries(own ?? {})) {
    const parentSpec = parent?.[name];
    if (!parentSpec || typeof spec === "function" || typeof parentSpec === "function") {
      out[name] = spec;
      continue;
    }
    const mergedSpec: Record<string, StyleObject | VariantFunction> = { ...parentSpec };
    for (const [key, value] of Object.entries(spec)) {
      const prev = parentSpec[key];
      mergedSpec[key] =
        prev && typeof prev === "object" && typeof value === "object" ? mergeDefaults(prev, value) : value;
    }
    out[name] = mergedSpec;
  }
  return out;
}

function resolveConfig(base: string | Function, config: StyledConfig): ResolvedStyledConfig {
  if (typeof base === "string") {
    return { ...config, tag: config.tag ?? base, unstyledDefaults: unstyledDefaultsFor(undefined, config) };
  }
  if (isStyledComponent(base)) {
    const parent = base.staticConfig;
    return {
      ...parent,
      ...config,
      tag: config.tag ?? parent.tag,
      name: config.name ?? parent.name,
      defaultProps: mergeDefaults(parent.defaultProps, config.defaultProps),
      unstyledDefaults: unstyledDefaultsFor(parent, config),
      variants: mergeVariants(parent.variants, config.variants),
      defaultVariants: { ...parent.defaultVariants, ...config.defaultVariants },
      context: config.context ?? parent.context,
      isText: config.isText ?? parent.isText,
      consumedProps: [...(parent.consumedProps ?? []), ...(config.consumedProps ?? [])],
    };
  }
  return { ...config, tag: "div", render: base as (props: Record<string, unknown>) => VChild };
}

function unstyledDefaultsFor(parent: ResolvedStyledConfig | undefined, config: StyledConfig): Record<string, unknown> | undefined {
  if (config.defaultProps?.unstyled === true) return config.defaultProps;
  if (parent?.unstyledDefaults) return mergeDefaults(parent.unstyledDefaults, config.defaultProps);
  return undefined;
}

function toChildren(children: unknown): VChild[] {
  if (children == null) return [];
  return Array.isArray(children) ? (children as VChild[]) : [children as VChild];
}

function mergeClass(...parts: unknown[]): string | undefined {
  const cls = parts.filter((p) => typeof p === "string" && p.trim()).join(" ");
  return cls || undefined;
}

// Text nested in text inherits the parent's wrapping so an `ellipsis` parent still truncates.
const TextAncestor = createContext<boolean>(false);
const nestedTextStyle: StyleObject = { whiteSpace: "inherit" };

/**
 * Create a styled component.
 *
 * @param base - An HTML tag, another styled component (its config is extended), or a plain component function
 * @param config - Style configuration: name, defaultProps, variants, defaultVariants, context
 */
export function styled<P = {}>(base: string | StyledComponent<any> | ((props: any) => VChild), config: StyledConfig = {}): StyledComponent<P> {
  const staticConfig = resolveConfig(base, config);
  const variantNames = Object.keys(staticConfig.variants ?? {});
  const contextKeys = staticConfig.context ? Object.keys(staticConfig.context.defaultValue ?? {}) : [];
  const consumed = new Set(staticConfig.consumedProps ?? []);

  const component = ((props: Record<string, unknown>) => {
    const native = isNativeMode();
    const defaults = staticConfig.defaultProps ?? {};
    const unstyled = props.unstyled === true || (props.unstyled === undefined && defaults.unstyled === true);
    const inText = staticConfig.isText === true && useContext(TextAncestor) === true;

    // Context values sit between defaults and explicit props.
    const contextValues = staticConfig.context ? (useContext(staticConfig.context) as Record<string, unknown>) : undefined;
    const merged: Record<string, unknown> = { ...defaults, ...contextValues, ...props };

    // 1. Theme in effect for this element.
    const parentTheme = useThemeName();
    const themeName = resolveThemeName(
      parentTheme,
      merged.theme as string | undefined,
      staticConfig.name,
      merged.themeInverse === true,
    );
    const themeChanged = themeName !== undefined && themeName !== parentTheme;

    // 2. Accumulate style layers: defaults → variants → inline props.
    const acc = newFlattened();
    const passthrough: Record<string, unknown> = {};

    if (!unstyled) addLayer(acc, defaults);
    else if (props.unstyled === undefined && staticConfig.unstyledDefaults) addLayer(acc, staticConfig.unstyledDefaults);
    if (inText) addLayer(acc, nestedTextStyle);
    for (const [key, value] of Object.entries(defaults)) {
      if (isStyleProp(key) || isPseudoProp(key) || isMediaProp(key) || controlProps.has(key) || variantNames.includes(key)) continue;
      passthrough[key] = value;
    }

    if (variantNames.length > 0) {
      const fontName = fontNameFor(merged);
      let extras: VariantExtras | null = null;
      const getExtras = (): VariantExtras =>
        (extras ??= {
          props: merged,
          tokens: getTokens(),
          theme: themeRefProxy,
          get themeValues() {
            return themeName ? getResolvedThemeValues(themeName) : {};
          },
          font: getFont(fontName),
          fontName,
        });
      const variantValue = (name: string): unknown => merged[name] ?? staticConfig.defaultVariants?.[name];
      const applyVariant = (name: string, value: unknown, seen: Set<string>): void => {
        const styles = matchVariant(staticConfig.variants![name], value, getExtras());
        if (!styles) return;
        const plain: StyleObject = {};
        for (const [key, v] of Object.entries(styles)) {
          if (variantNames.includes(key) && !seen.has(key)) {
            if (variantValue(key) === undefined && v != null) applyVariant(key, v, new Set(seen).add(key));
          } else {
            plain[key] = v;
          }
        }
        addLayer(acc, plain);
      };
      for (const name of variantNames) {
        const value = variantValue(name);
        if (value === undefined) continue;
        applyVariant(name, value, new Set([name]));
      }
    }

    // Style props inherited through a styled context act like props set on this element.
    if (contextValues) {
      const inherited: StyleObject = {};
      for (const [key, value] of Object.entries(contextValues)) {
        if (value === undefined || variantNames.includes(key)) continue;
        if (isStyleProp(key) || isPseudoProp(key)) inherited[key] = value;
      }
      addLayer(acc, inherited);
    }

    const inline: StyleObject = {};
    for (const [key, value] of Object.entries(props)) {
      if (controlProps.has(key)) continue;
      if (variantNames.includes(key)) {
        if (domVariantProps.has(key)) passthrough[key] = value;
        continue;
      }
      if (isStyleProp(key) || isPseudoProp(key) || isMediaProp(key)) {
        inline[key] = value;
      } else if (!contextKeys.includes(key) && !consumed.has(key)) {
        passthrough[key] = value;
      }
    }
    addLayer(acc, inline);

    if (merged.disabled === true && acc.pseudo.disabledStyle) {
      Object.assign(acc.base, acc.pseudo.disabledStyle);
    }

    if (staticConfig.isText && acc.base.fontFamily === undefined && hasFont(getDefaultFont())) {
      acc.base.fontFamily = `$${getDefaultFont()}`;
    }

    // 3. Resolve tokens, theme refs and font values.
    const ctx: ResolveContext = { themeName, fontName: fontNameFor(acc.base), native };
    const resolvedBase = resolveStyles(acc.base, ctx);

    if (native) {
      return renderNative(staticConfig, component, passthrough, props, acc, resolvedBase, ctx, themeChanged ? themeName : undefined);
    }

    // 4. Emit atomic classes.
    const classes: string[] = [];
    if (themeChanged && themeName) {
      ensureThemeCSS(themeName);
      classes.push(...themeClassNames(themeName).split(" "));
    }
    if (staticConfig.name) classes.push(`is_${staticConfig.name}`);

    const animation = typeof merged.animation === "string" ? getAnimation(merged.animation) : undefined;
    if (animation && resolvedBase.transition === undefined) {
      const only = Array.isArray(merged.animateOnly) ? (merged.animateOnly as string[]) : ["all"];
      resolvedBase.transition = only.map((prop) => `${camelToKebab(prop)} ${animation}`).join(", ");
    }

    for (const [prop, value] of Object.entries(stylesToCSS(resolvedBase))) {
      classes.push(injectAtomic(prop, value));
    }
    if (animation && acc.pseudo.enterStyle) {
      const enter = enterAnimation(stylesToCSS(resolveStyles(acc.pseudo.enterStyle, ctx)), animation);
      if (enter) classes.push(enter);
    }
    for (const [pseudoProp, styles] of Object.entries(acc.pseudo)) {
      const selector = pseudoSelectorMap[pseudoProp];
      if (!selector) continue;
      for (const [prop, value] of Object.entries(stylesToCSS(resolveStyles(styles, ctx)))) {
        classes.push(injectAtomic(prop, value, { pseudo: selector }));
      }
    }
    for (const [name, block] of Object.entries(acc.media)) {
      const media = getMediaQuery(name);
      if (!media) continue;
      const mediaPrecedence = getMediaPrecedence(name);
      for (const [prop, value] of Object.entries(stylesToCSS(resolveStyles(block.base, ctx)))) {
        classes.push(injectAtomic(prop, value, { media, mediaPrecedence }));
      }
      for (const [pseudoProp, styles] of Object.entries(block.pseudo)) {
        const selector = pseudoSelectorMap[pseudoProp];
        if (!selector) continue;
        for (const [prop, value] of Object.entries(stylesToCSS(resolveStyles(styles, ctx)))) {
          classes.push(injectAtomic(prop, value, { pseudo: selector, media, mediaPrecedence }));
        }
      }
    }

    const className = mergeClass(props.class ?? defaults.class, props.className ?? defaults.className, ...classes);
    if (className) passthrough.class = className;
    if (props.style != null) passthrough.style = props.style;

    // 5. Render.
    const rawChildren = toChildren(props.children);
    const provideTo = (kids: VChild[]): VChild[] => {
      let out = kids;
      if (staticConfig.isText && !inText && kids.some((kid) => kid != null && typeof kid === "object")) {
        out = [h(TextAncestor.Provider, { value: true }, ...out)];
      }
      if (themeChanged && themeName) {
        out = [h(ThemeContext.Provider, { value: themeName }, ...out)];
      }
      if (staticConfig.context) {
        const provided: Record<string, unknown> = {};
        let changed = false;
        for (const key of contextKeys) {
          if (props[key] !== undefined) {
            provided[key] = props[key];
            changed = true;
          }
        }
        if (changed) {
          out = [h(staticConfig.context.Provider, { value: { ...contextValues, ...provided } }, ...out)];
        }
      }
      return out;
    };

    if (merged.asChild === true) {
      const only = rawChildren.length === 1 ? rawChildren[0] : undefined;
      if (only && typeof only === "object" && "__vnode" in only) {
        const wrapped = provideTo([mergeOntoChild(only as VNode, passthrough)]);
        return (wrapped.length === 1 ? wrapped[0] : h("span", { style: "display: contents" }, ...wrapped)) as VNode;
      }
    }

    const children = provideTo(rawChildren);
    if (staticConfig.render) {
      return staticConfig.render({ ...passthrough, children: children.length === 1 ? children[0] : children }) as VNode;
    }
    const tag = typeof merged.tag === "string" ? merged.tag : staticConfig.tag;
    return h(tag, passthrough, ...children);
  }) as StyledComponent<P>;

  component.staticConfig = staticConfig;
  component.displayName =
    config.name ??
    (typeof base === "string"
      ? `Styled(${base})`
      : `Styled(${(base as { displayName?: string }).displayName ?? (base as Function).name ?? "Component"})`);

  return component;
}

// `enterStyle` plays as a keyframe animation from those values to the element's
// own styles when it mounts, so it needs no lifecycle hook.
function enterAnimation(enterCSS: Record<string, string>, animation: string): string | undefined {
  const declarations = Object.entries(enterCSS)
    .map(([prop, value]) => `${prop}: ${value}`)
    .join("; ");
  if (!declarations) return undefined;
  const name = atomicClassName("animation-name", declarations).replace(/^_/, "enter_");
  injectRule(`@keyframes ${name}`, `@keyframes ${name} { from { ${declarations} } }`);
  return injectAtomic("animation", `${name} ${animation}`);
}

// `asChild`: the child element takes this component's classes, attributes and handlers.
function mergeOntoChild(child: VNode, props: Record<string, unknown>): VNode {
  const childProps = { ...child.props };
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") {
      childProps.class = mergeClass(childProps.class, childProps.className, value);
    } else if (key.startsWith("on") && typeof value === "function" && typeof childProps[key] === "function") {
      const inner = childProps[key] as Function;
      childProps[key] = (...args: unknown[]) => {
        inner(...args);
        (value as Function)(...args);
      };
    } else if (childProps[key] === undefined) {
      childProps[key] = value;
    }
  }
  delete childProps.className;
  return { ...child, props: childProps };
}

// The font whose size tables `$` font values resolve against: `fontFamily="$heading"`, else the default font.
function fontNameFor(styles: Record<string, unknown>): string {
  const family = styles.fontFamily;
  if (typeof family === "string" && family.startsWith("$") && hasFont(family.slice(1))) return family.slice(1);
  return getDefaultFont();
}

function renderNative(
  config: ResolvedStyledConfig,
  component: StyledComponent<any>,
  passthrough: Record<string, unknown>,
  props: Record<string, unknown>,
  acc: Flattened,
  resolvedBase: StyleObject,
  ctx: ResolveContext,
  themeName: string | undefined,
): VNode {
  if (ctx.themeName) when(["theme", ctx.themeName, $.key, $.value]);
  // Media styles are merged in JS since there is no CSS engine.
  const media = useMedia();
  const styles = { ...resolvedBase };
  for (const [name, block] of Object.entries(acc.media)) {
    if (media[name]) Object.assign(styles, resolveStyles(block.base, ctx));
  }
  passthrough.__nativeStyles = styles;
  passthrough.__nativeTag = component.displayName || config.tag;
  for (const [pseudoKey, pseudoStyles] of Object.entries(acc.pseudo)) {
    passthrough[`__native_${pseudoKey}`] = resolveStyles(pseudoStyles, ctx);
  }
  if (props.class ?? props.className) passthrough.class = mergeClass(props.class, props.className);

  let children = toChildren(props.children);
  if (themeName) children = [h(ThemeContext.Provider, { value: themeName }, ...children)];
  if (config.render) {
    return config.render({ ...passthrough, children: children.length === 1 ? children[0] : children }) as VNode;
  }
  return h(config.tag, passthrough, ...children);
}
