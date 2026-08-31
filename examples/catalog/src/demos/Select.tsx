import { h } from "@jam/core/jsx";
import { XStack, YStack, Select, Text, Label, Button } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

const fruits = ["Apple", "Banana", "Blueberry", "Cherry", "Grape", "Mango", "Orange", "Peach", "Pear"];

const teams = {
  Engineering: ["Platform", "Mobile", "Web"],
  Design: ["Brand", "Product design"],
  Operations: ["Finance", "People"],
};

// Items are plain vnodes (not a component) so Select can read their labels from its children.
function fruitItems(disabled: string[] = []) {
  return fruits.map((fruit) => (
    <Select.Item key={fruit} value={fruit.toLowerCase()} disabled={disabled.includes(fruit)}>
      <Select.ItemText>{fruit}</Select.ItemText>
      <Select.ItemIndicator />
    </Select.Item>
  ));
}

export const SelectDemos: ComponentDemos = {
  name: "Select",
  demos: [
    {
      title: "Controlled",
      shot: { click: "fruit-select-trigger" },
      render: () => {
        const [value, setValue] = useDemoState("select.value", "banana");
        return (
          <YStack gap="$2" width={260}>
            <Label htmlFor="fruit">Favourite fruit</Label>
            <Select value={value} onValueChange={setValue} name="fruit" id="fruit">
              <Select.Trigger data-testid="fruit-select-trigger">
                <Select.Value placeholder="Pick a fruit" />
              </Select.Trigger>
              <Select.Content>
                <Select.Viewport>
                  <Select.Group>
                    <Select.Label>Fruits</Select.Label>
                    {fruitItems(["Grape"])}
                  </Select.Group>
                </Select.Viewport>
              </Select.Content>
            </Select>
            <Text size="$2" color="$color10" data-testid="fruit-value">Selected: {value}</Text>
          </YStack>
        );
      },
    },
    {
      title: "Sizes and states",
      render: () => (
        <XStack gap="$3" flexWrap="wrap" alignItems="flex-end">
          {(["$2", "$3", "$4", "$5"] as const).map((size) => (
            <Select key={size} size={size} defaultValue="cherry">
              <Select.Trigger width={150} aria-label={`Size ${size}`}>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Viewport>
                  {fruitItems()}
                </Select.Viewport>
              </Select.Content>
            </Select>
          ))}
          <Select defaultValue="banana" disabled>
            <Select.Trigger width={150} aria-label="Disabled">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Viewport>
                {fruitItems()}
              </Select.Viewport>
            </Select.Content>
          </Select>
          <Select>
            <Select.Trigger width={150} aria-label="Empty">
              <Select.Value placeholder="Placeholder" />
            </Select.Trigger>
            <Select.Content>
              <Select.Viewport>
                {fruitItems()}
              </Select.Viewport>
            </Select.Content>
          </Select>
        </XStack>
      ),
    },
    {
      title: "Grouped options on a custom trigger",
      shot: { click: "team-select-trigger" },
      render: () => {
        const [team, setTeam] = useDemoState("select.team", "");
        return (
          <Select value={team || undefined} onValueChange={setTeam} placement="bottom-end">
            <Select.Trigger asChild>
              <Button variant="outlined" data-testid="team-select-trigger" iconAfter="▾" aria-label="Team">
                <Select.Value placeholder="Assign to a team…" />
              </Button>
            </Select.Trigger>
            <Select.Content width={240}>
              <Select.Viewport>
                {Object.entries(teams).map(([department, names]) => (
                  <Select.Group key={department}>
                    <Select.Label>{department}</Select.Label>
                    {names.map((name) => (
                      <Select.Item key={name} value={name.toLowerCase()}>
                        <Select.ItemText>{name}</Select.ItemText>
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Group>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select>
        );
      },
    },
  ],
};
