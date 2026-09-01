import { createContext, h, useContext } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { injectRule } from "../css";
import { styled } from "../styled";
import type { StyledProps, VariantFunction } from "../styled";
import { tokenValue } from "../variants";
import { Stack } from "./Stacks";

const SWEEP = "jam-ui-progress-sweep";

// An indeterminate bar has no value to position it by, so it sweeps instead.
// The attribute selector outranks the atomic transform class.
function injectProgressRules(): void {
  injectRule(
    `@keyframes ${SWEEP}`,
    `@keyframes ${SWEEP} { from { transform: translateX(-100%) } to { transform: translateX(250%) } }`,
  );
  injectRule(
    "jam-ui-progress-indeterminate",
    `.is_ProgressIndicator[data-state="indeterminate"] { animation: ${SWEEP} 1.4s ease-in-out infinite }`,
  );
}

export const ProgressContext = createContext<{ value: number | null; max: number }>({ value: null, max: 100 });

/** Only runs for literal numbers and size tokens that exist, so the lookup always resolves. */
const progressSized: VariantFunction = (value, { tokens }) => {
  const height = Math.round(tokenValue(tokens, "size", value)! * 0.25);
  return { height, minWidth: height * 20, width: "100%" };
};

export type ProgressProps = StyledProps & {
  /** Progress so far; leave unset for an indeterminate bar. */
  value?: number | null;
  max?: number;
  /** Builds `aria-valuetext`; the default is the percentage of `max`. */
  getValueLabel?: (value: number, max: number) => string;
  size?: string | number;
  unstyled?: boolean;
};

export const ProgressFrame = styled<ProgressProps>(Stack, {
  name: "Progress",
  variants: {
    unstyled: {
      false: {
        size: "$true",
        borderRadius: 100_000,
        overflow: "hidden",
        backgroundColor: "$background",
      },
    },

    size: {
      "...size": progressSized,
      ":number": progressSized,
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

export const ProgressIndicatorFrame = styled(Stack, {
  name: "ProgressIndicator",
  variants: {
    unstyled: {
      false: {
        height: "100%",
        // Twice the track's width, so an overshooting animation still covers it.
        width: "200%",
        backgroundColor: "$background",
      },
    },
  },
  defaultVariants: {
    unstyled: false,
  },
});

const progressState = (value: number | null, max: number): string =>
  value == null ? "indeterminate" : value >= max ? "complete" : "loading";

/** Progress.Indicator: the filled part. Its width comes from the Progress value. */
function ProgressIndicator(props: StyledProps): VNode {
  injectProgressRules();
  const { value, max } = useContext(ProgressContext);
  const ratio = value == null ? 0 : Math.min(1, Math.max(0, value / max));
  // The sweep's keyframes take over the transform while it runs; the inline
  // value is where the bar rests when animations are off.
  const position = value == null ? { width: "40%", x: "75%" } : { x: `${-100 + ratio * 50}%` };
  return h(ProgressIndicatorFrame, {
    "data-state": progressState(value, max),
    ...(value == null ? null : { "data-value": value }),
    "data-max": max,
    ...position,
    ...(props as Record<string, unknown>),
  });
}
ProgressIndicator.displayName = "ProgressIndicator";

const percentValueLabel = (value: number, max: number): string => `${Math.round((value / max) * 100)}%`;

const toArray = (children: VChild | VChild[] | undefined): VChild[] =>
  children == null ? [] : Array.isArray(children) ? children : [children];

/**
 * Progress: a track whose `Progress.Indicator` child fills to `value` out of
 * `max`. With no `value` the indicator sweeps to show indeterminate progress.
 */
function ProgressComponent(props: ProgressProps): VNode {
  const { value, max: maxProp, getValueLabel = percentValueLabel, children, ...rest } = props;
  // Only a positive number is a usable maximum; anything else falls back to 100.
  const max = typeof maxProp === "number" && !Number.isNaN(maxProp) && maxProp > 0 ? maxProp : 100;
  const current = typeof value === "number" && !Number.isNaN(value) ? Math.min(max, Math.max(0, value)) : null;

  const aria: Record<string, unknown> = {
    role: "progressbar",
    "aria-valuemin": 0,
    "aria-valuemax": max,
    "data-state": progressState(current, max),
    "data-max": max,
  };
  if (current !== null) {
    aria["aria-valuenow"] = current;
    aria["aria-valuetext"] = getValueLabel(current, max);
    aria["data-value"] = current;
  }

  return h(
    ProgressFrame,
    { ...aria, ...(rest as Record<string, unknown>) },
    h(ProgressContext.Provider, { value: { value: current, max } }, ...toArray(children)),
  );
}
ProgressComponent.displayName = "Progress";

export const Progress = Object.assign(ProgressComponent, {
  Indicator: ProgressIndicator,
  Frame: ProgressFrame,
  staticConfig: ProgressFrame.staticConfig,
});
