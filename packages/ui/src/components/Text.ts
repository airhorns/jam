import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { styled } from "../styled";
import type { StyledComponent } from "../styled";
import { getFontSized } from "../variants";

const ellipsisStyle = {
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * Base text component. Renders a span with browser text defaults normalized.
 */
export const Text = styled("span", {
  name: "Text",
  isText: true,
  defaultProps: {
    display: "inline",
    boxSizing: "border-box",
    wordWrap: "break-word",
    whiteSpace: "pre-wrap",
    margin: 0,
  },
  variants: {
    numberOfLines: {
      1: ellipsisStyle,
      ":number": (lines: number) =>
        lines >= 1
          ? {
              maxWidth: "100%",
              WebkitLineClamp: lines,
              WebkitBoxOrient: "vertical",
              display: "-webkit-box",
              overflow: "hidden",
            }
          : null,
    },
    ellipsis: {
      true: ellipsisStyle,
    },
  },
});

const textStyleKeys = ["color", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "textAlign", "size", "ellipsis"] as const;

export type TextParentProps = {
  color?: unknown;
  fontFamily?: unknown;
  fontSize?: unknown;
  fontWeight?: unknown;
  fontStyle?: unknown;
  letterSpacing?: unknown;
  textAlign?: unknown;
  size?: unknown;
  ellipsis?: boolean;
  /** Render string children as-is instead of wrapping them in the text component. */
  noTextWrap?: boolean;
  /** Extra props for the wrapping text component. */
  textProps?: Record<string, unknown>;
};

/**
 * Wrap bare string/number children in `TextComponent`, forwarding the text
 * style props from the parent. Adjacent strings (`Clicked {n} times`) become
 * one text element; element children pass through untouched.
 */
export function wrapChildrenInText(
  TextComponent: StyledComponent<any>,
  children: VChild | VChild[] | undefined,
  parentProps: TextParentProps,
  extraProps: Record<string, unknown> = {},
): VChild[] {
  const kids = children == null ? [] : Array.isArray(children) ? children : [children];
  if (parentProps.noTextWrap) return kids;
  const props: Record<string, unknown> = { ...extraProps };
  for (const key of textStyleKeys) {
    if (parentProps[key] !== undefined) props[key] = parentProps[key];
  }
  Object.assign(props, parentProps.textProps);

  const out: VChild[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0) out.push(h(TextComponent, props, run.join("")));
    run = [];
  };
  for (const child of kids) {
    if (typeof child === "string" || typeof child === "number") {
      run.push(String(child));
    } else if (child != null && child !== false) {
      flush();
      out.push(child);
    }
  }
  flush();
  return out;
}

/**
 * SizableText: text whose `size` token drives fontSize, lineHeight, fontWeight
 * and letterSpacing from the font in effect (`fontFamily="$heading"` etc.).
 */
export const SizableText = styled(Text, {
  name: "SizableText",
  defaultProps: {
    fontFamily: "$body",
  },
  variants: {
    unstyled: {
      false: { size: "$true", color: "$color" },
    },
    size: getFontSized,
  },
  defaultVariants: {
    unstyled: false,
  },
});

/**
 * Paragraph: body copy. Renders a p tag.
 */
export const Paragraph = styled(SizableText, {
  name: "Paragraph",
  tag: "p",
  defaultProps: {
    userSelect: "auto",
    color: "$color",
    size: "$true",
    whiteSpace: "normal",
  },
});

/**
 * Base heading: the heading font at a large size. Renders a span so the
 * semantic level is chosen by H1–H6.
 */
export const Heading = styled(Paragraph, {
  name: "Heading",
  tag: "span",
  defaultProps: {
    role: "heading",
    fontFamily: "$heading",
    size: "$8",
    margin: 0,
  },
});

export const H1 = styled(Heading, { name: "H1", tag: "h1", defaultProps: { role: undefined, size: "$10" } });
export const H2 = styled(Heading, { name: "H2", tag: "h2", defaultProps: { role: undefined, size: "$9" } });
export const H3 = styled(Heading, { name: "H3", tag: "h3", defaultProps: { role: undefined, size: "$8" } });
export const H4 = styled(Heading, { name: "H4", tag: "h4", defaultProps: { role: undefined, size: "$7" } });
export const H5 = styled(Heading, { name: "H5", tag: "h5", defaultProps: { role: undefined, size: "$6" } });
export const H6 = styled(Heading, { name: "H6", tag: "h6", defaultProps: { role: undefined, size: "$5" } });
