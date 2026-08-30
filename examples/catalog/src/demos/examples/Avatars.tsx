import { h } from "@jam/core/jsx";
import { XStack, YStack, YGroup, Avatar, Circle, Tooltip, Separator, SizableText, getToken } from "@jam/ui";
import type { ComponentDemos } from "../../types";

type Person = { name: string; initials: string; theme: string; role: string; online: boolean };

const team: Person[] = [
  { name: "Ada Lovelace", initials: "AL", theme: "blue", role: "Engineering lead", online: true },
  { name: "Grace Hopper", initials: "GH", theme: "purple", role: "Compiler engineer", online: true },
  { name: "Alan Turing", initials: "AT", theme: "green", role: "Research", online: false },
  { name: "Katherine Johnson", initials: "KJ", theme: "orange", role: "Data science", online: true },
  { name: "Linus Torvalds", initials: "LT", theme: "red", role: "Kernel maintainer", online: false },
  { name: "Margaret Hamilton", initials: "MH", theme: "pink", role: "Flight software", online: true },
];

const sizePx = (size: string) => Number(getToken("size", size.slice(1)) ?? 44);
const ringWidth = (size: string) => (sizePx(size) >= 52 ? 3 : 2);
const overlapFor = (size: string) => -Math.round(sizePx(size) * 0.25);

function Initials({ person, size, ring }: { person: Person; size: string; ring?: boolean }) {
  const px = sizePx(size);
  return (
    <Avatar size={size} circular borderWidth={ring ? ringWidth(size) : 0} borderStyle="solid" borderColor="$background">
      <Avatar.Fallback theme={person.theme} backgroundColor="$color5" color="$color11" fontSize={Math.round(px * 0.34)} fontWeight="600" letterSpacing={0.3}>
        {person.initials}
      </Avatar.Fallback>
    </Avatar>
  );
}

function Overflow({ count, size, ring }: { count: number; size: string; ring?: boolean }) {
  const px = sizePx(size);
  return (
    <Avatar size={size} circular borderWidth={ring ? ringWidth(size) : 0} borderStyle="solid" borderColor="$background">
      <Avatar.Fallback backgroundColor="$color4" color="$color11" fontSize={Math.round(px * 0.32)} fontWeight="600">
        +{count}
      </Avatar.Fallback>
    </Avatar>
  );
}

function StackedGroup({ size, people, overflow }: { size: string; people: Person[]; overflow?: number }) {
  const overlap = overlapFor(size);
  return (
    <XStack alignItems="center">
      {people.map((person, i) => (
        <YStack key={person.name} marginLeft={i === 0 ? 0 : overlap}>
          <Initials person={person} size={size} ring />
        </YStack>
      ))}
      {overflow ? (
        <YStack marginLeft={overlap}>
          <Overflow count={overflow} size={size} ring />
        </YStack>
      ) : null}
    </XStack>
  );
}

function StackedGroups() {
  return (
    <YStack gap="$space.5" alignItems="flex-start">
      {(["$3", "$4", "$5", "$6"] as const).map((size) => (
        <XStack key={size} gap="$space.5" alignItems="center">
          <StackedGroup size={size} people={team.slice(0, 4)} overflow={3} />
          <SizableText size="$2" color="$color10" fontFamily="$mono">
            {size}
          </SizableText>
        </XStack>
      ))}
    </YStack>
  );
}

function TooltipGroup({ size }: { size: string }) {
  const overlap = overlapFor(size);
  return (
    <XStack alignItems="center">
      {team.slice(0, 5).map((person, i) => (
        <Tooltip key={person.name} placement="bottom" delay={0} offset={8}>
          <Tooltip.Trigger asChild>
            <YStack
              tabIndex={0}
              marginLeft={i === 0 ? 0 : overlap}
              cursor="pointer"
              borderRadius={100_000}
              animation="bouncy"
              hoverStyle={{ scale: 1.1, zIndex: 10 }}
              focusVisibleStyle={{ outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 }}
              data-testid={`avatar-tip-${size.slice(1)}-${i}`}
            >
              <Initials person={person} size={size} ring />
            </YStack>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <Tooltip.Arrow />
            {person.name}
          </Tooltip.Content>
        </Tooltip>
      ))}
    </XStack>
  );
}

function StatusDot({ online, size }: { online: boolean; size: string }) {
  const dot = Math.max(10, Math.round(sizePx(size) * 0.28));
  return (
    <Circle
      theme={online ? "green" : "gray"}
      size={dot}
      backgroundColor={online ? "$color9" : "$color8"}
      borderWidth={2}
      borderStyle="solid"
      borderColor="$background"
      position="absolute"
      right={-1}
      bottom={-1}
      role="img"
      aria-label={online ? "Online" : "Away"}
    />
  );
}

function StatusAvatar({ person, size }: { person: Person; size: string }) {
  return (
    <YStack position="relative" flexShrink={0}>
      <Initials person={person} size={size} />
      <StatusDot online={person.online} size={size} />
    </YStack>
  );
}

function StatusList() {
  return (
    <YGroup bordered role="list" separator={<Separator />} width="100%" maxWidth={380}>
      {team.map((person) => (
        <YGroup.Item key={person.name}>
          <XStack role="listitem" gap="$space.3" alignItems="center" paddingHorizontal="$space.4" paddingVertical="$space.3" hoverStyle={{ backgroundColor: "$backgroundHover" }}>
            <StatusAvatar person={person} size="$4" />
            <YStack flex={1} minWidth={0}>
              <SizableText size="$3" fontWeight="600" ellipsis>
                {person.name}
              </SizableText>
              <SizableText size="$2" color="$color10" ellipsis>
                {person.role}
              </SizableText>
            </YStack>
            <SizableText size="$1" color={person.online ? "$green10" : "$color10"} fontWeight="500">
              {person.online ? "Online" : "Away"}
            </SizableText>
          </XStack>
        </YGroup.Item>
      ))}
    </YGroup>
  );
}

function WithStatus() {
  return (
    <YStack gap="$space.5" width="100%">
      <XStack gap="$space.4" alignItems="center" flexWrap="wrap">
        {team.map((person) => (
          <StatusAvatar key={person.name} person={person} size="$5" />
        ))}
      </XStack>
      <StatusList />
    </YStack>
  );
}

export const AvatarsExample: ComponentDemos = {
  name: "Avatar groups",
  group: "Examples",
  description: "Initials avatars composed into overlapping groups, hover tooltips, presence badges and a people list.",
  demos: [
    {
      title: "Stacked group",
      description: "Overlapping avatars with a page-coloured ring and a +N overflow, at sizes $3 to $6.",
      render: () => <StackedGroups />,
    },
    {
      title: "With tooltips",
      description: "Hovering (or focusing) an avatar lifts it and shows the person's name.",
      render: () => (
        <YStack gap="$space.5" paddingBottom={40} alignItems="flex-start">
          <TooltipGroup size="$4" />
          <TooltipGroup size="$6" />
        </YStack>
      ),
      shot: { hover: "avatar-tip-6-2", wait: 400 },
    },
    {
      title: "With status",
      description: "A presence dot in the corner, and the same avatars in a bordered people list.",
      render: () => <WithStatus />,
    },
  ],
};
