import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Switch: toggle switch control.
 *
 * Usage:
 *   <Switch checked={isOn} onCheckedChange={(v) => setOn(v)}>
 *     <Switch.Thumb />
 *   </Switch>
 */
export function Switch(props: {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  size?: string;
  id?: string;
  children?: VChild | VChild[];
  class?: string;
  [key: string]: unknown;
}): VNode | null {
  const {
    checked = false,
    onCheckedChange,
    disabled = false,
    size = "3",
    children,
    ...rest
  } = props;

  const sizeMap: Record<string, { w: number; h: number; thumb: number }> = {
    "1": { w: 28, h: 16, thumb: 12 },
    "2": { w: 36, h: 20, thumb: 16 },
    "3": { w: 44, h: 24, thumb: 20 },
    "4": { w: 52, h: 28, thumb: 24 },
    "5": { w: 60, h: 32, thumb: 28 },
  };
  const dims = sizeMap[size] ?? sizeMap["3"];

  return SwitchFrame({
    ...rest,
    role: "switch",
    "aria-checked": checked ? "true" : "false",
    "aria-disabled": disabled ? "true" : undefined,
    width: dims.w,
    height: dims.h,
    backgroundColor: checked ? "$backgroundFocus" : "$borderColor",
    onClick: disabled ? undefined : () => onCheckedChange?.(!checked),
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    children: h("div", {
      class: "switch-thumb",
      style: `width:${dims.thumb}px;height:${dims.thumb}px;border-radius:50%;background:white;transform:translateX(${checked ? dims.w - dims.thumb - 4 : 2}px);transition:transform 0.15s ease`,
    }),
  });
}
Switch.displayName = "Switch";

const SwitchFrame = styled("div", {
  name: "SwitchFrame",
  defaultProps: {
    display: "flex",
    alignItems: "center",
    borderRadius: 100000,
    position: "relative",
    padding: 2,
    userSelect: "none",
    transition: "background-color 0.15s ease",
  },
});

/**
 * Switch.Thumb: the sliding thumb indicator.
 */
Switch.Thumb = styled("div", {
  name: "SwitchThumb",
  defaultProps: {
    borderRadius: 100000,
    backgroundColor: "white",
  },
});
