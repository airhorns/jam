import { h } from "@jam/core/jsx";
import { Accordion, Paragraph, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";

const items = [
  { value: "a1", title: "Is it accessible?", body: "Yes. It adheres to the WAI-ARIA design pattern." },
  { value: "a2", title: "Is it unstyled?", body: "No. It comes with sensible defaults you can override with style props." },
  { value: "a3", title: "Can it be animated?", body: "Yes. Content height transitions when opening and closing." },
];

export const AccordionDemos: ComponentDemos = {
  name: "Accordion",
  group: "Content",
  demos: [
    {
      title: "Single, collapsible",
      render: () => (
        <Accordion type="single" defaultValue="a1" collapsible width={400} data-testid="faq">
          {items.map((item) => (
            <Accordion.Item key={item.value} value={item.value}>
              <Accordion.Trigger>
                <Text>{item.title}</Text>
                <Text opacity={0.5}>▾</Text>
              </Accordion.Trigger>
              <Accordion.Content>
                <Paragraph margin={0}>{item.body}</Paragraph>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion>
      ),
    },
    {
      title: "Multiple",
      render: () => (
        <Accordion type="multiple" defaultValue={["a1", "a3"]} width={400}>
          {items.map((item) => (
            <Accordion.Item key={item.value} value={item.value}>
              <Accordion.Trigger>
                <Text>{item.title}</Text>
                <Text opacity={0.5}>▾</Text>
              </Accordion.Trigger>
              <Accordion.Content>
                <Paragraph margin={0}>{item.body}</Paragraph>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion>
      ),
    },
  ],
};
