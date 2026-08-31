import { h } from "@jam/core/jsx";
import { XStack, YStack, Checkbox, Label, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

const checkboxStates: Array<{ label: string; checked: boolean | "indeterminate"; disabled?: boolean }> = [
  { label: "Unchecked", checked: false },
  { label: "Checked", checked: true },
  { label: "Indeterminate", checked: "indeterminate" },
  { label: "Disabled", checked: true, disabled: true },
  { label: "Disabled unchecked", checked: false, disabled: true },
];

export const CheckboxDemos: ComponentDemos = {
  name: "Checkbox",
  group: "Forms",
  description: "A role=checkbox button with checked, unchecked and mixed states.",
  demos: [
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.4" alignItems="center">
          {["$1", "$2", "$3", "$4", "$5", "$6"].map((size) => (
            <Checkbox key={size} size={size} checked aria-label={`Size ${size}`}>
              <Checkbox.Indicator />
            </Checkbox>
          ))}
        </XStack>
      ),
    },
    {
      title: "States",
      render: () => (
        <YStack gap="$space.3">
          {checkboxStates.map(({ label, checked, disabled }) => (
            <XStack key={label} gap="$space.3" alignItems="center">
              <Checkbox id={`checkbox-${label}`} checked={checked} disabled={disabled}>
                <Checkbox.Indicator />
              </Checkbox>
              <Label htmlFor={`checkbox-${label}`}>{label}</Label>
            </XStack>
          ))}
        </YStack>
      ),
    },
    {
      title: "Custom indicator",
      description: "The indicator renders its children instead of the default check.",
      render: () => (
        <XStack gap="$space.4" alignItems="center">
          <Checkbox checked size="$5" aria-label="Starred">
            <Checkbox.Indicator>★</Checkbox.Indicator>
          </Checkbox>
          <Checkbox checked size="$5" theme="accent" aria-label="Accent">
            <Checkbox.Indicator />
          </Checkbox>
          <Checkbox checked size="$5" borderRadius={100000} aria-label="Round">
            <Checkbox.Indicator />
          </Checkbox>
        </XStack>
      ),
    },
    {
      title: "Controlled with label",
      render: () => {
        const [checked, setChecked] = useDemoState("checkbox.checked", false);
        return (
          <XStack gap="$space.3" alignItems="center">
            <Checkbox
              id="terms"
              checked={checked}
              onCheckedChange={(next) => setChecked(next === true)}
              data-testid="terms-checkbox"
            >
              <Checkbox.Indicator />
            </Checkbox>
            <Label htmlFor="terms">Accept terms and conditions</Label>
            <Text opacity={0.6} data-testid="terms-state">
              {checked ? "checked" : "unchecked"}
            </Text>
          </XStack>
        );
      },
      shot: { click: "terms-checkbox" },
    },
  ],
};
