import { h } from "@jam/core/jsx";
import type { VNode } from "@jam/core/jsx";
import { XStack, YStack, H2, Paragraph, SizableText, Button, Input, Label, Checkbox, Progress, Separator, ScrollView, Circle, useStableId, rovingFocus } from "@jam/ui";
import type { ExampleDemos } from "../../types";
import { useDemoState } from "../state";
import { PhoneFrame } from "./shared";
import type { IconProps } from "./icons";
import { ArrowLeftIcon, ArrowRightIcon, AppleIcon, BellIcon, MailIcon, ShieldIcon, ZapIcon } from "./icons";

type Step = { theme: string; Icon: (props: IconProps) => VNode; title: string; body: string };

const steps: Step[] = [
  { theme: "blue", Icon: ZapIcon, title: "Fast by default", body: "Everything you do syncs across your devices the moment it happens, even when you're offline." },
  { theme: "green", Icon: ShieldIcon, title: "Private and secure", body: "Your notes are encrypted end to end. Nobody but you can read them, and that includes us." },
  { theme: "purple", Icon: BellIcon, title: "Never miss a beat", body: "Reminders that learn when you actually want a nudge, and stay quiet when you don't." },
];

function Link({ children }: { children: string }) {
  return (
    <SizableText tag="a" href="#" size="$3" color="$color" textDecorationLine="underline" hoverStyle={{ color: "$colorHover" }}>
      {children}
    </SizableText>
  );
}

function Illustration({ step }: { step: Step }) {
  return (
    <Circle size={220} theme={step.theme} backgroundColor="$color3" color="$color10" animation="quick" enterStyle={{ opacity: 0, scale: 0.9 }}>
      <Circle size={148} backgroundColor="$color5">
        <step.Icon size={72} strokeWidth={1.5} />
      </Circle>
    </Circle>
  );
}

function Walkthrough() {
  const [step, setStep] = useDemoState("onboarding.step", 0);
  const current = steps[step];
  const last = step === steps.length - 1;
  return (
    <PhoneFrame>
      <YStack flex={1} padding="$space.5" gap="$space.4">
        <XStack alignItems="center" gap="$space.4">
          <Progress value={step + 1} max={steps.length} size="$1" flex={1} aria-label="Walkthrough progress">
            <Progress.Indicator backgroundColor="$color" animation="quick" />
          </Progress>
          <Button size="$2" chromeless color="$color10" onClick={() => setStep(steps.length - 1)} data-testid="onboarding-skip">
            Skip
          </Button>
        </XStack>

        <YStack flex={1} alignItems="center" justifyContent="center" gap="$space.6">
          <Illustration step={current} />
          <YStack gap="$space.2" alignItems="center" paddingHorizontal="$space.2">
            <H2 size="$8" margin={0} textAlign="center" data-testid="onboarding-title">{current.title}</H2>
            <Paragraph size="$4" color="$color10" margin={0} textAlign="center">{current.body}</Paragraph>
          </YStack>
        </YStack>

        <XStack
          justifyContent="center"
          gap="$space.1"
          role="tablist"
          aria-label="Steps"
          onKeyDown={(event: KeyboardEvent) => rovingFocus(event, "[role=tab]", { orientation: "horizontal", onMove: (_el, index) => setStep(index) })}
        >
          {steps.map((s, i) => (
            <YStack
              key={s.title}
              tag="button"
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Step ${i + 1}: ${s.title}`}
              tabIndex={i === step ? 0 : -1}
              padding={4}
              borderWidth={0}
              backgroundColor="transparent"
              borderRadius={999}
              cursor="pointer"
              focusVisibleStyle={{ outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2, outlineOffset: 0 }}
              onClick={() => setStep(i)}
              data-testid={`onboarding-step-${i}`}
            >
              <YStack
                theme={i === step ? "accent" : undefined}
                backgroundColor={i === step ? "$background" : "$color6"}
                height={8}
                width={i === step ? 24 : 8}
                borderRadius={999}
                animation="quick"
              />
            </YStack>
          ))}
        </XStack>

        <Button
          theme="accent"
          size="$4"
          width="100%"
          iconAfter={last ? undefined : <ArrowRightIcon size={16} />}
          onClick={() => setStep(last ? 0 : step + 1)}
          data-testid="onboarding-next"
        >
          {last ? "Get started" : "Next"}
        </Button>
      </YStack>
    </PhoneFrame>
  );
}

function BackHeader({ trailing }: { trailing?: VNode }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" marginLeft={-8}>
      <Button size="$3" chromeless circular icon={<ArrowLeftIcon size={18} />} aria-label="Back" />
      {trailing}
    </XStack>
  );
}

function Field({ id, label, placeholder, type }: { id: string; label: string; placeholder: string; type?: string }) {
  return (
    <YStack gap={2}>
      <Label htmlFor={id} size="$2" color="$color11" fontWeight="500">{label}</Label>
      <Input id={id} type={type} placeholder={placeholder} width="100%" />
    </YStack>
  );
}

function CreateAccount() {
  const id = useStableId();
  const [agreed, setAgreed] = useDemoState("onboarding.agreed", false);
  return (
    <PhoneFrame>
      <ScrollView flex={1} padding="$space.5" gap="$space.4">
        <BackHeader trailing={<SizableText size="$2" color="$color10">Step 1 of 3</SizableText>} />

        <YStack gap="$space.1">
          <H2 size="$8" margin={0}>Create your account</H2>
          <Paragraph size="$3" color="$color10" margin={0}>It takes less than a minute.</Paragraph>
        </YStack>

        <YStack gap="$space.3">
          <Field id={`${id}-name`} label="Full name" placeholder="Ada Lovelace" />
          <Field id={`${id}-email`} label="Email" placeholder="ada@example.com" type="email" />
          <Field id={`${id}-password`} label="Password" placeholder="At least 8 characters" type="password" />
        </YStack>

        <XStack gap="$space.3" alignItems="flex-start">
          <Checkbox id={`${id}-terms`} size="$4" checked={agreed} onCheckedChange={(checked) => setAgreed(checked === true)} data-testid="onboarding-terms">
            <Checkbox.Indicator />
          </Checkbox>
          <Label htmlFor={`${id}-terms`} size="$3" lineHeight={20} flex={1} display="block" color="$color11">
            I agree to the <Link>Terms of Service</Link> and <Link>Privacy Policy</Link>
          </Label>
        </XStack>

        <Button theme="accent" size="$4" width="100%" disabled={!agreed} data-testid="onboarding-create">
          Create account
        </Button>

        <XStack alignItems="center" gap="$space.3">
          <Separator />
          <SizableText size="$2" color="$color10">or</SizableText>
          <Separator />
        </XStack>

        <YStack gap="$space.2">
          <Button size="$3" variant="outlined" width="100%" icon={<AppleIcon size={16} fill="currentColor" />}>
            Continue with Apple
          </Button>
          <Button size="$3" variant="outlined" width="100%" icon={<SizableText size="$3" fontWeight="700" color="$blue10" lineHeight={16}>G</SizableText>}>
            Continue with Google
          </Button>
        </YStack>

        <Paragraph size="$3" color="$color10" margin={0} textAlign="center">
          Already have an account? <Link>Sign in</Link>
        </Paragraph>
      </ScrollView>
    </PhoneFrame>
  );
}

const codeLength = 6;
const emptyCode = JSON.stringify(Array.from({ length: codeLength }, () => ""));

function VerifyCode() {
  const id = useStableId();
  const [json, setJson] = useDemoState("onboarding.code", emptyCode);
  const digits = JSON.parse(json) as string[];
  const complete = digits.every((d) => d !== "");
  const boxId = (i: number) => `${id}-code-${i}`;
  const setDigit = (i: number, value: string) => setJson(JSON.stringify(digits.map((d, j) => (j === i ? value : d))));

  return (
    <PhoneFrame>
      <YStack flex={1} padding="$space.5" gap="$space.4">
        <BackHeader />

        <YStack gap="$space.3" alignItems="flex-start" paddingTop="$space.2">
          <Circle size={56} theme="blue" backgroundColor="$color3" color="$color10">
            <MailIcon size={26} strokeWidth={1.75} />
          </Circle>
          <YStack gap="$space.1">
            <H2 size="$8" margin={0}>Check your email</H2>
            <Paragraph size="$3" color="$color10" margin={0}>
              We sent a {codeLength}-digit code to <SizableText size="$3" color="$color" fontWeight="600">ada@example.com</SizableText>. Enter it below to continue.
            </Paragraph>
          </YStack>
        </YStack>

        <XStack gap="$space.2" justifyContent="space-between" paddingTop="$space.2" role="group" aria-label="Verification code">
          {digits.map((digit, i) => (
            <Input
              key={i}
              id={boxId(i)}
              value={digit}
              size="$5"
              width={48}
              paddingHorizontal={0}
              textAlign="center"
              fontSize={22}
              fontWeight="600"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              aria-label={`Digit ${i + 1}`}
              onInput={(event: Event) => {
                const el = event.target as HTMLInputElement;
                const next = el.value.replace(/\D/g, "").slice(-1);
                el.value = next;
                setDigit(i, next);
                if (next && i < codeLength - 1) document.getElementById(boxId(i + 1))?.focus();
              }}
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === "Backspace" && digit === "" && i > 0) document.getElementById(boxId(i - 1))?.focus();
              }}
              data-testid={`onboarding-code-${i}`}
            />
          ))}
        </XStack>

        <XStack justifyContent="center" gap="$space.2">
          <SizableText size="$2" color="$color10">Didn't get it?</SizableText>
          <SizableText size="$2" color="$color11" fontWeight="600">Resend code in 0:30</SizableText>
        </XStack>

        <YStack flex={1} />

        <Button theme="accent" size="$4" width="100%" disabled={!complete} data-testid="onboarding-verify">
          Verify
        </Button>
      </YStack>
    </PhoneFrame>
  );
}

export const OnboardingExample: ExampleDemos = {
  name: "Onboarding",
  description: "A mobile onboarding flow: a three-step walkthrough with a dot pager, an account form with terms consent and social sign-in, and a one-time-code screen.",
  demos: [
    {
      title: "Walkthrough",
      description: "Next advances the step; the progress bar, dots and illustration follow.",
      render: () => <Walkthrough />,
      shot: { click: "onboarding-next", wait: 300 },
    },
    {
      title: "Create account",
      description: "The submit button stays disabled until the terms are accepted.",
      render: () => <CreateAccount />,
      shot: { click: "onboarding-terms", wait: 200 },
    },
    {
      title: "Verify code",
      description: "Typing a digit moves focus to the next box; Backspace on an empty box moves back.",
      render: () => <VerifyCode />,
      shot: { focus: "onboarding-code-0", wait: 200 },
    },
  ],
};
