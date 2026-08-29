import { h } from "@jam/core/jsx";
import { Accordion, Paragraph, Text, XStack, YStack } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

const items = [
  { value: "a1", title: "Is it accessible?", body: "Yes. It follows the WAI-ARIA accordion pattern." },
  { value: "a2", title: "Is it unstyled?", body: "No. It comes with defaults you can override with style props." },
  { value: "a3", title: "Can it be animated?", body: "The indicator flips with the shared quick transition." },
];

const section = (item: { value: string; title: string; body: string }, extra: Record<string, unknown> = {}) => (
  <Accordion.Item key={item.value} value={item.value} {...extra}>
    <Accordion.Header>
      <Accordion.Trigger data-testid={`trigger-${item.value}`}>
        <Text>{item.title}</Text>
        <Accordion.Indicator />
      </Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content>
      <Paragraph margin={0}>{item.body}</Paragraph>
    </Accordion.Content>
  </Accordion.Item>
);

export const AccordionDemos: ComponentDemos = {
  name: "Accordion",
  group: "Content",
  description: "Collapsible sections, one open at a time or many.",
  demos: [
    {
      title: "Single, collapsible",
      description: "Pressing the open row closes it again.",
      render: () => {
        const [value, setValue] = useDemoState("accordion.value", "a1");
        return (
          <YStack gap="$space.3" width={440}>
            <Accordion type="single" value={value} onValueChange={setValue} collapsible data-testid="faq">
              {items.map((item) => section(item))}
            </Accordion>
            <Text opacity={0.6} data-testid="accordion-value">
              {value || "none"}
            </Text>
          </YStack>
        );
      },
      shot: { click: "trigger-a2" },
    },
    {
      title: "Multiple",
      render: () => (
        <Accordion type="multiple" defaultValue={["a1", "a3"]} width={440}>
          {items.map((item) => section(item))}
        </Accordion>
      ),
    },
    {
      title: "Sizes",
      render: () => (
        <XStack gap="$space.5" alignItems="flex-start">
          {["$2", "$3", "$5"].map((size) => (
            <Accordion key={size} type="single" defaultValue="a1" size={size} width={220}>
              {items.slice(0, 2).map((item) => section(item))}
            </Accordion>
          ))}
        </XStack>
      ),
    },
    {
      title: "Themed and disabled",
      render: () => (
        <XStack gap="$space.5" alignItems="flex-start">
          <Accordion type="single" defaultValue="a1" theme="blue" width={280}>
            {items.slice(0, 2).map((item) => section(item))}
          </Accordion>
          <Accordion type="single" defaultValue="a1" width={280}>
            {items.slice(0, 2).map((item, i) => section(item, i === 1 ? { disabled: true } : {}))}
          </Accordion>
          <Accordion type="single" defaultValue="a1" width={280} disabled>
            {items.slice(0, 2).map((item) => section(item))}
          </Accordion>
        </XStack>
      ),
    },
  ],
};
