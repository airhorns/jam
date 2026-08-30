import { h } from "@jam/core/jsx";
import { YStack, XStack, Form, Input, TextArea, Label, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const FormDemos: ComponentDemos = {
  name: "Form",
  group: "Forms",
  description: "A real `<form>` whose `onSubmit` runs instead of reloading the page. Form.Trigger is the submit button.",
  demos: [
    {
      title: "Basic form",
      render: () => {
        const [submitted, setSubmitted] = useDemoState("form.submitted", "");
        return (
          <Form
            maxWidth={380}
            onSubmit={(e: Event) => {
              const data = new FormData(e.target as HTMLFormElement);
              setSubmitted(`${data.get("name")} <${data.get("email")}>`);
            }}
            data-testid="basic-form"
          >
            <YStack gap="$space.2">
              <Label htmlFor="f-name">Name</Label>
              <Input id="f-name" name="name" placeholder="Ada Lovelace" />
            </YStack>
            <YStack gap="$space.2">
              <Label htmlFor="f-email">Email</Label>
              <Input id="f-email" name="email" type="email" placeholder="ada@example.com" />
            </YStack>
            <YStack gap="$space.2">
              <Label htmlFor="f-msg">Message</Label>
              <TextArea id="f-msg" name="message" placeholder="Say hello" />
            </YStack>
            <XStack gap="$space.3" justifyContent="flex-end">
              <Button type="reset" variant="outlined">Reset</Button>
              <Form.Trigger asChild>
                <Button theme="accent">Submit</Button>
              </Form.Trigger>
            </XStack>
            {submitted ? <Text opacity={0.6} data-testid="form-result">Submitted: {submitted}</Text> : null}
          </Form>
        );
      },
    },
    {
      title: "Trigger",
      description: "Form.Trigger is a Button with type=\"submit\", so it takes every Button prop; `asChild` merges onto your own button instead.",
      render: () => (
        <Form maxWidth={380} gap="$space.3">
          <Input name="q" placeholder="Enter submits too" />
          <XStack gap="$space.3" flexWrap="wrap">
            <Form.Trigger>Default</Form.Trigger>
            <Form.Trigger size="$3" variant="outlined">Outlined</Form.Trigger>
            <Form.Trigger theme="accent">Themed</Form.Trigger>
            <Form.Trigger disabled>Disabled</Form.Trigger>
          </XStack>
        </Form>
      ),
    },
    {
      title: "Inline form",
      render: () => (
        <Form flexDirection="row" gap="$space.3" alignItems="flex-end" maxWidth={420}>
          <YStack gap="$space.2" flexGrow={1}>
            <Label htmlFor="f-inline">Search</Label>
            <Input id="f-inline" name="q" type="search" placeholder="Anything" />
          </YStack>
          <Form.Trigger theme="accent">Go</Form.Trigger>
        </Form>
      ),
    },
  ],
};
