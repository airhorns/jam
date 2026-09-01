import type { VChild } from "@jam/core/jsx";
import type { ComponentDoc, DocGroup } from "@jam/ui/docs";

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

export type DemoGroup = DocGroup | "Examples";

/** Demos for a documented component. Its group, description and docs come from `components/<name>.md` in the jam-ui skill. */
export type ComponentDemos = {
  name: string;
  demos: Demo[];
};

/** A composition showcase in the Examples group; it has no reference doc. */
export type ExampleDemos = {
  name: string;
  description: string;
  demos: Demo[];
};

/** One sidebar entry: a documented component with its demos, or an example. */
export type CatalogEntry = {
  name: string;
  group: DemoGroup;
  description: string;
  demos: Demo[];
  doc?: ComponentDoc;
};
