import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import {
  XStack,
  YStack,
  YGroup,
  ListItem,
  Switch,
  Select,
  Separator,
  Avatar,
  AlertDialog,
  Label,
  Paragraph,
  SizableText,
  useStableId,
} from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { BellIcon, ClockIcon, GlobeIcon, LogOutIcon, MailIcon, MapPinIcon, MoonIcon, PencilIcon, SunIcon } from "./icons";

type Preference = {
  key: string;
  title: string;
  subTitle: string;
  initial: boolean;
  icon: (on: boolean) => VChild;
};

const preferences: Preference[] = [
  { key: "notifications", title: "Notifications", subTitle: "Push alerts for mentions and replies", initial: true, icon: () => <BellIcon size={18} /> },
  { key: "darkMode", title: "Dark mode", subTitle: "Follow a dark colour scheme", initial: false, icon: (on) => (on ? <MoonIcon size={18} /> : <SunIcon size={18} />) },
  { key: "location", title: "Location", subTitle: "Show nearby results", initial: true, icon: () => <MapPinIcon size={18} /> },
  { key: "marketing", title: "Marketing emails", subTitle: "Product news and offers", initial: false, icon: () => <MailIcon size={18} /> },
];

function PreferenceRow({ pref }: { pref: Preference }) {
  const [on, setOn] = useDemoState(`settings.pref.${pref.key}`, pref.initial);
  return (
    <YGroup.Item>
      <ListItem
        title={pref.title}
        subTitle={pref.subTitle}
        icon={pref.icon(on)}
        iconAfter={
          <Switch size="$3" checked={on} onCheckedChange={setOn} aria-label={pref.title} data-testid={`settings-${pref.key}`}>
            <Switch.Thumb />
          </Switch>
        }
      />
    </YGroup.Item>
  );
}

function PreferencesList() {
  return (
    <YGroup bordered role="list" separator={<Separator />} width="100%" maxWidth={440}>
      {preferences.map((pref) => <PreferenceRow key={pref.key} pref={pref} />)}
    </YGroup>
  );
}

const languages = [
  ["en", "English"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["ja", "日本語"],
];

const timezones = [
  ["utc", "UTC"],
  ["america/new_york", "New York (GMT-4)"],
  ["america/los_angeles", "Los Angeles (GMT-7)"],
  ["europe/london", "London (GMT+1)"],
  ["asia/tokyo", "Tokyo (GMT+9)"],
];

// Items are plain vnodes so Select can read their labels from its own children.
function options(entries: string[][]) {
  return entries.map(([value, label]) => (
    <Select.Item key={value} value={value}>
      <Select.ItemText>{label}</Select.ItemText>
      <Select.ItemIndicator />
    </Select.Item>
  ));
}

function ChoiceRow({ id, title, subTitle, icon, value, onValueChange, entries }: {
  id: string;
  title: string;
  subTitle: string;
  icon: VChild;
  value: string;
  onValueChange: (value: string) => void;
  entries: string[][];
}) {
  return (
    <YGroup.Item>
      <ListItem.Frame gap="$space.3">
        <ListItem.Icon placement="before">{icon}</ListItem.Icon>
        <YStack flexGrow={1} flexShrink={1} minWidth={0}>
          <ListItem.Title tag="label" htmlFor={id}>{title}</ListItem.Title>
          <ListItem.Subtitle>{subTitle}</ListItem.Subtitle>
        </YStack>
        <Select id={id} size="$3" value={value} onValueChange={onValueChange} placement="bottom-end">
          <Select.Trigger width={180}>
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Viewport>{options(entries)}</Select.Viewport>
          </Select.Content>
        </Select>
      </ListItem.Frame>
    </YGroup.Item>
  );
}

function AccountSection() {
  const id = useStableId();
  const [language, setLanguage] = useDemoState("settings.language", "en");
  const [timezone, setTimezone] = useDemoState("settings.timezone", "europe/london");
  const [signedOut, setSignedOut] = useDemoState("settings.signedOut", false);

  return (
    <YStack gap="$space.3" width="100%" maxWidth={440}>
      <SizableText size="$2" fontWeight="600" color="$color10" textTransform="uppercase" letterSpacing={0.5} paddingHorizontal="$space.2">
        Account
      </SizableText>
      <YGroup bordered role="list" separator={<Separator />}>
        <YGroup.Item>
          <ListItem.Frame gap="$space.3" paddingVertical="$space.3">
            <Avatar size="$4" circular theme="accent">
              <Avatar.Fallback>AL</Avatar.Fallback>
            </Avatar>
            <YStack flexGrow={1} flexShrink={1} minWidth={0}>
              <ListItem.Title fontWeight="600">Ada Lovelace</ListItem.Title>
              <ListItem.Subtitle>ada@example.com</ListItem.Subtitle>
            </YStack>
            <ListItem.Icon placement="after" color="$color10">
              <PencilIcon size={16} />
            </ListItem.Icon>
          </ListItem.Frame>
        </YGroup.Item>

        <ChoiceRow
          id={`${id}-language`}
          title="Language"
          subTitle="Used across the app"
          icon={<GlobeIcon size={18} />}
          value={language}
          onValueChange={setLanguage}
          entries={languages}
        />
        <ChoiceRow
          id={`${id}-timezone`}
          title="Timezone"
          subTitle="For reminders and digests"
          icon={<ClockIcon size={18} />}
          value={timezone}
          onValueChange={setTimezone}
          entries={timezones}
        />

        <YGroup.Item>
          <AlertDialog>
            <AlertDialog.Trigger asChild>
              <ListItem
                tag="button"
                theme="red"
                hoverTheme
                pressTheme
                title={signedOut ? "Signed out" : "Sign out"}
                icon={<LogOutIcon size={18} />}
                data-testid="settings-signout"
              />
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay />
              <AlertDialog.Content width={400}>
                <AlertDialog.Title>Sign out?</AlertDialog.Title>
                <AlertDialog.Description>
                  You'll be signed out on this device. Any unsaved changes will be lost.
                </AlertDialog.Description>
                <XStack gap="$space.3" justifyContent="flex-end">
                  <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
                  <AlertDialog.Action theme="red" onClick={() => setSignedOut(true)}>
                    Sign out
                  </AlertDialog.Action>
                </XStack>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog>
        </YGroup.Item>
      </YGroup>
    </YStack>
  );
}

function AppearanceSwitch() {
  const id = useStableId();
  const [dark, setDark] = useDemoState("settings.appearance.dark", false);
  return (
    <XStack
      width="100%"
      maxWidth={440}
      alignItems="center"
      gap="$space.5"
      padding="$space.4"
      borderWidth={1}
      borderStyle="solid"
      borderColor="$borderColor"
      borderRadius="$radius.4"
      backgroundColor="$background"
    >
      <YStack flexGrow={1} flexShrink={1} minWidth={0} gap="$space.1">
        <Label htmlFor={`${id}-dark`} size="$5" fontWeight="600" lineHeight={24}>
          {dark ? "Dark mode" : "Light mode"}
        </Label>
        <Paragraph margin={0} size="$3" color="$color11">
          Switches the whole app between light and dark colour schemes.
        </Paragraph>
      </YStack>
      <Switch id={`${id}-dark`} size="$6" checked={dark} onCheckedChange={setDark} data-testid="settings-dark">
        <Switch.Thumb display="flex" alignItems="center" justifyContent="center" color={dark ? "$background" : "$color"}>
          {dark ? <MoonIcon size={18} /> : <SunIcon size={18} />}
        </Switch.Thumb>
      </Switch>
    </XStack>
  );
}

export const SettingsExample: ComponentDemos = {
  name: "Settings",
  group: "Examples",
  description: "A settings screen: a preferences list with switches, a grouped account section with selects and a destructive sign-out confirm, and a large switch with icons in its thumb.",
  demos: [
    {
      title: "Preferences list",
      description: "Each row is a ListItem with a Switch as its trailing icon; the dark-mode row's icon follows its state.",
      render: () => <PreferencesList />,
    },
    {
      title: "Account section",
      description: "A bordered YGroup of composed rows: profile, two selects and a red sign-out row that opens an AlertDialog.",
      render: () => <AccountSection />,
      shot: { click: "settings-signout", wait: 300 },
    },
    {
      title: "Switch with icons",
      description: "A large Switch whose thumb carries a sun or moon depending on its state.",
      render: () => <AppearanceSwitch />,
      shot: { click: "settings-dark", wait: 300 },
    },
  ],
};
