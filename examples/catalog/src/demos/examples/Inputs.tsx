import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, Input, Label, SizableText, Button, XGroup, Select, useStableId } from "@jam/ui";
import type { ExampleDemos } from "../../types";
import { useDemoState } from "../state";
import { AlertCircleIcon, CheckCircleIcon, EyeIcon, EyeOffIcon, SearchIcon, XIcon } from "./icons";

type Tone = "neutral" | "error" | "success";

const toneColor: Record<Tone, string> = { neutral: "$color10", error: "$red10", success: "$green10" };
const toneIcon = { error: AlertCircleIcon, success: CheckCircleIcon };

function Hint({ id, tone = "neutral", children }: { id?: string; tone?: Tone; children: VChild }) {
  const Icon = tone === "neutral" ? null : toneIcon[tone];
  return (
    <XStack id={id} alignItems="center" gap="$space.1.5" color={toneColor[tone]}>
      {Icon ? <Icon size={14} /> : null}
      <SizableText size="$2" color={toneColor[tone]}>{children}</SizableText>
    </XStack>
  );
}

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  /** The field's size token; the label sits one step below it. */
  size?: string;
  hint?: VChild;
  tone?: Tone;
  children: VChild;
};

const stepDown = (size: string) => `$${Math.max(1, Number(size.slice(1)) - 1)}`;

function Field({ id, label, required, size = "$4", hint, tone, children }: FieldProps) {
  const labelSize = stepDown(size);
  return (
    <YStack gap="$space.1.5">
      {/* Label's line box defaults to a control's height; the font's own line height keeps it snug above the field. */}
      <Label htmlFor={id} size={labelSize} lineHeight={labelSize} fontWeight="500" gap="$space.1">
        {label}
        {required ? <SizableText size={labelSize} color="$red10" aria-hidden="true">*</SizableText> : null}
      </Label>
      {children}
      {hint ? <Hint id={`${id}-hint`} tone={tone}>{hint}</Hint> : null}
    </YStack>
  );
}

const Column = ({ children }: { children: VChild }) => (
  <YStack gap="$space.5" width="100%" maxWidth={380}>{children}</YStack>
);

function LabelledInputs() {
  const id = useStableId();
  return (
    <Column>
      <Field id={`${id}-name`} label="Full name" required>
        <Input id={`${id}-name`} placeholder="Ada Lovelace" required />
      </Field>
      <Field id={`${id}-email`} label="Email address" hint="We never share your email with anyone else.">
        <Input id={`${id}-email`} type="email" placeholder="email@example.com" aria-describedby={`${id}-email-hint`} data-testid="inputs-email" />
      </Field>
    </Column>
  );
}

const errorStyle = {
  borderColor: "$red8",
  hoverStyle: { borderColor: "$red9" },
  focusStyle: { borderColor: "$red9", outlineColor: "$red7" },
};

const successStyle = {
  borderColor: "$green8",
  hoverStyle: { borderColor: "$green9" },
  focusStyle: { borderColor: "$green9", outlineColor: "$green7" },
};

function ValidationStates() {
  const id = useStableId();
  return (
    <Column>
      <Field id={`${id}-username`} label="Username" required tone="error" hint="That username is already taken.">
        <Input
          id={`${id}-username`}
          defaultValue="ada"
          required
          aria-invalid="true"
          aria-describedby={`${id}-username-hint`}
          data-testid="inputs-username"
          {...errorStyle}
        />
      </Field>
      <Field id={`${id}-handle`} label="Handle" tone="success" hint="@ada.lovelace is available.">
        <Input id={`${id}-handle`} defaultValue="ada.lovelace" aria-describedby={`${id}-handle-hint`} {...successStyle} />
      </Field>
    </Column>
  );
}

function Adornment({ side, children }: { side: "left" | "right"; children: VChild }) {
  return (
    <YStack
      position="absolute"
      top={0}
      bottom={0}
      left={side === "left" ? 0 : undefined}
      right={side === "right" ? 0 : undefined}
      width={44}
      alignItems="center"
      justifyContent="center"
      pointerEvents="none"
      color="$color10"
    >
      {children}
    </YStack>
  );
}

/** A small icon button sitting over the field's right padding, vertically centred by the wrapping XStack. */
function OverlayButton(props: { label: string; icon: VChild; onClick: () => void; pressed?: boolean; testId: string }) {
  return (
    <Button
      position="absolute"
      right={8}
      circular
      chromeless
      size="$2"
      color="$color10"
      aria-label={props.label}
      aria-pressed={props.pressed}
      icon={props.icon}
      onClick={props.onClick}
      data-testid={props.testId}
    />
  );
}

function AdornedInputs() {
  const id = useStableId();
  const [query, setQuery] = useDemoState("inputs.query", "reactive forms");
  const [password, setPassword] = useDemoState("inputs.password", "correct-horse-battery");
  const [revealed, setRevealed] = useDemoState("inputs.revealed", false);
  return (
    <Column>
      <Field id={`${id}-search`} label="Search">
        <XStack position="relative" alignItems="center">
          <Adornment side="left"><SearchIcon size={16} /></Adornment>
          <Input id={`${id}-search`} flex={1} paddingLeft={40} placeholder="Search components…" />
        </XStack>
      </Field>

      <Field id={`${id}-query`} label="Filter">
        <XStack position="relative" alignItems="center">
          <Input id={`${id}-query`} flex={1} paddingRight={44} value={query} onChangeText={setQuery} data-testid="inputs-filter" />
          {query ? <OverlayButton label="Clear filter" icon={<XIcon size={14} />} onClick={() => setQuery("")} testId="inputs-clear" /> : null}
        </XStack>
      </Field>

      <Field id={`${id}-password`} label="Password">
        <XStack position="relative" alignItems="center">
          <Input
            id={`${id}-password`}
            flex={1}
            paddingRight={44}
            type={revealed ? "text" : "password"}
            value={password}
            onChangeText={setPassword}
            data-testid="inputs-password"
          />
          <OverlayButton
            label={revealed ? "Hide password" : "Show password"}
            pressed={revealed}
            icon={revealed ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
            onClick={() => setRevealed(!revealed)}
            testId="inputs-toggle-password"
          />
        </XStack>
      </Field>

      <Field id={`${id}-amount`} label="Amount">
        <XStack position="relative" alignItems="center">
          <Input id={`${id}-amount`} flex={1} paddingRight={56} inputMode="decimal" placeholder="0.00" />
          <Adornment side="right"><SizableText size="$3" color="$color10">USD</SizableText></Adornment>
        </XStack>
      </Field>
    </Column>
  );
}

const countries = [
  { code: "us", name: "United States", prefix: "+1" },
  { code: "gb", name: "United Kingdom", prefix: "+44" },
  { code: "de", name: "Germany", prefix: "+49" },
  { code: "jp", name: "Japan", prefix: "+81" },
  { code: "au", name: "Australia", prefix: "+61" },
];

function GroupedInputs() {
  const id = useStableId();
  const [country, setCountry] = useDemoState("inputs.country", "us");
  return (
    <Column>
      <Field id={`${id}-phone`} label="Phone number">
        <XGroup width="100%">
          <XGroup.Item>
            <Select value={country} onValueChange={setCountry} id={`${id}-country`}>
              <Select.Trigger aria-label="Country code" minWidth={96} data-testid="inputs-country-trigger">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Viewport>
                  {countries.map((c) => (
                    <Select.Item key={c.code} value={c.code} label={c.prefix}>
                      <Select.ItemText>{c.name} ({c.prefix})</Select.ItemText>
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select>
          </XGroup.Item>
          <XGroup.Item flexGrow={1}>
            <Input id={`${id}-phone`} type="tel" inputMode="tel" placeholder="(555) 123-4567" />
          </XGroup.Item>
        </XGroup>
      </Field>

      <Field id={`${id}-newsletter`} label="Newsletter" hint="One email a month. Unsubscribe any time.">
        <XGroup width="100%">
          <XGroup.Item flexGrow={1} flexShrink={1} minWidth={0}>
            <Input id={`${id}-newsletter`} type="email" placeholder="you@example.com" aria-describedby={`${id}-newsletter-hint`} />
          </XGroup.Item>
          <XGroup.Item flexShrink={0}>
            <Button theme="accent">Subscribe</Button>
          </XGroup.Item>
        </XGroup>
      </Field>
    </Column>
  );
}

const sizes = ["$2", "$3", "$4", "$5"] as const;

function SizedInputs() {
  const id = useStableId();
  return (
    <Column>
      {sizes.map((size) => (
        <Field key={size} id={`${id}-${size.slice(1)}`} label={`Email address (${size})`} size={size}>
          <Input id={`${id}-${size.slice(1)}`} size={size} type="email" placeholder="email@example.com" />
        </Field>
      ))}
    </Column>
  );
}

export const InputsExample: ExampleDemos = {
  name: "Input patterns",
  description: "Labelled fields, validation messages, leading and trailing adornments, grouped controls and the size scale — the building blocks of a form.",
  demos: [
    {
      title: "Label and input",
      description: "A label wired to its field with htmlFor, a required marker, and a helper message.",
      render: () => <LabelledInputs />,
      shot: { focus: "inputs-email" },
    },
    {
      title: "Validation",
      description: "Error and success states recolour the border and focus ring, with an icon beside the message.",
      render: () => <ValidationStates />,
      shot: { focus: "inputs-username" },
    },
    {
      title: "Adornments",
      description: "A leading icon, a clear button, a password reveal toggle and a unit suffix, each overlaid on the field's padding.",
      render: () => <AdornedInputs />,
      shot: { click: "inputs-toggle-password", wait: 200 },
    },
    {
      title: "Grouped",
      description: "XGroup joins a Select prefix to a phone field, and a field to its submit button.",
      render: () => <GroupedInputs />,
      shot: { click: "inputs-country-trigger" },
    },
    {
      title: "Sizes",
      description: "The same labelled field from $2 to $5; the label sits one size step below the field.",
      render: () => <SizedInputs />,
    },
  ],
};
