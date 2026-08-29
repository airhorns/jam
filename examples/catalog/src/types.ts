import type { VChild } from "@jam/core/jsx";

/**
 * How `pnpm shots` should capture a demo whose interesting state needs
 * interaction (an open dialog, a hovered tooltip). Selectors are test ids.
 */
export type ShotRecipe = {
  click?: string | string[];
  hover?: string;
  focus?: string;
  /** Extra settle time in ms after interacting. */
  wait?: number;
};

export type Demo = {
  title: string;
  description?: string;
  render: () => VChild;
  shot?: ShotRecipe;
};

export type DemoGroup =
  | "Layout"
  | "Typography"
  | "Forms"
  | "Overlays"
  | "Content"
  | "Feedback"
  | "Navigation"
  | "Utilities";

export type ComponentDemos = {
  name: string;
  group: DemoGroup;
  description?: string;
  demos: Demo[];
};
