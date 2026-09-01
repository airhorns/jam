import { h } from "@jam/core/jsx";
import { XStack, YStack, RadioGroup, Label, SizableText, styled, useStableId } from "@jam/ui";
import type { ExampleDemos } from "../../types";
import { useDemoState } from "../state";
import { LockIcon, UsersIcon, GlobeIcon } from "./icons";

/** A label styled as a selectable card; clicking anywhere on it activates the radio it points at. */
const RadioCard = styled<{ active?: boolean }>(Label, {
  name: "RadioCard",
  defaultProps: {
    flexDirection: "row",
    alignItems: "center",
    gap: "$space.3",
    padding: "$space.3",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.4",
    backgroundColor: "$background",
    cursor: "pointer",
    animation: "quick",
    animateOnly: ["background-color", "border-color"],
    hoverStyle: { borderColor: "$borderColorHover", backgroundColor: "$backgroundHover" },
  },
  variants: {
    active: {
      true: {
        borderColor: "$blue8",
        backgroundColor: "$blue2",
        hoverStyle: { borderColor: "$blue9", backgroundColor: "$blue3" },
      },
    },
  },
});

function Radio({ value, id, selected, ...rest }: { value: string; id: string; selected: boolean; [key: string]: unknown }) {
  return (
    <RadioGroup.Item value={value} id={id} {...(selected ? { borderColor: "$blue9", hoverStyle: { borderColor: "$blue9" } } : {})} {...rest}>
      <RadioGroup.Indicator backgroundColor="$blue9" />
    </RadioGroup.Item>
  );
}

// ---- Shipping method ----

const shippingMethods = [
  { value: "standard", title: "Standard", description: "5–7 business days", price: "Free" },
  { value: "express", title: "Express", description: "2–3 business days", price: "$9.00" },
  { value: "overnight", title: "Overnight", description: "Next business day by 10am", price: "$24.00" },
];

function ShippingMethod() {
  const id = useStableId();
  const [value, setValue] = useDemoState("radiocards.shipping", "standard");
  return (
    <RadioGroup value={value} onValueChange={setValue} width="100%" maxWidth={460} gap="$space.2" aria-label="Shipping method">
      {shippingMethods.map((method) => {
        const selected = value === method.value;
        return (
          <RadioCard key={method.value} htmlFor={`${id}-${method.value}`} active={selected} data-testid={`shipping-${method.value}`}>
            <Radio value={method.value} id={`${id}-${method.value}`} selected={selected} />
            <YStack flex={1} minWidth={0} gap={2}>
              <SizableText size="$4" fontWeight="600">{method.title}</SizableText>
              <SizableText size="$2" color="$color11">{method.description}</SizableText>
            </YStack>
            <SizableText size="$4" fontWeight="600" color={method.price === "Free" ? "$green10" : "$color"}>
              {method.price}
            </SizableText>
          </RadioCard>
        );
      })}
    </RadioGroup>
  );
}

// ---- Segmented choice ----

const visibilities: { value: string; label: string; hint: string; Icon: typeof LockIcon }[] = [
  { value: "private", label: "Private", hint: "Only you", Icon: LockIcon },
  { value: "team", label: "Team", hint: "Your teammates", Icon: UsersIcon },
  { value: "public", label: "Public", hint: "Anyone with the link", Icon: GlobeIcon },
];

function SegmentedChoice() {
  const [value, setValue] = useDemoState("radiocards.visibility", "team");
  return (
    <RadioGroup value={value} onValueChange={setValue} orientation="horizontal" alignItems="stretch" gap="$space.3" width="100%" maxWidth={460} aria-label="Visibility">
      {visibilities.map(({ value: option, label, hint, Icon }) => {
        const selected = value === option;
        return (
          <RadioGroup.Item
            key={option}
            value={option}
            unstyled
            flex={1}
            flexBasis={0}
            minWidth={0}
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap="$space.2"
            paddingVertical="$space.4"
            paddingHorizontal="$space.3"
            borderWidth={1}
            borderStyle="solid"
            borderColor={selected ? "$blue8" : "$borderColor"}
            borderRadius="$radius.4"
            backgroundColor={selected ? "$blue2" : "$background"}
            cursor="pointer"
            fontFamily="$body"
            animation="quick"
            animateOnly={["background-color", "border-color"]}
            hoverStyle={selected ? { borderColor: "$blue9", backgroundColor: "$blue3" } : { borderColor: "$borderColorHover", backgroundColor: "$backgroundHover" }}
            focusVisibleStyle={{ outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 }}
            data-testid={`visibility-${option}`}
          >
            <YStack width={40} height={40} alignItems="center" justifyContent="center" borderRadius={100_000} backgroundColor={selected ? "$blue4" : "$color4"}>
              <Icon size={20} color={selected ? "var(--blue10)" : "var(--color11)"} />
            </YStack>
            <YStack alignItems="center">
              <SizableText size="$3" fontWeight="600" color={selected ? "$blue11" : "$color"}>{label}</SizableText>
              <SizableText size="$1" color="$color11" textAlign="center">{hint}</SizableText>
            </YStack>
          </RadioGroup.Item>
        );
      })}
    </RadioGroup>
  );
}

// ---- Inline options ----

const sortOptions = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "price", label: "Price: low to high" },
];

function InlineOptions() {
  const id = useStableId();
  const [value, setValue] = useDemoState("radiocards.sort", "relevance");
  return (
    <XStack alignItems="center" gap="$space.4" flexWrap="wrap">
      <SizableText size="$3" color="$color11">Sort by</SizableText>
      <RadioGroup value={value} onValueChange={setValue} orientation="horizontal" size="$3" gap="$space.4" flexWrap="wrap" aria-label="Sort by">
        {sortOptions.map((option) => (
          <XStack key={option.value} alignItems="center" gap="$space.2">
            <Radio value={option.value} id={`${id}-${option.value}`} selected={value === option.value} data-testid={`sort-${option.value}`} />
            <Label htmlFor={`${id}-${option.value}`} size="$3" cursor="pointer">{option.label}</Label>
          </XStack>
        ))}
      </RadioGroup>
    </XStack>
  );
}

export const GroupedRadioExample: ExampleDemos = {
  name: "Radio cards",
  description: "RadioGroup laid out as selectable cards, tiles and inline options, with the whole card acting as the label.",
  demos: [
    {
      title: "Shipping method",
      description: "Each card is a label for its radio, so clicking anywhere on it selects that method. Arrow keys move between cards.",
      render: () => <ShippingMethod />,
      shot: { click: "shipping-express" },
    },
    {
      title: "Segmented choice",
      description: "The radio item is the tile itself: icon on top, label below, an accent border when selected.",
      render: () => <SegmentedChoice />,
      shot: { click: "visibility-public" },
    },
    {
      title: "Inline options",
      description: "A compact horizontal group with labels beside the indicators.",
      render: () => <InlineOptions />,
      shot: { click: "sort-newest" },
    },
  ],
};
