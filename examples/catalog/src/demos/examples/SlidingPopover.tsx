import { h } from "@jam/core/jsx";
import type { VChild, VNode } from "@jam/core/jsx";
import { XStack, YStack, H2, H4, Paragraph, SizableText, Button, Popover, Avatar, Separator, ListItem, Square, Circle, Card } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { Page } from "./shared";
import {
  BellIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CreditCardIcon,
  GlobeIcon,
  HeartIcon,
  LayersIcon,
  LogOutIcon,
  MailIcon,
  MessageSquareIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  ShoppingCartIcon,
  StarIcon,
  UsersIcon,
  ZapIcon,
} from "./icons";
import type { IconProps } from "./icons";

type Icon = (props: IconProps) => VNode;

function Tile({ icon, tint, size = 36 }: { icon: Icon; tint: string; size?: number }) {
  const Glyph = icon;
  return (
    <Square size={size} borderRadius="$radius.3" theme={tint} backgroundColor="$color3" color="$color11" flexShrink={0}>
      <Glyph size={Math.round(size * 0.5)} />
    </Square>
  );
}

function Logo() {
  return (
    <XStack alignItems="center" gap="$space.2">
      <Square size={28} borderRadius="$radius.3" theme="accent" backgroundColor="$background" color="$color">
        <ZapIcon size={16} />
      </Square>
      <SizableText size="$5" fontWeight="700">Acme</SizableText>
    </XStack>
  );
}

function TopBar({ children }: { children?: VChild | VChild[] }) {
  return (
    <XStack tag="header" alignItems="center" justifyContent="space-between" flexWrap="wrap" paddingHorizontal="$space.5" paddingVertical="$space.2" minHeight={64} borderBottomWidth={1} borderBottomStyle="solid" borderBottomColor="$borderColor" gap="$space.3">
      {children}
    </XStack>
  );
}

const photo =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f76b15"/><stop offset="1" stop-color="#e93d82"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><circle cx="50" cy="38" r="18" fill="#fff" opacity="0.9"/><ellipse cx="50" cy="85" rx="30" ry="20" fill="#fff" opacity="0.9"/></svg>`,
  );

function UserAvatar({ size }: { size: number | string }) {
  return (
    <Avatar size={size} circular>
      <Avatar.Image src={photo} alt="" />
      <Avatar.Fallback backgroundColor="$orange9" color="white">AL</Avatar.Fallback>
    </Avatar>
  );
}

// ---- Navigation menu ----

type MenuEntry = { icon: Icon; tint: string; title: string; description: string };
type NavItem = { id: string; label: string; entries: MenuEntry[] };

const navItems: NavItem[] = [
  {
    id: "products",
    label: "Products",
    entries: [
      { icon: ZapIcon, tint: "yellow", title: "Analytics", description: "Understand your traffic in real time" },
      { icon: LayersIcon, tint: "blue", title: "Platform", description: "APIs and SDKs for every stack" },
      { icon: ShieldIcon, tint: "green", title: "Security", description: "SSO, audit logs and compliance" },
    ],
  },
  {
    id: "solutions",
    label: "Solutions",
    entries: [
      { icon: UsersIcon, tint: "purple", title: "For teams", description: "Plan, track and ship together" },
      { icon: ShoppingCartIcon, tint: "orange", title: "For commerce", description: "Storefronts that convert" },
      { icon: GlobeIcon, tint: "blue", title: "For enterprise", description: "Scale with dedicated support" },
    ],
  },
  {
    id: "pricing",
    label: "Pricing",
    entries: [
      { icon: StarIcon, tint: "yellow", title: "Plans", description: "Free, Pro and Business tiers" },
      { icon: CreditCardIcon, tint: "green", title: "Billing", description: "Monthly or annual, cancel anytime" },
    ],
  },
  {
    id: "company",
    label: "Company",
    entries: [
      { icon: HeartIcon, tint: "pink", title: "About", description: "Who we are and what we value" },
      { icon: MessageSquareIcon, tint: "blue", title: "Blog", description: "Product news and engineering notes" },
      { icon: MailIcon, tint: "gray", title: "Contact", description: "Talk to sales or support" },
    ],
  },
];

/** Which nav item's menu is open; one popover per item, so opening one closes the others. */
function useNavMenu() {
  const [active, setActive] = useDemoState("slidingpopover.nav", "");
  return {
    active,
    setOpen: (id: string, open: boolean) => {
      if (open) setActive(id);
      else if (active === id) setActive("");
    },
  };
}

type MenuItemProps = Parameters<typeof ListItem>[0];

function MenuItem(props: MenuItemProps) {
  return <ListItem tag="a" href="#" role="menuitem" hoverTheme pressTheme backgroundColor="transparent" borderRadius="$radius.3" textDecorationLine="none" {...props} />;
}

function MenuRow({ entry }: { entry: MenuEntry }) {
  return <MenuItem icon={<Tile icon={entry.icon} tint={entry.tint} />} title={entry.title} subTitle={entry.description} />;
}

function NavMenuScreen() {
  const menu = useNavMenu();
  return (
    <Page>
      <TopBar>
        <Logo />
        <XStack tag="nav" aria-label="Main" gap="$space.1" flexWrap="wrap">
          {navItems.map((item) => {
            const open = menu.active === item.id;
            return (
              <Popover key={item.id} hoverable open={open} onOpenChange={(next) => menu.setOpen(item.id, next)} placement="bottom">
                <Popover.Trigger asChild>
                  <Button
                    size="$3"
                    chromeless
                    aria-haspopup="menu"
                    backgroundColor={open ? "$backgroundHover" : undefined}
                    iconAfter={<ChevronDownIcon size={14} />}
                    data-testid={`nav-${item.id}`}
                  >
                    {item.label}
                  </Button>
                </Popover.Trigger>
                <Popover.Content role="menu" aria-label={item.label} width={320} padding="$space.2" gap={2}>
                  <Popover.Arrow />
                  {item.entries.map((entry) => <MenuRow key={entry.title} entry={entry} />)}
                </Popover.Content>
              </Popover>
            );
          })}
        </XStack>
        <XStack gap="$space.2">
          <Button size="$3" chromeless>Sign in</Button>
          <Button size="$3" theme="accent">Get started</Button>
        </XStack>
      </TopBar>
      <YStack paddingVertical="$space.9" paddingHorizontal="$space.6" gap="$space.3" alignItems="center">
        <H2 margin={0} textAlign="center">Build faster with Acme</H2>
        <Paragraph margin={0} size="$5" color="$color10" textAlign="center" maxWidth={480}>
          One platform for analytics, payments and infrastructure. Hover the navigation to explore what's inside.
        </Paragraph>
      </YStack>
    </Page>
  );
}

// ---- Profile menu ----

function ProfileMenuScreen() {
  return (
    <Page>
      <TopBar>
        <Logo />
        <XStack alignItems="center" gap="$space.2">
          <Button circular chromeless size="$3" aria-label="Search" icon={<SearchIcon size={18} />} />
          <Button circular chromeless size="$3" aria-label="Notifications" icon={<BellIcon size={18} />} />
          <Popover placement="bottom-end">
            <Popover.Trigger asChild>
              <Button circular chromeless size="$3" aria-label="Account menu" data-testid="profile-avatar">
                <UserAvatar size={32} />
              </Button>
            </Popover.Trigger>
            <Popover.Content aria-label="Account" width={260} padding="$space.2">
              <Popover.Arrow />
              <XStack alignItems="center" gap="$space.3" padding="$space.3">
                <UserAvatar size="$4" />
                <YStack flex={1} minWidth={0}>
                  <SizableText size="$4" fontWeight="600" ellipsis>Ada Lovelace</SizableText>
                  <SizableText size="$2" color="$color10" ellipsis>ada@example.com</SizableText>
                </YStack>
              </XStack>
              <Separator marginBottom="$space.2" />
              <YStack role="menu" aria-label="Account" gap={2}>
                <MenuItem size="$3" icon={<SettingsIcon size={16} />} title="Settings" />
                <MenuItem size="$3" icon={<CreditCardIcon size={16} />} title="Billing" />
                <Separator marginVertical="$space.2" />
                <MenuItem size="$3" color="$red10" icon={<LogOutIcon size={16} />} title="Sign out" />
              </YStack>
            </Popover.Content>
          </Popover>
        </XStack>
      </TopBar>
      <YStack padding="$space.6" gap="$space.4">
        <YStack gap="$space.1">
          <H4 margin={0}>Good afternoon, Ada</H4>
          <Paragraph margin={0} color="$color10">Here's what happened while you were away.</Paragraph>
        </YStack>
        <XStack gap="$space.4" flexWrap="wrap">
          {[
            { label: "Visitors", value: "12,480", delta: "+8.1%" },
            { label: "Revenue", value: "$32,900", delta: "+3.4%" },
            { label: "Open issues", value: "17", delta: "-5" },
          ].map((stat) => (
            <Card key={stat.label} bordered flexBasis={160} flexGrow={1} padding="$space.4" gap="$space.1">
              <SizableText size="$2" color="$color10">{stat.label}</SizableText>
              <SizableText size="$7" fontWeight="700">{stat.value}</SizableText>
              <SizableText size="$2" color={stat.delta.startsWith("-") ? "$red10" : "$green10"}>{stat.delta} this week</SizableText>
            </Card>
          ))}
        </XStack>
      </YStack>
    </Page>
  );
}

// ---- Notifications ----

type Notification = { icon: Icon; tint: string; title: string; body: string; time: string };

const notifications: Notification[] = [
  { icon: MessageSquareIcon, tint: "blue", title: "Mia Chen commented", body: "“Looks great, let's ship it”", time: "2m" },
  { icon: CheckCircleIcon, tint: "green", title: "Deploy succeeded", body: "production · v4.2.0", time: "18m" },
  { icon: UsersIcon, tint: "purple", title: "Ravi Patel joined the team", body: "Say hello in #general", time: "1h" },
  { icon: CreditCardIcon, tint: "orange", title: "Invoice paid", body: "$1,200.00 for August", time: "3h" },
];

function NotificationsScreen() {
  const [readList, setReadList] = useDemoState("slidingpopover.read", notifications[notifications.length - 1].title);
  const read = new Set(readList.split("\n").filter(Boolean));
  const markRead = (titles: string[]) => setReadList([...new Set([...read, ...titles])].join("\n"));
  const unread = notifications.filter((n) => !read.has(n.title)).length;
  return (
    <Page>
      <TopBar>
        <Logo />
        <XStack alignItems="center" gap="$space.2">
          <Button circular chromeless size="$3" aria-label="Search" icon={<SearchIcon size={18} />} />
          <Popover placement="bottom-end">
            <YStack position="relative">
              <Popover.Trigger asChild>
                <Button circular chromeless size="$3" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} icon={<BellIcon size={18} />} data-testid="notif-bell" />
              </Popover.Trigger>
              {unread > 0 ? (
                <Circle
                  size={18}
                  position="absolute"
                  top={-2}
                  right={-2}
                  backgroundColor="$red9"
                  borderWidth={2}
                  borderStyle="solid"
                  borderColor="$background"
                  pointerEvents="none"
                  data-testid="notif-badge"
                >
                  <SizableText size="$1" fontWeight="700" color="white" lineHeight={14}>{unread}</SizableText>
                </Circle>
              ) : null}
            </YStack>
            <Popover.Content width={360} padding={0}>
              <Popover.Arrow />
              <XStack alignItems="center" justifyContent="space-between" paddingLeft="$space.4" paddingRight="$space.2" paddingVertical="$space.2">
                <SizableText size="$4" fontWeight="600">Notifications</SizableText>
                <Button size="$2" chromeless disabled={unread === 0} onClick={() => markRead(notifications.map((n) => n.title))} data-testid="notif-mark-read">
                  Mark all read
                </Button>
              </XStack>
              <Separator />
              <YStack padding="$space.2" gap={2}>
                {notifications.map((n) => {
                  const isUnread = !read.has(n.title);
                  return (
                    <ListItem
                      key={n.title}
                      tag="button"
                      hoverTheme
                      pressTheme
                      backgroundColor="transparent"
                      borderRadius="$radius.3"
                      onClick={() => markRead([n.title])}
                      icon={<Tile icon={n.icon} tint={n.tint} />}
                      title={<ListItem.Title fontWeight={isUnread ? "600" : "400"}>{n.title}</ListItem.Title>}
                      subTitle={n.body}
                      iconAfter={
                        <XStack alignItems="center" gap="$space.2">
                          <SizableText size="$1" color="$color10">{n.time}</SizableText>
                          <Circle size={8} backgroundColor={isUnread ? "$blue9" : "transparent"} role="img" aria-label={isUnread ? "Unread" : ""} />
                        </XStack>
                      }
                    />
                  );
                })}
              </YStack>
            </Popover.Content>
          </Popover>
          <UserAvatar size={32} />
        </XStack>
      </TopBar>
      <YStack padding="$space.6" gap="$space.3">
        <H4 margin={0}>Projects</H4>
        <XStack gap="$space.4" flexWrap="wrap">
          {["Website redesign", "Mobile app", "Billing migration"].map((name, i) => (
            <Card key={name} bordered flexBasis={200} flexGrow={1} padding="$space.4" gap="$space.3">
              <Tile icon={LayersIcon} tint={["blue", "purple", "green"][i]} size={32} />
              <YStack gap={2}>
                <SizableText size="$4" fontWeight="600">{name}</SizableText>
                <SizableText size="$2" color="$color10">Updated {["2h", "yesterday", "3d"][i]} ago</SizableText>
              </YStack>
            </Card>
          ))}
        </XStack>
      </YStack>
    </Page>
  );
}

export const SlidingPopoverExample: ComponentDemos = {
  name: "Sliding popover",
  group: "Examples",
  description: "Popovers as menus in an app's top bar: a hover-driven navigation menu, an account menu on an avatar, and a notification tray with a live badge.",
  demos: [
    {
      title: "Navigation menu",
      description: "Hover or click a nav item to open its menu; moving to the next item switches menus.",
      render: () => <NavMenuScreen />,
      shot: { click: "nav-products" },
    },
    {
      title: "Profile menu",
      description: "The avatar opens an account menu aligned to its right edge.",
      render: () => <ProfileMenuScreen />,
      shot: { click: "profile-avatar" },
    },
    {
      title: "Notifications",
      description: "A bell with an unread badge; opening a notification or Mark all read clears it.",
      render: () => <NotificationsScreen />,
      shot: { click: "notif-bell" },
    },
  ],
};
