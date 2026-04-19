import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { styled } from "../styled";

/**
 * Slider: range input control.
 *
 * Usage:
 *   <Slider value={[50]} min={0} max={100} onValueChange={(v) => setValue(v)}>
 *     <Slider.Track>
 *       <Slider.TrackActive />
 *     </Slider.Track>
 *     <Slider.Thumb index={0} />
 *   </Slider>
 */
export function Slider(props: {
  value?: number[];
  defaultValue?: number[];
  min?: number;
  max?: number;
  step?: number;
  orientation?: "horizontal" | "vertical";
  onValueChange?: (value: number[]) => void;
  disabled?: boolean;
  size?: string;
  children?: VChild | VChild[];
  [key: string]: unknown;
}): VNode | null {
  const {
    value = [0],
    min = 0,
    max = 100,
    step = 1,
    orientation = "horizontal",
    onValueChange,
    disabled = false,
    size = "3",
    children,
    ...rest
  } = props;

  return SliderFrame({
    ...rest,
    role: "slider",
    "aria-valuemin": String(min),
    "aria-valuemax": String(max),
    "aria-valuenow": String(value[0]),
    "aria-orientation": orientation,
    "aria-disabled": disabled ? "true" : undefined,
    "data-orientation": orientation,
    flexDirection: orientation === "horizontal" ? "row" : "column",
    children,
  });
}
Slider.displayName = "Slider";

const SliderFrame = styled("div", {
  name: "SliderFrame",
  defaultProps: {
    display: "flex",
    position: "relative",
    alignItems: "center",
    width: "100%",
    userSelect: "none",
  },
});

/**
 * Slider.Track: background rail.
 */
Slider.Track = styled("div", {
  name: "SliderTrack",
  defaultProps: {
    display: "flex",
    position: "relative",
    flexGrow: 1,
    height: 4,
    borderRadius: 100000,
    backgroundColor: "$borderColor",
    overflow: "hidden",
  },
});

/**
 * Slider.TrackActive: filled portion of the track.
 */
Slider.TrackActive = styled("div", {
  name: "SliderTrackActive",
  defaultProps: {
    position: "absolute",
    top: 0,
    left: 0,
    height: "100%",
    backgroundColor: "$color",
    borderRadius: 100000,
  },
});

/**
 * Slider.Thumb: draggable handle.
 */
Slider.Thumb = styled("div", {
  name: "SliderThumb",
  defaultProps: {
    display: "flex",
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 100000,
    backgroundColor: "$background",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: "$color",
    cursor: "pointer",
    hoverStyle: {
      backgroundColor: "$backgroundHover",
    },
  },
});
