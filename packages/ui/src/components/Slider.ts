import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { createStyledContext, styled } from "../styled";
import type { StyledProps, VariantExtras } from "../styled";
import { tokenValue } from "../variants";
import { getTokens } from "../tokens";
import { useControllableState } from "../state";

export type SliderOrientation = "horizontal" | "vertical";

/** Size and orientation flow from the Slider to its track, fill and thumbs. */
export const SliderContext = createStyledContext<{
  size?: string | number;
  orientation?: SliderOrientation;
}>({
  size: undefined,
  orientation: undefined,
});

type SliderStateValue = {
  values: number[];
  min: number;
  max: number;
  orientation: SliderOrientation;
  disabled: boolean;
  /** Position of a value along the track, 0–100. */
  percent: (value: number) => number;
  setAt: (index: number, value: number) => void;
  nudge: (index: number, steps: number | "min" | "max") => number[];
  slideEnd: (values: number[]) => void;
};

const SliderState = createContext<SliderStateValue>({
  values: [0],
  min: 0,
  max: 100,
  orientation: "horizontal",
  disabled: false,
  percent: () => 0,
  setAt: () => {},
  nudge: () => [],
  slideEnd: () => {},
});

const sizeToken = (value: unknown, tokens: VariantExtras["tokens"]): number =>
  tokenValue(tokens, "size", value ?? "$true") ?? tokenValue(tokens, "size", "$true") ?? 44;

/** tamagui's ratios: a thin rail with a knob a little under half the size token. */
const railSize = (token: number) => Math.max(4, Math.round(token / 6));
const knobSize = (token: number) => Math.round(token * 0.45);

export const SliderFrame = styled("div", {
  name: "Slider",
  context: SliderContext,
  defaultProps: {
    position: "relative",
    display: "flex",
    boxSizing: "border-box",
    touchAction: "none",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        userSelect: "none",
        cursor: "pointer",
        disabledStyle: {
          opacity: 0.5,
          cursor: "not-allowed",
        },
      },
    },

    orientation: {
      horizontal: { flexDirection: "row", alignItems: "center", width: "100%" },
      vertical: { flexDirection: "column", alignItems: "center", justifyContent: "center", height: "$12" },
    },

    size: {
      "...size": (value, { tokens, props }) => {
        const knob = knobSize(sizeToken(value, tokens));
        return props.orientation === "vertical" ? { width: knob, minWidth: knob } : { height: knob, minHeight: knob };
      },
      ":number": (value: number, { props }) => {
        const knob = knobSize(value);
        return props.orientation === "vertical" ? { width: knob, minWidth: knob } : { height: knob, minHeight: knob };
      },
    },
  },
  defaultVariants: {
    unstyled: false,
    orientation: "horizontal",
  },
});

export const SliderTrackFrame = styled("div", {
  name: "SliderTrack",
  context: SliderContext,
  defaultProps: {
    position: "relative",
    boxSizing: "border-box",
    overflow: "hidden",
  },
  variants: {
    unstyled: {
      false: {
        size: "$true",
        borderRadius: 100_000,
        backgroundColor: "$background",
      },
    },
    orientation: {
      horizontal: { width: "100%" },
      vertical: { height: "100%" },
    },
    size: {
      "...size": (value, { tokens, props }) => {
        const rail = railSize(sizeToken(value, tokens));
        return props.orientation === "vertical" ? { width: rail } : { height: rail };
      },
      ":number": (value: number, { props }) => {
        const rail = railSize(value);
        return props.orientation === "vertical" ? { width: rail } : { height: rail };
      },
    },
  },
  defaultVariants: {
    unstyled: false,
    orientation: "horizontal",
  },
});

export const SliderActiveFrame = styled("div", {
  name: "SliderActive",
  context: SliderContext,
  defaultProps: {
    position: "absolute",
    boxSizing: "border-box",
  },
  variants: {
    unstyled: {
      false: {
        backgroundColor: "$color10",
      },
    },
    orientation: {
      horizontal: { top: 0, height: "100%" },
      vertical: { left: 0, width: "100%" },
    },
  },
  defaultVariants: {
    unstyled: false,
    orientation: "horizontal",
  },
});

export const SliderThumbFrame = styled("button", {
  name: "SliderThumb",
  context: SliderContext,
  defaultProps: {
    type: "button",
    role: "slider",
    position: "absolute",
    boxSizing: "border-box",
  },
  variants: {
    unstyled: {
      true: {
        borderWidth: 0,
        outlineWidth: 0,
        backgroundColor: "transparent",
        padding: 0,
      },
      false: {
        size: "$true",
        display: "block",
        padding: 0,
        borderRadius: 100_000,
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: "$color8",
        backgroundColor: "$background",
        cursor: "grab",
        hoverStyle: {
          borderColor: "$color10",
        },
        focusVisibleStyle: {
          outlineColor: "$outlineColor",
          outlineStyle: "solid",
          outlineWidth: 2,
          outlineOffset: 2,
        },
        disabledStyle: {
          cursor: "not-allowed",
        },
      },
    },
    size: {
      "...size": (value, { tokens }) => {
        const knob = knobSize(sizeToken(value, tokens));
        return { width: knob, height: knob };
      },
      ":number": (value: number) => ({ width: knobSize(value), height: knobSize(value) }),
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export type SliderTrackProps = StyledProps & {
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
};

/** The rail the thumbs run along; put `Slider.TrackActive` inside it. */
function SliderTrackComponent(props: SliderTrackProps): VNode {
  const { orientation } = useContext(SliderState);
  return h(SliderTrackFrame, { orientation, ...(props as Record<string, unknown>) });
}
SliderTrackComponent.displayName = "Slider.Track";

export type SliderTrackActiveProps = StyledProps & {
  unstyled?: boolean;
};

/**
 * The filled part of the rail: from the start of the track to the only thumb,
 * or between the first and last thumbs of a range.
 */
function SliderTrackActiveComponent(props: SliderTrackActiveProps): VNode {
  const { values, percent, orientation } = useContext(SliderState);
  const start = values.length > 1 ? percent(values[0]) : 0;
  const end = percent(values[values.length - 1]);
  const span = Math.max(0, end - start);
  const style =
    orientation === "vertical" ? { bottom: `${start}%`, height: `${span}%` } : { left: `${start}%`, width: `${span}%` };
  return h(SliderActiveFrame, { orientation, ...(props as Record<string, unknown>), style });
}
SliderTrackActiveComponent.displayName = "Slider.TrackActive";

export type SliderThumbProps = StyledProps & {
  /** Which value this thumb controls; `0` unless the slider is a range. */
  index?: number;
  size?: string | number;
  unstyled?: boolean;
  onKeyDown?: (event: KeyboardEvent) => void;
};

/** A draggable knob; also the keyboard control for its value. */
function SliderThumbComponent(props: SliderThumbProps): VNode {
  const { index = 0, onKeyDown, ...frameProps } = props;
  const state = useContext(SliderState);
  const inherited = SliderContext.useStyledContext();
  const size = props.size ?? inherited.size;
  const knob = typeof size === "number" ? knobSize(size) : knobSize(sizeToken(size, getTokens()));
  const value = state.values[index] ?? state.min;
  const at = state.percent(value);
  const vertical = state.orientation === "vertical";
  // Pulling back by a share of the knob keeps it inside the track at both ends
  // while its centre still lands on the value in the middle of the range.
  const inset = Math.round(knob * at) / 100;

  return h(SliderThumbFrame, {
    ...(frameProps as Record<string, unknown>),
    disabled: state.disabled || undefined,
    "aria-valuemin": state.min,
    "aria-valuemax": state.max,
    "aria-valuenow": value,
    "aria-orientation": state.orientation,
    "data-index": index,
    style: vertical
      ? { bottom: `calc(${at}% - ${inset}px)`, left: "50%" }
      : { left: `calc(${at}% - ${inset}px)`, top: "50%" },
    x: vertical ? "-50%" : undefined,
    y: vertical ? undefined : "-50%",
    onKeyDown: (event: KeyboardEvent) => {
      onKeyDown?.(event);
      if (state.disabled) return;
      const steps = keySteps(event.key);
      if (steps === undefined) return;
      event.preventDefault();
      state.slideEnd(state.nudge(index, steps));
    },
  });
}
SliderThumbComponent.displayName = "Slider.Thumb";

function keySteps(key: string): number | "min" | "max" | undefined {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return -1;
    case "ArrowRight":
    case "ArrowUp":
      return 1;
    case "PageDown":
      return -10;
    case "PageUp":
      return 10;
    case "Home":
      return "min";
    case "End":
      return "max";
    default:
      return undefined;
  }
}

export type SliderProps = StyledProps & {
  value?: number | number[];
  defaultValue?: number | number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange?: (value: number[]) => void;
  /** Called once when a drag or a keypress finishes. */
  onSlideEnd?: (value: number[]) => void;
  orientation?: SliderOrientation;
  disabled?: boolean;
  size?: string | number;
  unstyled?: boolean;
  children?: VChild | VChild[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toArray = (value: number | number[] | undefined, fallback: number): number[] =>
  value === undefined ? [fallback] : Array.isArray(value) ? value : [value];

/**
 * Slider: one or more thumbs on a track. Press anywhere on the slider to move
 * the nearest thumb there and start dragging; the arrow, Page and Home/End
 * keys move the focused thumb by whole steps.
 */
function SliderComponent(props: SliderProps): VNode {
  const {
    defaultValue,
    min = 0,
    max = 100,
    step = 1,
    onValueChange,
    onSlideEnd,
    orientation = "horizontal",
    children,
    ...frameProps
  } = props;

  const [json, setJson] = useControllableState<string>("value", {
    value: props.value === undefined ? undefined : JSON.stringify(toArray(props.value, min)),
    defaultValue: JSON.stringify(toArray(defaultValue, min)),
    onChange: onValueChange ? (next) => onValueChange(JSON.parse(next) as number[]) : undefined,
  });
  const values = JSON.parse(json ?? "[]") as number[];
  const disabled = props.disabled === true;

  const snap = (value: number): number => {
    const steps = Math.round((clamp(value, min, max) - min) / step);
    const snapped = min + steps * step;
    const decimals = (String(step).split(".")[1] ?? "").length;
    return clamp(decimals > 0 ? Number(snapped.toFixed(decimals)) : snapped, min, max);
  };

  const commit = (index: number, value: number): number[] => {
    const next = [...values];
    const lower = index > 0 ? next[index - 1] : min;
    const upper = index < next.length - 1 ? next[index + 1] : max;
    next[index] = clamp(snap(value), lower, upper);
    setJson(JSON.stringify(next));
    return next;
  };

  const state: SliderStateValue = {
    values,
    min,
    max,
    orientation,
    disabled,
    percent: (value) => ((clamp(value, min, max) - min) / (max - min || 1)) * 100,
    setAt: (index, value) => {
      commit(index, value);
    },
    nudge: (index, steps) => {
      const current = values[index] ?? min;
      if (steps === "min") return commit(index, min);
      if (steps === "max") return commit(index, max);
      return commit(index, current + steps * step);
    },
    slideEnd: (next) => onSlideEnd?.(next),
  };

  const valueFromPoint = (rect: DOMRect, clientX: number, clientY: number): number => {
    const span = orientation === "vertical" ? rect.height : rect.width;
    if (span <= 0) return min;
    const ratio =
      orientation === "vertical" ? 1 - (clientY - rect.top) / rect.height : (clientX - rect.left) / rect.width;
    return min + clamp(ratio, 0, 1) * (max - min);
  };

  const closestIndex = (value: number): number => {
    let best = 0;
    for (let i = 1; i < values.length; i++) {
      if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) best = i;
    }
    return best;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (disabled || (event.button != null && event.button !== 0)) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const raw = valueFromPoint(rect, event.clientX, event.clientY);
    const index = closestIndex(raw);
    let latest = commit(index, raw);
    const move = (moveEvent: PointerEvent) => {
      latest = commit(index, valueFromPoint(rect, moveEvent.clientX, moveEvent.clientY));
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      onSlideEnd?.(latest);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  return h(
    SliderFrame,
    {
      ...(frameProps as Record<string, unknown>),
      orientation,
      "aria-orientation": orientation,
      "data-orientation": orientation,
      "data-disabled": disabled ? "" : undefined,
      onPointerDown,
    },
    h(SliderState.Provider, { value: state }, ...(([] as VChild[]).concat(children ?? []))),
  );
}
SliderComponent.displayName = "Slider";

export const Slider = Object.assign(SliderComponent, {
  Frame: SliderFrame,
  Track: SliderTrackComponent,
  TrackActive: SliderTrackActiveComponent,
  Thumb: SliderThumbComponent,
  /** Provide `size`/`orientation` to every Slider beneath. */
  Apply: SliderContext.Provider,
});
