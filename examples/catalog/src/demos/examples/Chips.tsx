import { h } from "@jam/core/jsx";
import { XStack, YStack, SizableText, Button, styled, createStyledContext, getFontSized, tokenValue } from "@jam/ui";
import type { StyledProps } from "@jam/ui";
import type { ExampleDemos } from "../../types";
import { useDemoState } from "../state";
import { XIcon, StarIcon, ZapIcon, HeartIcon, MapPinIcon, ClockIcon, CalendarIcon, GlobeIcon, CheckIcon } from "./icons";

type ChipVariant = "soft" | "outlined" | "filled";

type ChipProps = StyledProps & {
  size?: string | number;
  variant?: ChipVariant;
  rounded?: boolean;
  pressable?: boolean;
};

const ChipContext = createStyledContext<{ size?: string | number }>({ size: undefined });

const ChipFrame = styled<ChipProps>(XStack, {
  name: "Chip",
  context: ChipContext,
  defaultProps: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    userSelect: "none",
    whiteSpace: "nowrap",
    fontFamily: "$body",
    animation: "quick",
    animateOnly: ["background-color", "border-color", "color"],
  },
  variants: {
    variant: {
      soft: {
        backgroundColor: "$color4",
        color: "$color11",
        hoverStyle: { backgroundColor: "$color5" },
        pressStyle: { backgroundColor: "$color6" },
      },
      outlined: {
        backgroundColor: "transparent",
        borderColor: "$color7",
        color: "$color11",
        hoverStyle: { backgroundColor: "$color3", borderColor: "$color8" },
        pressStyle: { backgroundColor: "$color4" },
      },
      filled: {
        backgroundColor: "$background",
        borderColor: "$background",
        color: "$color",
        hoverStyle: { backgroundColor: "$backgroundHover", borderColor: "$backgroundHover" },
        pressStyle: { backgroundColor: "$backgroundPress", borderColor: "$backgroundPress" },
      },
    },
    size: {
      "...size": (value, { tokens }) => {
        const space = tokenValue(tokens, "space", value) ?? 13;
        return {
          paddingHorizontal: space,
          paddingVertical: Math.round(space * 0.25),
          gap: Math.round(space * 0.45),
          borderRadius: tokenValue(tokens, "radius", value) ?? 7,
        };
      },
    },
    rounded: {
      true: { borderRadius: 100_000 },
    },
    pressable: {
      true: {
        cursor: "pointer",
        focusVisibleStyle: { outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2, outlineOffset: 1 },
      },
    },
  },
  defaultVariants: {
    variant: "soft",
    size: "$3",
  },
});

const ChipText = styled(SizableText, {
  name: "ChipText",
  context: ChipContext,
  defaultProps: {
    fontWeight: "500",
    lineHeight: "1.3",
    cursor: "inherit",
  },
  variants: {
    unstyled: {
      false: { color: "inherit" },
    },
    size: {
      "...size": (value, extras) => {
        const { fontSize } = (getFontSized(value, extras) ?? {}) as { fontSize?: number };
        return fontSize === undefined ? null : { fontSize };
      },
    },
  },
  defaultVariants: {
    size: "$3",
  },
});

const ChipClose = styled("button", {
  name: "ChipClose",
  context: ChipContext,
  defaultProps: {
    type: "button",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    padding: 2,
    borderWidth: 0,
    borderRadius: 100_000,
    backgroundColor: "transparent",
    color: "inherit",
    cursor: "pointer",
    opacity: 0.7,
    hoverStyle: { opacity: 1, backgroundColor: "$color6" },
    focusVisibleStyle: { outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2 },
  },
  variants: {
    size: {
      "...size": (value, { tokens }) => ({ marginRight: -Math.round((tokenValue(tokens, "space", value) ?? 13) * 0.45) }),
    },
  },
  defaultVariants: {
    size: "$3",
  },
});

const Chip = Object.assign(ChipFrame, { Text: ChipText, Close: ChipClose });

const themes = ["blue", "green", "red", "yellow", "orange", "purple", "pink", "gray"] as const;
type ChipTheme = (typeof themes)[number];

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

function ColourRow({ size, variant }: { size?: string; variant?: ChipVariant }) {
  return (
    <XStack gap="$space.2" flexWrap="wrap">
      {themes.map((theme) => (
        <Chip key={theme} theme={theme} size={size} variant={variant}>
          <Chip.Text>{capitalize(theme)}</Chip.Text>
        </Chip>
      ))}
    </XStack>
  );
}

function RowLabel({ children }: { children: string }) {
  return (
    <SizableText size="$1" color="$color10" textTransform="uppercase" letterSpacing={0.6} fontWeight="600">
      {children}
    </SizableText>
  );
}

const tagged: { label: string; theme: ChipTheme; Icon: typeof StarIcon }[] = [
  { label: "Featured", theme: "yellow", Icon: StarIcon },
  { label: "Fast", theme: "orange", Icon: ZapIcon },
  { label: "Loved", theme: "pink", Icon: HeartIcon },
  { label: "Toronto", theme: "blue", Icon: MapPinIcon },
  { label: "2 hours", theme: "purple", Icon: ClockIcon },
  { label: "Tomorrow", theme: "green", Icon: CalendarIcon },
  { label: "Public", theme: "gray", Icon: GlobeIcon },
];

function IconChips({ rounded, variant }: { rounded?: boolean; variant?: ChipVariant }) {
  return (
    <XStack gap="$space.2" flexWrap="wrap">
      {tagged.map(({ label, theme, Icon }) => (
        <Chip key={label} theme={theme} rounded={rounded} variant={variant}>
          <Icon size={14} />
          <Chip.Text>{label}</Chip.Text>
        </Chip>
      ))}
    </XStack>
  );
}

const languages: { label: string; theme: ChipTheme }[] = [
  { label: "TypeScript", theme: "blue" },
  { label: "Rust", theme: "orange" },
  { label: "Go", theme: "green" },
  { label: "Python", theme: "yellow" },
  { label: "Swift", theme: "red" },
  { label: "Elixir", theme: "purple" },
];

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function DismissibleChips() {
  const [json, setJson] = useDemoState("chips.dismissible", JSON.stringify(languages.map((l) => l.label)));
  const remaining = JSON.parse(json) as string[];
  const visible = languages.filter((l) => remaining.includes(l.label));
  return (
    <YStack gap="$space.3" alignItems="flex-start">
      <XStack gap="$space.2" flexWrap="wrap" minHeight={30} alignItems="center">
        {visible.map(({ label, theme }) => (
          <Chip key={label} theme={theme} rounded>
            <Chip.Text>{label}</Chip.Text>
            <Chip.Close aria-label={`Remove ${label}`} data-testid={`chip-close-${slug(label)}`} onClick={() => setJson(JSON.stringify(remaining.filter((r) => r !== label)))}>
              <XIcon size={12} strokeWidth={2.5} />
            </Chip.Close>
          </Chip>
        ))}
        {visible.length === 0 ? <SizableText size="$2" color="$color10">All removed.</SizableText> : null}
      </XStack>
      {visible.length < languages.length ? (
        <Button size="$2" variant="outlined" onClick={() => setJson(JSON.stringify(languages.map((l) => l.label)))}>
          Restore all
        </Button>
      ) : null}
    </YStack>
  );
}

const filters = ["Design", "Engineering", "Marketing", "Product", "Research", "Sales", "Support", "Remote", "Full-time", "Contract"];

function FilterChips() {
  const [json, setJson] = useDemoState("chips.filters", JSON.stringify(["Engineering", "Remote"]));
  const selected = JSON.parse(json) as string[];
  const toggle = (label: string) =>
    setJson(JSON.stringify(selected.includes(label) ? selected.filter((s) => s !== label) : [...selected, label]));
  return (
    <YStack gap="$space.3" width="100%" maxWidth={480}>
      <XStack gap="$space.2" flexWrap="wrap">
        {filters.map((label) => {
          const on = selected.includes(label);
          return (
            <Chip
              key={label}
              tag="button"
              pressable
              rounded
              theme={on ? "accent" : undefined}
              variant={on ? "filled" : "outlined"}
              aria-pressed={on}
              data-testid={`chip-filter-${slug(label)}`}
              onClick={() => toggle(label)}
            >
              {on ? <CheckIcon size={13} strokeWidth={2.5} /> : null}
              <Chip.Text>{label}</Chip.Text>
            </Chip>
          );
        })}
      </XStack>
      <XStack alignItems="center" gap="$space.3">
        <SizableText size="$2" color="$color10">
          {selected.length === 0 ? "No filters applied" : `${selected.length} filter${selected.length === 1 ? "" : "s"} applied`}
        </SizableText>
        {selected.length > 0 ? (
          <Button size="$2" chromeless onClick={() => setJson("[]")}>
            Clear
          </Button>
        ) : null}
      </XStack>
    </YStack>
  );
}

export const ChipsExample: ExampleDemos = {
  name: "Chips",
  description: "Compact labelled tokens built from a styled XStack: coloured by theme, sized, pill-shaped, dismissible and toggleable.",
  demos: [
    {
      title: "Colours",
      description: "One chip per theme at the default and small sizes, plus the outlined variant.",
      render: () => (
        <YStack gap="$space.4">
          <YStack gap="$space.2">
            <RowLabel>Default</RowLabel>
            <ColourRow />
          </YStack>
          <YStack gap="$space.2">
            <RowLabel>Small</RowLabel>
            <ColourRow size="$2" />
          </YStack>
          <YStack gap="$space.2">
            <RowLabel>Outlined</RowLabel>
            <ColourRow variant="outlined" />
          </YStack>
        </YStack>
      ),
    },
    {
      title: "With icons",
      description: "A leading icon inherits the chip's colour; `rounded` makes a pill.",
      render: () => (
        <YStack gap="$space.4">
          <IconChips />
          <IconChips rounded />
          <IconChips rounded variant="outlined" />
        </YStack>
      ),
    },
    {
      title: "Dismissible",
      description: "Each chip's close button removes it from the list.",
      render: () => <DismissibleChips />,
      shot: { click: "chip-close-rust", wait: 300 },
    },
    {
      title: "Selectable filters",
      description: "Toggle chips; selected ones fill with the accent theme.",
      render: () => <FilterChips />,
      shot: { click: ["chip-filter-design", "chip-filter-remote"], wait: 300 },
    },
  ],
};
