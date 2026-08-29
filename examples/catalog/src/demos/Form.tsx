import { h } from "@jam/core/jsx";
import { YStack, XStack, Form, Input, TextArea, Label, Button, Text } from "@jam/ui";
import type { ComponentDemos } from "../types";
import { useDemoState } from "./state";

export const FormDemos: ComponentDemos = {
  name: "Form",
  group: "Forms",
  demos: [
    {
      title: "Basic form",
      render: () => {
        const [submitted, setSubmitted] = useDemoState("form.submitted", "");
        return (
          <Form
            maxWidth={380}
            onSubmit={(e: Event) => {
              e.preventDefault();
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
  ],
};
