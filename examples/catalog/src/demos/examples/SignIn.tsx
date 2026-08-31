import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, H1, Paragraph, SizableText, Button, Input, Label, Separator, Spinner, Card, useStableId } from "@jam/ui";
import type { ExampleDemos } from "../../types";
import { useDemoState } from "../state";
import { GithubIcon, FacebookIcon } from "./icons";

type Status = "idle" | "loading" | "success";

function useSignIn(): { status: Status; signIn: () => void } {
  const [status, setStatus] = useDemoState<Status>("signin.status", "idle");
  return {
    status: status as Status,
    signIn: () => {
      if (status !== "idle") return;
      setStatus("loading");
      setTimeout(() => setStatus("success"), 2000);
    },
  };
}

function Field({ id, label, placeholder, type, after }: { id: string; label: string; placeholder: string; type?: string; after?: VChild }) {
  return (
    <YStack gap="$space.1">
      <XStack alignItems="center" justifyContent="space-between">
        <Label htmlFor={id} size="$3">{label}</Label>
        {after}
      </XStack>
      <Input id={id} type={type} placeholder={placeholder} width="100%" />
    </YStack>
  );
}

function SignInScreen() {
  const { status, signIn } = useSignIn();
  const id = useStableId();
  return (
    <Card bordered elevate padding="$space.6" width="100%" maxWidth={420} alignSelf="center">
      <YStack gap="$space.4" alignItems="stretch">
        <H1 size="$8" alignSelf="center" margin={0} textAlign="center">Sign in to your account</H1>

        <YStack gap="$space.3">
          <Field id={`${id}-email`} label="Email" placeholder="email@example.com" type="email" />
          <Field
            id={`${id}-password`}
            label="Password"
            placeholder="Enter password"
            type="password"
            after={
              <SizableText tag="a" href="#" size="$1" color="$color11" hoverStyle={{ color: "$color12" }} textDecorationLine="none">
                Forgot your password?
              </SizableText>
            }
          />
        </YStack>

        <Button
          theme="accent"
          width="100%"
          disabled={status !== "idle"}
          onClick={signIn}
          iconAfter={status === "loading" ? <Spinner size="$1" color="$color" /> : undefined}
          data-testid="signin-submit"
        >
          {status === "success" ? "Signed in" : "Sign in"}
        </Button>

        <XStack alignItems="center" gap="$space.4">
          <Separator />
          <Paragraph margin={0} color="$color10">Or</Paragraph>
          <Separator />
        </XStack>

        <YStack gap="$space.3">
          <Button width="100%" icon={<GithubIcon size={16} />}>Continue with GitHub</Button>
          <Button width="100%" icon={<FacebookIcon size={16} color="var(--blue10)" />}>Continue with Facebook</Button>
        </YStack>

        <Paragraph margin={0} textAlign="center" color="$color11">
          Don't have an account?{" "}
          <SizableText tag="a" href="#" color="$color" textDecorationLine="underline" hoverStyle={{ color: "$colorHover" }}>
            Sign up
          </SizableText>
        </Paragraph>
      </YStack>
    </Card>
  );
}

export const SignInExample: ExampleDemos = {
  name: "Sign in",
  description: "A sign-in form: labelled inputs, an accent submit that shows a spinner while signing in, and social sign-in buttons.",
  demos: [
    {
      title: "Sign in screen",
      render: () => <SignInScreen />,
    },
    {
      title: "Signing in",
      description: "Pressing the button disables it and shows a spinner for two seconds.",
      render: () => <SignInScreen />,
      shot: { click: "signin-submit", wait: 300 },
    },
  ],
};
