import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Accordion: expandable/collapsible content sections.
 *
 * Usage:
 *   <Accordion type="single" value="item-1" onValueChange={setVal}>
 *     <Accordion.Item value="item-1">
 *       <Accordion.Trigger>Section 1</Accordion.Trigger>
 *       <Accordion.Content>Content 1</Accordion.Content>
 *     </Accordion.Item>
 *   </Accordion>
 */
export function Accordion(props: {
  type?: "single" | "multiple";
  value?: string | string[];
  defaultValue?: string | string[];
  onValueChange?: (value: string | string[]) => void;
  collapsible?: boolean;
  disabled?: boolean;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const { type = "single", value, collapsible, disabled, children, ...rest } = props;

  return AccordionFrame({
    ...rest,
    "data-type": type,
    "data-disabled": disabled ? "true" : undefined,
    children,
  });
}
Accordion.displayName = "Accordion";

const AccordionFrame = styled("div", {
  name: "AccordionFrame",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.3",
    overflow: "hidden",
  },
});

Accordion.Item = styled("div", {
  name: "AccordionItem",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    borderBottomWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
  },
});

Accordion.Trigger = styled("button", {
  name: "AccordionTrigger",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: 16,
    backgroundColor: "transparent",
    color: "$color",
    borderWidth: 0,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "left",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});

Accordion.Content = styled("div", {
  name: "AccordionContent",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    padding: 16,
    paddingTop: 0,
    overflow: "hidden",
  },
});
