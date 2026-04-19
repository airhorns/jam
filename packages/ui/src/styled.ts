import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import type { AllStyleProps } from "./types";
import { resolveTokenValue, isTokenRef, isThemeRef } from "./tokens";
import { resolveThemeValue } from "./themes";
import { useMedia } from "./media";
import {
  expandShorthand,
  isStyleProp,
  isPseudoProp,
  isMediaProp,
  shorthandNames,
  tokenCategoryMap,
} from "./style-props";
import {
  generateClassName,
  stylesToCSS,
  injectStyleRule,
  injectPseudoRule,
} from "./css";
import { isNativeMode } from "./native-mode";

export type StyledComponent<P = {}> = {
  (props: P & Partial<AllStyleProps> & { children?: VChild | VChild[]; class?: string; [key: string]: unknown }): VNode;
  displayName?: string;
};

export type StyledConfig = {
  name?: string;
  defaultProps?: Record<string, unknown>;
  variants?: Record<string, Record<string, Record<string, unknown>>>;
  defaultVariants?: Record<string, string>;
};

/**
 * Resolve a style value: handle token refs ($size.4), theme refs ($background), and raw values.
 */
function resolveValue(prop: string, value: unknown): unknown {
  if (typeof value !== "string") return value;

  if (isTokenRef(value)) {
    const resolved = resolveTokenValue(value);
    return resolved !== undefined ? resolved : value;
  }

  if (isThemeRef(value)) {
    const resolved = resolveThemeValue(value);
    return resolved !== undefined ? resolved : value;
  }

  // Check if this property has an implicit token category and value is a plain number-like string
  // e.g. padding="4" could resolve to space token "4"
  return value;
}

/**
 * Process a flat style object: expand shorthands, resolve tokens/themes.
 */
function processStyles(styles: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(styles)) {
    if (value == null) continue;
    const expanded = expandShorthand(key, value);
    for (const [prop, val] of expanded) {
      result[prop] = resolveValue(prop, val);
    }
  }
  return result;
}

const pseudoToCSSMap: Record<string, string> = {
  hoverStyle: "hover",
  pressStyle: "active",
  focusStyle: "focus",
  focusVisibleStyle: "focus-visible",
  disabledStyle: "disabled",
};

/**
 * Create a styled component.
 *
 * @param base - An HTML tag string or another component function
 * @param config - Style configuration with name, defaultProps, variants, defaultVariants
 * @returns A new component function
 */
export function styled<V extends Record<string, Record<string, Record<string, unknown>>> = {}>(
  base: string | ((props: Record<string, unknown>) => VChild),
  config: StyledConfig = {},
): StyledComponent {
  const component: StyledComponent = (props: Record<string, unknown>) => {
    const styleAccum: Record<string, unknown> = {};
    const pseudoAccum: Record<string, Record<string, unknown>> = {};
    const passthrough: Record<string, unknown> = {};
    const children: VChild[] = [];

    // 1. Apply default props (style and non-style)
    if (config.defaultProps) {
      for (const [key, value] of Object.entries(config.defaultProps)) {
        if (isStyleProp(key)) {
          const expanded = expandShorthand(key, value);
          for (const [prop, val] of expanded) {
            styleAccum[prop] = val;
          }
        } else if (isPseudoProp(key)) {
          pseudoAccum[key] = value as Record<string, unknown>;
        } else {
          passthrough[key] = value;
        }
      }
    }

    // 2. Apply variant styles
    if (config.variants) {
      for (const [variantName, variantOptions] of Object.entries(config.variants)) {
        const variantValue = (props[variantName] as string) ??
          config.defaultVariants?.[variantName];
        if (variantValue != null && variantOptions[variantValue]) {
          const variantStyles = variantOptions[variantValue];
          for (const [key, value] of Object.entries(variantStyles)) {
            if (isStyleProp(key)) {
              const expanded = expandShorthand(key, value);
              for (const [prop, val] of expanded) {
                styleAccum[prop] = val;
              }
            } else if (isPseudoProp(key)) {
              pseudoAccum[key] = {
                ...(pseudoAccum[key] || {}),
                ...(value as Record<string, unknown>),
              };
            } else {
              passthrough[key] = value;
            }
          }
        }
      }
    }

    // 3. Process inline props
    const media = useMedia();

    for (const [key, value] of Object.entries(props)) {
      if (key === "children") {
        if (Array.isArray(value)) {
          children.push(...(value as VChild[]));
        } else {
          children.push(value as VChild);
        }
      } else if (isMediaProp(key)) {
        // Media-conditional styles: $gtSm={{ padding: 10 }}
        const breakpoint = key.slice(1); // Remove $
        if (media[breakpoint]) {
          const mediaStyles = value as Record<string, unknown>;
          for (const [mk, mv] of Object.entries(mediaStyles)) {
            if (isStyleProp(mk)) {
              const expanded = expandShorthand(mk, mv);
              for (const [prop, val] of expanded) {
                styleAccum[prop] = val;
              }
            }
          }
        }
      } else if (isPseudoProp(key)) {
        pseudoAccum[key] = {
          ...(pseudoAccum[key] || {}),
          ...(value as Record<string, unknown>),
        };
      } else if (isStyleProp(key)) {
        const expanded = expandShorthand(key, value);
        for (const [prop, val] of expanded) {
          styleAccum[prop] = val;
        }
      } else if (config.variants && key in config.variants) {
        // Already handled above, skip
      } else {
        passthrough[key] = value;
      }
    }

    // 4. Resolve all token/theme references in accumulated styles
    const resolvedStyles = processStyles(styleAccum);

    // Native mode: emit resolved styles as props instead of CSS classes
    if (isNativeMode()) {
      passthrough.__nativeStyles = resolvedStyles;
      passthrough.__nativeTag = component.displayName || (typeof base === "string" ? base : "View");

      // Include pseudo styles for native hover/press/focus handling
      for (const [pseudoKey, pseudoStyles] of Object.entries(pseudoAccum)) {
        if (pseudoStyles) {
          passthrough[`__native_${pseudoKey}`] = processStyles(pseudoStyles);
        }
      }

      if (typeof base === "string") {
        return h(base, passthrough, ...children);
      } else {
        return base({ ...passthrough, children: children.length === 1 ? children[0] : children }) as VNode;
      }
    }

    const cssProps = stylesToCSS(resolvedStyles);

    // 5. Generate class name and inject CSS
    let classNames: string[] = [];

    if (Object.keys(cssProps).length > 0) {
      const className = generateClassName(cssProps);
      injectStyleRule(className, cssProps);
      classNames.push(className);
    }

    // 6. Handle pseudo-state styles
    const baseClassName = classNames[0]; // Pseudo rules attach to this
    for (const [pseudoKey, pseudoStyles] of Object.entries(pseudoAccum)) {
      const cssPseudo = pseudoToCSSMap[pseudoKey];
      if (!cssPseudo || !pseudoStyles) continue;

      const resolvedPseudo = processStyles(pseudoStyles);
      const pseudoCSSProps = stylesToCSS(resolvedPseudo);

      if (Object.keys(pseudoCSSProps).length > 0) {
        // We need a stable class for pseudo rules. Use the base class or generate one.
        const pseudoBaseClass = baseClassName || generateClassName({
          __pseudo_anchor: "true",
        });
        if (!baseClassName) {
          injectStyleRule(pseudoBaseClass, {});
          classNames.push(pseudoBaseClass);
        }
        injectPseudoRule(pseudoBaseClass, cssPseudo, pseudoCSSProps);
      }
    }

    // 7. Merge with existing class prop
    if (passthrough.class) {
      classNames = [String(passthrough.class), ...classNames];
      delete passthrough.class;
    }
    if (classNames.length > 0) {
      passthrough.class = classNames.join(" ");
    }

    // 8. Render
    if (typeof base === "string") {
      return h(base, passthrough, ...children);
    } else {
      // Composing styled components: pass merged props
      return base({ ...passthrough, children: children.length === 1 ? children[0] : children }) as VNode;
    }
  };

  component.displayName = config.name || (typeof base === "string" ? `Styled(${base})` : `Styled(${(base as any).displayName || "Component"})`);

  return component;
}
