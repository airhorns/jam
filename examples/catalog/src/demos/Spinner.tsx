import { h } from "@jam/core/jsx";
import { XStack, Spinner, Button } from "@jam/ui";
import type { ComponentDemos } from "../types";

export const SpinnerDemos: ComponentDemos = {
  name: "Spinner",
  group: "Feedback",
  demos: [
    {
      title: "Sizes and colors",
      render: () => (
        <XStack gap="$space.5" alignItems="center">
          <Spinner size="small" />
          <Spinner size="large" />
          <Spinner size="large" color="$blue9" />
          <Spinner size="large" color="$green9" />
        </XStack>
      ),
    },
    {
      title: "Inside a button",
      render: () => (
        <Button disabled>
          <Spinner size="small" />
          Saving…
        </Button>
      ),
    },
  ],
};
