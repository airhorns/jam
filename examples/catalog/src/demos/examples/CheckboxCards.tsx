import { h } from "@jam/core/jsx";
import { XStack, YStack, Checkbox, Label, SizableText, Separator, styled, useStableId } from "@jam/ui";
import type { CheckedState } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { BellIcon, MailIcon, MessageSquareIcon, PhoneIcon, LayersIcon, ZapIcon, GlobeIcon } from "./icons";

type Icon = typeof BellIcon;

/** A label styled as a selectable card; clicking anywhere on it activates the checkbox it points at. */
const OptionCard = styled<{ active?: boolean }>(Label, {
  name: "OptionCard",
  defaultProps: {
    position: "relative",
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

function CardCheckbox({ id, checked, onCheckedChange, ...rest }: { id: string; checked: CheckedState; onCheckedChange: (next: CheckedState) => void; [key: string]: unknown }) {
  const on = checked !== false;
  return (
    <Checkbox
      id={id}
      size="$4"
      checked={checked}
      onCheckedChange={onCheckedChange}
      backgroundColor={on ? "$blue9" : undefined}
      borderColor={on ? "$blue9" : undefined}
      hoverStyle={on ? { backgroundColor: "$blue10", borderColor: "$blue10" } : undefined}
      {...rest}
    >
      <Checkbox.Indicator color="white" />
    </Checkbox>
  );
}

function useSelection(key: string, initial: string[]): [string[], (item: string, on: boolean) => void, (next: string[]) => void] {
  const [json, setJson] = useDemoState(key, JSON.stringify(initial));
  const selected = JSON.parse(json) as string[];
  const setAll = (next: string[]) => setJson(JSON.stringify(next));
  const toggle = (item: string, on: boolean) => setAll(on ? [...selected.filter((s) => s !== item), item] : selected.filter((s) => s !== item));
  return [selected, toggle, setAll];
}

// ---- Notification preferences ----

const channels: { key: string; title: string; description: string; Icon: Icon; theme: string }[] = [
  { key: "push", title: "Push notifications", description: "Alerts on your phone and desktop as they happen.", Icon: BellIcon, theme: "blue" },
  { key: "email", title: "Email digest", description: "A summary of activity every morning at 8am.", Icon: MailIcon, theme: "purple" },
  { key: "chat", title: "Chat mentions", description: "Only when someone @mentions you in a thread.", Icon: MessageSquareIcon, theme: "green" },
  { key: "sms", title: "Text messages", description: "Security alerts and sign-in codes by SMS.", Icon: PhoneIcon, theme: "orange" },
];

function NotificationPreferences() {
  const id = useStableId();
  const [selected, toggle] = useSelection("checkboxcards.notifications", ["push", "email"]);
  return (
    <YStack gap="$space.2" width="100%" maxWidth={460}>
      {channels.map(({ key, title, description, Icon, theme }) => {
        const checked = selected.includes(key);
        return (
          <OptionCard key={key} htmlFor={`${id}-${key}`} active={checked} data-testid={`notify-card-${key}`}>
            <YStack theme={theme} width={36} height={36} flexShrink={0} alignItems="center" justifyContent="center" borderRadius="$radius.3" backgroundColor="$color4">
              <Icon size={18} color="var(--color10)" />
            </YStack>
            <YStack flex={1} minWidth={0} gap={2}>
              <SizableText size="$4" fontWeight="600">{title}</SizableText>
              <SizableText size="$2" color="$color11">{description}</SizableText>
            </YStack>
            <CardCheckbox id={`${id}-${key}`} checked={checked} onCheckedChange={(next) => toggle(key, next === true)} />
          </OptionCard>
        );
      })}
    </YStack>
  );
}

// ---- Horizontal plan cards ----

const addons: { key: string; title: string; price: string; description: string; Icon: Icon }[] = [
  { key: "storage", title: "Extra storage", price: "$4", description: "1 TB of additional space for your team.", Icon: LayersIcon },
  { key: "support", title: "Priority support", price: "$12", description: "Replies from an engineer within two hours.", Icon: ZapIcon },
  { key: "domain", title: "Custom domain", price: "$6", description: "Serve your workspace from your own domain.", Icon: GlobeIcon },
];

function PlanCards() {
  const id = useStableId();
  const [selected, toggle] = useSelection("checkboxcards.addons", ["support"]);
  return (
    <XStack gap="$space.3" flexWrap="wrap" width="100%">
      {addons.map(({ key, title, price, description, Icon }) => {
        const checked = selected.includes(key);
        return (
          <OptionCard
            key={key}
            htmlFor={`${id}-${key}`}
            active={checked}
            flexDirection="column"
            alignItems="stretch"
            gap="$space.3"
            padding="$space.4"
            flex={1}
            flexBasis={200}
            minWidth={200}
            data-testid={`addon-card-${key}`}
          >
            <XStack alignItems="center" justifyContent="space-between">
              <YStack width={32} height={32} alignItems="center" justifyContent="center" borderRadius={100_000} backgroundColor={checked ? "$blue4" : "$color4"}>
                <Icon size={16} color={checked ? "var(--blue10)" : "var(--color11)"} />
              </YStack>
              <CardCheckbox id={`${id}-${key}`} checked={checked} onCheckedChange={(next) => toggle(key, next === true)} />
            </XStack>
            <YStack gap={2}>
              <SizableText size="$4" fontWeight="600">{title}</SizableText>
              <SizableText size="$2" color="$color11">{description}</SizableText>
            </YStack>
            <XStack alignItems="baseline" gap="$space.1">
              <SizableText size="$7" fontWeight="700" lineHeight={28}>{price}</SizableText>
              <SizableText size="$2" color="$color11">/ month</SizableText>
            </XStack>
          </OptionCard>
        );
      })}
    </XStack>
  );
}

// ---- Indeterminate parent ----

const permissions: { key: string; label: string; description: string }[] = [
  { key: "read", label: "Read", description: "View files and folders" },
  { key: "write", label: "Write", description: "Create and edit files" },
  { key: "delete", label: "Delete", description: "Remove files permanently" },
  { key: "share", label: "Share", description: "Invite people from outside the team" },
];

const Row = styled(Label, {
  name: "PermissionRow",
  defaultProps: {
    flexDirection: "row",
    alignItems: "center",
    gap: "$space.3",
    paddingVertical: "$space.2",
    paddingHorizontal: "$space.3",
    cursor: "pointer",
    hoverStyle: { backgroundColor: "$backgroundHover" },
  },
});

function IndeterminateParent() {
  const id = useStableId();
  const [selected, toggle, setAll] = useSelection("checkboxcards.permissions", ["read", "write"]);
  const all = permissions.every((p) => selected.includes(p.key));
  const none = permissions.every((p) => !selected.includes(p.key));
  const parent: CheckedState = all ? true : none ? false : "indeterminate";
  return (
    <YStack width="100%" maxWidth={400} borderWidth={1} borderStyle="solid" borderColor="$borderColor" borderRadius="$radius.4" backgroundColor="$background" paddingVertical="$space.1" overflow="hidden">
      <Row htmlFor={`${id}-all`} paddingVertical="$space.3">
        <CardCheckbox id={`${id}-all`} checked={parent} onCheckedChange={() => setAll(all ? [] : permissions.map((p) => p.key))} data-testid="permissions-all" />
        <SizableText size="$4" fontWeight="600" flex={1}>Select all permissions</SizableText>
        <SizableText size="$2" color="$color11">
          {selected.length} of {permissions.length}
        </SizableText>
      </Row>
      <Separator marginHorizontal="$space.3" />
      <YStack paddingTop="$space.1">
        {permissions.map(({ key, label, description }) => {
          const checked = selected.includes(key);
          return (
            <Row key={key} htmlFor={`${id}-${key}`} paddingLeft="$space.6">
              <CardCheckbox id={`${id}-${key}`} size="$3" checked={checked} onCheckedChange={(next) => toggle(key, next === true)} data-testid={`permission-${key}`} />
              <YStack flex={1} minWidth={0}>
                <SizableText size="$3" fontWeight="500">{label}</SizableText>
                <SizableText size="$2" color="$color11">{description}</SizableText>
              </YStack>
            </Row>
          );
        })}
      </YStack>
    </YStack>
  );
}

export const CheckboxCardsExample: ComponentDemos = {
  name: "Checkbox cards",
  group: "Examples",
  description: "Checkboxes inside clickable cards and rows: whole-card labels that toggle the box, an accent highlight for the checked state, and a parent checkbox that summarises its children.",
  demos: [
    {
      title: "Notification preferences",
      description: "Each row is a label for its checkbox, so clicking anywhere on the card toggles it.",
      render: () => <NotificationPreferences />,
      shot: { click: "notify-card-chat" },
    },
    {
      title: "Horizontal plan cards",
      description: "Add-ons for a plan; any number can be selected. The cards wrap on narrow screens.",
      render: () => <PlanCards />,
      shot: { click: "addon-card-domain" },
    },
    {
      title: "Indeterminate parent",
      description: "The parent shows a dash while only some children are checked, and toggles all of them.",
      render: () => <IndeterminateParent />,
      shot: { click: "permissions-all" },
    },
  ],
};
