import { styled } from "../styled";

/**
 * Card: content container with border and background.
 */
export const Card = styled("div", {
  name: "Card",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: "$background",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.4",
  },
  variants: {
    size: {
      "1": { padding: 8 },
      "2": { padding: 12 },
      "3": { padding: 16 },
      "4": { padding: 20 },
      "5": { padding: 24 },
    },
    bordered: {
      false: { borderWidth: 0 },
    },
    elevated: {
      true: { boxShadow: "0 2px 8px rgba(0,0,0,0.1)" },
    },
  },
  defaultVariants: {
    size: "3",
  },
}) as ReturnType<typeof styled> & {
  Header: ReturnType<typeof styled>;
  Footer: ReturnType<typeof styled>;
  Background: ReturnType<typeof styled>;
};

(Card as any).Header = styled("div", {
  name: "CardHeader",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 16,
  },
});

(Card as any).Footer = styled("div", {
  name: "CardFooter",
  defaultProps: {
    display: "flex",
    flexDirection: "row",
    gap: 8,
    padding: 16,
    justifyContent: "flex-end",
  },
});

(Card as any).Background = styled("div", {
  name: "CardBackground",
  defaultProps: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
    overflow: "hidden",
    borderRadius: "inherit",
  },
});
