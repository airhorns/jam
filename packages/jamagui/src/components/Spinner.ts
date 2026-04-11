import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

let spinnerKeyframesInjected = false;

function injectSpinnerKeyframes(): void {
  if (spinnerKeyframesInjected || typeof document === "undefined") return;
  spinnerKeyframesInjected = true;

  const style = document.createElement("style");
  style.textContent = `@keyframes _jui_spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

/**
 * Spinner: CSS-animated loading indicator.
 */
export function Spinner(props: {
  size?: string;
  color?: string;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode {
  injectSpinnerKeyframes();

  const { size = "3", color, ...rest } = props;

  const sizeMap: Record<string, number> = {
    "1": 16, "2": 20, "3": 24, "4": 32, "5": 40,
  };
  const dim = sizeMap[size] ?? 24;

  return SpinnerFrame({
    ...rest,
    width: dim,
    height: dim,
    borderWidth: 2,
    borderColor: color || "$borderColor",
    borderTopColor: color || "$color",
  });
}
Spinner.displayName = "Spinner";

const SpinnerFrame = styled("div", {
  name: "SpinnerFrame",
  defaultProps: {
    display: "inline-flex",
    borderRadius: 100000,
    borderStyle: "solid",
    // Animation applied via inline style since we can't easily set animation through the token system
  },
});
