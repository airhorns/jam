import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { XStack, YStack, H4, H5, Paragraph, SizableText, Button, Card, ScrollView, Tabs, Square, styled } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { PhoneFrame } from "./shared";
import { BellIcon, HeartIcon, HomeIcon, InboxIcon, SearchIcon, UserIcon, ChevronRightIcon, ClockIcon, StarIcon, ZapIcon } from "./icons";
import type { IconProps } from "./icons";

type Icon = (props: IconProps) => VNode;
type Row = { title: string; body: string };

// Short enough that a recipe shot (1100x800 viewport) still shows the bottom of the phone.
const phoneHeight = 560;

function Header({ title, action }: { title: string; action?: VChild }) {
  return (
    <XStack paddingHorizontal="$space.4" paddingTop="$space.5" paddingBottom="$space.3" alignItems="center" justifyContent="space-between">
      <H4 margin={0}>{title}</H4>
      {action}
    </XStack>
  );
}

function IconTile({ icon, tint, size = 40 }: { icon: Icon; tint: string; size?: number }) {
  const Glyph = icon;
  return (
    <Square size={size} borderRadius="$radius.3" theme={tint} backgroundColor="$color3" color="$color11" flexShrink={0}>
      <Glyph size={Math.round(size * 0.45)} />
    </Square>
  );
}

function RowCard({ row, icon, tint }: { row: Row; icon: Icon; tint: string }) {
  return (
    <Card bordered padding="$space.3" flexDirection="row" alignItems="center" gap="$space.3">
      <IconTile icon={icon} tint={tint} />
      <YStack flex={1} minWidth={0} gap={2}>
        <SizableText size="$3" fontWeight="600" ellipsis>{row.title}</SizableText>
        <Paragraph size="$2" margin={0} color="$color10" ellipsis>{row.body}</Paragraph>
      </YStack>
      <YStack color="$color9" flexShrink={0}>
        <ChevronRightIcon size={16} />
      </YStack>
    </Card>
  );
}

// ---- Bottom tab bar ----

type BottomTab = { value: string; label: string; icon: Icon; rowIcon: Icon; tint: string; rows: Row[] };

const bottomTabs: BottomTab[] = [
  {
    value: "home",
    label: "Home",
    icon: HomeIcon,
    rowIcon: ZapIcon,
    tint: "blue",
    rows: [
      { title: "Morning briefing", body: "3 updates from the teams you follow" },
      { title: "Design review", body: "Today at 2:00 PM · Room 4B" },
      { title: "Weekly summary", body: "Your workspace was 12% more active" },
      { title: "New in Projects", body: "Timeline view is now available" },
      { title: "Pinned: Launch plan", body: "Edited by Mia 20 minutes ago" },
      { title: "Tip of the day", body: "Pin a project to keep it at the top" },
    ],
  },
  {
    value: "search",
    label: "Search",
    icon: SearchIcon,
    rowIcon: ClockIcon,
    tint: "purple",
    rows: [
      { title: "onboarding checklist", body: "Searched yesterday" },
      { title: "Q3 roadmap", body: "Searched 2 days ago" },
      { title: "brand guidelines", body: "Searched 2 days ago" },
      { title: "invoice template", body: "Searched last week" },
      { title: "retro notes", body: "Searched last week" },
      { title: "hiring plan", body: "Searched 2 weeks ago" },
    ],
  },
  {
    value: "inbox",
    label: "Inbox",
    icon: InboxIcon,
    rowIcon: UserIcon,
    tint: "green",
    rows: [
      { title: "Mia Chen", body: "Can you review the launch checklist?" },
      { title: "Ravi Patel", body: "Shipped the new billing flow" },
      { title: "Sofia Rossi", body: "Meeting notes from this morning" },
      { title: "Design team", body: "3 new comments on Home screen" },
      { title: "Billing", body: "Your invoice for August is ready" },
      { title: "Noah Kim", body: "Thanks for the quick turnaround" },
    ],
  },
  {
    value: "profile",
    label: "Profile",
    icon: UserIcon,
    rowIcon: StarIcon,
    tint: "orange",
    rows: [
      { title: "Ada Lovelace", body: "ada@example.com" },
      { title: "Notifications", body: "Push, email and digests" },
      { title: "Appearance", body: "Matches system" },
      { title: "Privacy", body: "Manage who can see your activity" },
      { title: "Help & support", body: "FAQs and contact" },
      { title: "About", body: "Version 4.2.0" },
    ],
  },
];

const TabItem = styled("button", {
  name: "TabBarItem",
  defaultProps: {
    type: "button",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: "$space.2",
    paddingHorizontal: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: "$color10",
    fontFamily: "$body",
    cursor: "pointer",
    animation: "quick",
    hoverStyle: { color: "$color12" },
    focusVisibleStyle: { outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2, outlineOffset: -4, borderRadius: "$radius.3" },
  },
  variants: {
    active: {
      true: { color: "$blue10", hoverStyle: { color: "$blue10" } },
    },
  },
});

function BottomTabBarScreen() {
  const [value, setValue] = useDemoState("tabbar.bottom", "home");
  const tab = bottomTabs.find((t) => t.value === value) ?? bottomTabs[0];
  return (
    <PhoneFrame height={phoneHeight}>
      <Header title={tab.label} action={<Button circular chromeless size="$3" aria-label="Notifications" icon={<BellIcon size={18} />} />} />
      <ScrollView flex={1} paddingHorizontal="$space.4" paddingBottom="$space.4" gap="$space.3" showsScrollIndicator={false}>
        {tab.rows.map((row) => <RowCard key={row.title} row={row} icon={tab.rowIcon} tint={tab.tint} />)}
      </ScrollView>
      <XStack tag="nav" aria-label="Primary" flexShrink={0} borderTopWidth={1} borderTopStyle="solid" borderTopColor="$borderColor" backgroundColor="$background" paddingBottom="$space.3" paddingTop={2}>
        {bottomTabs.map((t) => {
          const active = t.value === tab.value;
          const Glyph = t.icon;
          return (
            <TabItem key={t.value} active={active} aria-current={active ? "page" : undefined} onClick={() => setValue(t.value)} data-testid={`tab-${t.value}`}>
              <Glyph size={24} strokeWidth={active ? 2.25 : 2} />
              <SizableText size="$1" fontWeight={active ? "600" : "500"} color="inherit">{t.label}</SizableText>
            </TabItem>
          );
        })}
      </XStack>
    </PhoneFrame>
  );
}

// ---- Floating pill tab bar ----

type PillTab = { value: string; label: string; icon: Icon; tint: string; tiles: string[] };

const pillTabs: PillTab[] = [
  { value: "home", label: "Home", icon: HomeIcon, tint: "blue", tiles: ["Today", "Projects", "Calendar", "Notes", "Files", "Team"] },
  { value: "explore", label: "Explore", icon: SearchIcon, tint: "purple", tiles: ["Trending", "New", "Nearby", "Collections", "Creators", "Topics"] },
  { value: "saved", label: "Saved", icon: HeartIcon, tint: "pink", tiles: ["Reading list", "Recipes", "Travel", "Design", "Music", "Fitness"] },
  { value: "alerts", label: "Alerts", icon: BellIcon, tint: "orange", tiles: ["Mentions", "Replies", "Follows", "Reminders", "System", "Digests"] },
  { value: "profile", label: "Profile", icon: UserIcon, tint: "green", tiles: ["Account", "Appearance", "Privacy", "Payments", "Devices", "Help"] },
];

const PillItem = styled("button", {
  name: "PillTabItem",
  defaultProps: {
    type: "button",
    display: "flex",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    borderWidth: 0,
    borderRadius: 1000,
    backgroundColor: "transparent",
    color: "$color10",
    cursor: "pointer",
    zIndex: 1,
    animation: "quick",
    hoverStyle: { color: "$color12" },
    focusVisibleStyle: { outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2, outlineOffset: -2 },
  },
  variants: {
    active: {
      true: { color: "$color", hoverStyle: { color: "$color" } },
    },
  },
});

function FloatingPillScreen() {
  const [value, setValue] = useDemoState("tabbar.pill", "home");
  const index = Math.max(0, pillTabs.findIndex((t) => t.value === value));
  const tab = pillTabs[index];
  return (
    <PhoneFrame height={phoneHeight}>
      <Header title={tab.label} />
      <XStack flex={1} paddingHorizontal="$space.4" flexWrap="wrap" gap="$space.3" alignContent="flex-start">
        {tab.tiles.map((tile) => (
          <Card key={tile} bordered flexBasis="40%" flexGrow={1} height={92} padding="$space.3" justifyContent="space-between">
            <IconTile icon={tab.icon} tint={tab.tint} size={32} />
            <SizableText size="$3" fontWeight="600" ellipsis>{tile}</SizableText>
          </Card>
        ))}
      </XStack>
      <XStack
        tag="nav"
        aria-label="Primary"
        position="absolute"
        left="$space.5"
        right="$space.5"
        bottom="$space.5"
        height={64}
        padding={8}
        borderRadius={1000}
        backgroundColor="$color1"
        bordered
        elevation="$4"
      >
        <YStack
          theme="accent"
          position="absolute"
          top={8}
          bottom={8}
          left={8}
          width={`calc((100% - 16px) / ${pillTabs.length})`}
          x={`${index * 100}%`}
          animation="quick"
          borderRadius={1000}
          backgroundColor="$background"
          pointerEvents="none"
        />
        {pillTabs.map((t, i) => {
          const active = i === index;
          const Glyph = t.icon;
          return (
            <PillItem
              key={t.value}
              theme={active ? "accent" : undefined}
              active={active}
              aria-label={t.label}
              aria-current={active ? "page" : undefined}
              onClick={() => setValue(t.value)}
              data-testid={`pill-${t.value}`}
            >
              <Glyph size={22} />
            </PillItem>
          );
        })}
      </XStack>
    </PhoneFrame>
  );
}

// ---- Top tabs with swipeable pages ----

const pages: { value: string; label: string; icon: Icon; tint: string; rows: Row[] }[] = [
  {
    value: "for-you",
    label: "For you",
    icon: StarIcon,
    tint: "yellow",
    rows: [
      { title: "Designing calm interfaces", body: "8 min read · Interaction" },
      { title: "The case for boring tech", body: "5 min read · Engineering" },
      { title: "Notes on typography", body: "12 min read · Design" },
      { title: "A field guide to feedback", body: "6 min read · Teams" },
    ],
  },
  {
    value: "following",
    label: "Following",
    icon: UserIcon,
    tint: "blue",
    rows: [
      { title: "Mia Chen published a post", body: "Shipping the billing redesign" },
      { title: "Ravi Patel started a series", body: "Databases from first principles" },
      { title: "Sofia Rossi shared a note", body: "What we learned from the outage" },
    ],
  },
  {
    value: "trending",
    label: "Trending",
    icon: ZapIcon,
    tint: "red",
    rows: [
      { title: "Why every app needs a tab bar", body: "2.1k reads today" },
      { title: "Animating with transitions only", body: "1.8k reads today" },
      { title: "Themes without the rebuild", body: "1.2k reads today" },
      { title: "The reactive render loop", body: "940 reads today" },
    ],
  },
];

let swipeStart: { x: number; y: number } | null = null;

function SwipeableTabsScreen() {
  const [value, setValue] = useDemoState("tabbar.pager", pages[0].value);
  const index = Math.max(0, pages.findIndex((p) => p.value === value));
  const go = (delta: number) => setValue(pages[Math.min(pages.length - 1, Math.max(0, index + delta))].value);
  return (
    <PhoneFrame height={phoneHeight}>
      <Tabs value={value} onValueChange={setValue} flex={1} minHeight={0}>
        <Header title="Discover" />
        <YStack position="relative">
          <Tabs.List aria-label="Feeds">
            {pages.map((page) => (
              <Tabs.Tab key={page.value} value={page.value} flex={1} size="$3" borderBottomColor="transparent" data-testid={`page-tab-${page.value}`}>
                {page.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <YStack
            position="absolute"
            bottom={0}
            left={0}
            height={2}
            width={`${100 / pages.length}%`}
            x={`${index * 100}%`}
            animation="quick"
            backgroundColor="$blue10"
            pointerEvents="none"
          />
        </YStack>
        <YStack
          flex={1}
          minHeight={0}
          overflow="hidden"
          touchAction="pan-y"
          userSelect="none"
          onPointerDown={(e: PointerEvent) => {
            swipeStart = { x: e.clientX, y: e.clientY };
          }}
          onPointerUp={(e: PointerEvent) => {
            if (!swipeStart) return;
            const dx = e.clientX - swipeStart.x;
            const dy = e.clientY - swipeStart.y;
            swipeStart = null;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
          }}
        >
          <XStack width={`${pages.length * 100}%`} flex={1} x={`${(-index * 100) / pages.length}%`} animation="quick">
            {pages.map((page) => (
              <Tabs.Content key={page.value} value={page.value} forceMount inert={page.value !== value} width={`${100 / pages.length}%`} flexGrow={0} flexShrink={0} padding="$space.4" gap="$space.3">
                <H5 margin={0} color="$color11">{page.label}</H5>
                {page.rows.map((row) => <RowCard key={row.title} row={row} icon={page.icon} tint={page.tint} />)}
              </Tabs.Content>
            ))}
          </XStack>
        </YStack>
      </Tabs>
    </PhoneFrame>
  );
}

export const TabBarExample: ComponentDemos = {
  name: "Tab bar",
  group: "Examples",
  description: "Mobile tab navigation: a classic bottom bar, a floating pill with a sliding indicator, and top tabs driving a swipeable pager.",
  demos: [
    {
      title: "Bottom tab bar",
      description: "Four tabs with icon and label; the active one is coloured and the header follows it.",
      render: () => <BottomTabBarScreen />,
      shot: { click: "tab-search" },
    },
    {
      title: "Floating pill tab bar",
      description: "Icon-only tabs in a floating pill; the indicator slides behind the active one.",
      render: () => <FloatingPillScreen />,
      shot: { click: "pill-saved" },
    },
    {
      title: "Top tabs with swipeable pages",
      description: "Tabs.Content pages sit side by side in a pager that slides as the tab changes; drag horizontally to swipe.",
      render: () => <SwipeableTabsScreen />,
      shot: { click: "page-tab-following" },
    },
  ],
};
