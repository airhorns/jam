import { h } from "@jam/core/jsx";
import { YStack, Select, Text, Label } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

const fruits = ["Apple", "Banana", "Cherry", "Grape", "Mango", "Orange", "Peach", "Pear"];

export const SelectDemos: ComponentDemos = {
  name: "Select",
  group: "Forms",
  demos: [
    {
      title: "Controlled",
      render: () => {
        const [value, setValue] = useDemoState("select.value", "apple");
        return (
          <YStack gap="$space.3" width={260}>
            <Label htmlFor="fruit">Favourite fruit</Label>
            <Select value={value} onValueChange={setValue} id="fruit" data-testid="fruit-select">
              <Select.Trigger>
                <Select.Value placeholder="Pick a fruit" />
              </Select.Trigger>
              <Select.Content>
                <Select.Viewport>
                  <Select.Group>
                    <Select.Label>Fruits</Select.Label>
                    {fruits.map((f) => (
                      <Select.Item key={f} value={f.toLowerCase()}>
                        <Select.ItemText>{f}</Select.ItemText>
                        <Select.ItemIndicator>✓</Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Group>
                </Select.Viewport>
              </Select.Content>
            </Select>
            <Text opacity={0.6} data-testid="fruit-value">Selected: {value}</Text>
          </YStack>
        );
      },
    },
    {
      title: "Disabled",
      render: () => (
        <Select defaultValue="banana" disabled width={260}>
          <Select.Trigger><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Viewport>
              {fruits.slice(0, 3).map((f) => (
                <Select.Item key={f} value={f.toLowerCase()}><Select.ItemText>{f}</Select.ItemText></Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select>
      ),
    },
  ],
};
