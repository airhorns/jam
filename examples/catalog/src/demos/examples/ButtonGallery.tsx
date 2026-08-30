import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, XGroup, YGroup, Button, Spinner, Tooltip, Popover, ListItem, Separator, SizableText, Paragraph } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import {
  HeartIcon,
  HomeIcon,
  LinkIcon,
  SettingsIcon,
  CheckIcon,
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  ChevronDownIcon,
  SendIcon,
  ClockIcon,
  DownloadIcon,
  GithubIcon,
  AppleIcon,
  FacebookIcon,
  MailIcon,
} from "./icons";

type IconComponent = typeof HeartIcon;

const iconPx: Record<string, number> = { $2: 13, $3: 14, $4: 15, $5: 16 };

function Column({ label, children }: { label: string; children: VChild | VChild[] }) {
  return (
    <YStack gap="$space.2" alignItems="flex-start">
      <SizableText size="$1" color="$color10" textTransform="uppercase" letterSpacing={0.6} fontWeight="600" paddingBottom="$space.1">
        {label}
      </SizableText>
      {children}
    </YStack>
  );
}

const themedColumn = ["blue", "red", "green", "purple", "pink", "yellow", "orange"] as const;

function SegmentedGroup({ theme }: { theme?: string }) {
  const items: [string, IconComponent][] = [
    ["Home", HomeIcon],
    ["Connect", LinkIcon],
    ["Settings", SettingsIcon],
  ];
  return (
    <XGroup theme={theme} size="$3" separator={<Separator vertical />}>
      {items.map(([label, Icon]) => (
        <XGroup.Item key={label}>
          <Button size="$3" icon={<Icon size={14} />}>{label}</Button>
        </XGroup.Item>
      ))}
    </XGroup>
  );
}

function LeftIconGrid() {
  return (
    <XStack gap="$space.6" flexWrap="wrap" alignItems="flex-start">
      <Column label="Themed">
        {themedColumn.map((theme) => (
          <Button key={theme} theme={theme} icon={<HeartIcon size={15} />}>
            {theme[0].toUpperCase() + theme.slice(1)}
          </Button>
        ))}
      </Column>
      <Column label="Styles">
        <Button icon={<HeartIcon size={15} />}>Default</Button>
        <Button disabled icon={<HeartIcon size={15} />}>Disabled</Button>
        <Button theme="accent" icon={<HeartIcon size={15} />}>Accent</Button>
        <Button variant="outlined" icon={<HeartIcon size={15} />}>Outlined</Button>
        <Button variant="ghost" icon={<HeartIcon size={15} />}>Ghost</Button>
        <Button chromeless icon={<HeartIcon size={15} />}>Chromeless</Button>
        <Button theme="red" variant="outlined" icon={<Trash2Icon size={15} />}>Destructive</Button>
      </Column>
      <Column label="Sizes">
        {(["$2", "$3", "$4", "$5"] as const).map((size) => (
          <Button key={size} size={size} icon={<HeartIcon size={iconPx[size]} />}>
            Size {size.slice(1)}
          </Button>
        ))}
      </Column>
      <Column label="Grouped">
        <SegmentedGroup />
        <SegmentedGroup theme="accent" />
        <SegmentedGroup theme="red" />
      </Column>
    </XStack>
  );
}

type SaveStatus = "idle" | "saving" | "saved";

function useSaveStatus(key: string): [SaveStatus, () => void] {
  const [status, setStatus] = useDemoState<SaveStatus>(key, "idle");
  const save = () => {
    setStatus("saving");
    setTimeout(() => {
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    }, 1500);
  };
  return [status as SaveStatus, save];
}

function LoadingButton({
  stateKey,
  idle,
  busy,
  done,
  Icon,
  testId,
  ...buttonProps
}: {
  stateKey: string;
  idle: string;
  busy: string;
  done: string;
  Icon: IconComponent;
  testId?: string;
  theme?: string;
  variant?: "outlined" | "ghost";
}) {
  const [status, save] = useSaveStatus(stateKey);
  const icon =
    status === "saving" ? <Spinner size={15} color="$color" /> : status === "saved" ? <CheckIcon size={15} strokeWidth={2.5} /> : <Icon size={15} />;
  return (
    <Button {...buttonProps} disabled={status === "saving"} onClick={save} icon={icon} data-testid={testId} minWidth={150}>
      {status === "saving" ? busy : status === "saved" ? done : idle}
    </Button>
  );
}

function LoadingButtons() {
  return (
    <YStack gap="$space.4">
      <XStack gap="$space.3" flexWrap="wrap">
        <LoadingButton stateKey="buttongallery.save" theme="accent" idle="Save changes" busy="Saving…" done="Saved" Icon={DownloadIcon} testId="save-button" />
        <LoadingButton stateKey="buttongallery.publish" theme="blue" idle="Publish" busy="Publishing…" done="Published" Icon={SendIcon} />
        <LoadingButton stateKey="buttongallery.schedule" variant="outlined" idle="Schedule" busy="Scheduling…" done="Scheduled" Icon={ClockIcon} />
      </XStack>
      <Paragraph size="$2" color="$color10" margin={0}>
        Click a button: it disables itself and spins for 1.5s, confirms with a check for 2s, then resets.
      </Paragraph>
    </YStack>
  );
}

function IconButton({ label, Icon, theme, testId }: { label: string; Icon: IconComponent; theme?: string; testId?: string }) {
  return (
    <Tooltip placement="top" delay={0}>
      <Tooltip.Trigger asChild>
        <Button circular size="$4" theme={theme} aria-label={label} icon={<Icon size={16} />} data-testid={testId} />
      </Tooltip.Trigger>
      <Tooltip.Content>
        <Tooltip.Arrow />
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}

function SplitButton() {
  const actions: [string, string, IconComponent][] = [
    ["Save as draft", "Keep editing later", PencilIcon],
    ["Save and publish", "Visible to everyone", SendIcon],
    ["Schedule", "Pick a date and time", ClockIcon],
  ];
  return (
    <Popover placement="bottom-end">
      <XGroup theme="accent" separator={<Separator vertical borderColor="$color6" />}>
        <XGroup.Item>
          <Button icon={<DownloadIcon size={15} />}>Save</Button>
        </XGroup.Item>
        <XGroup.Item>
          <Popover.Trigger asChild>
            <Button aria-label="More save options" paddingHorizontal="$space.2" icon={<ChevronDownIcon size={16} />} data-testid="split-menu" />
          </Popover.Trigger>
        </XGroup.Item>
      </XGroup>
      <Popover.Content padding={0} width={260} overflow="hidden">
        <YGroup role="menu" separator={<Separator />}>
          {actions.map(([title, subtitle, Icon]) => (
            <YGroup.Item key={title}>
              <Popover.Close asChild>
                <ListItem role="menuitem" hoverTheme pressTheme size="$3" title={title} subTitle={subtitle} icon={<Icon size={16} />} />
              </Popover.Close>
            </YGroup.Item>
          ))}
        </YGroup>
      </Popover.Content>
    </Popover>
  );
}

function IconOnly() {
  return (
    <XStack gap="$space.6" flexWrap="wrap" alignItems="flex-start">
      <Column label="Icon-only">
        <XStack gap="$space.2">
          <IconButton label="Add item" Icon={PlusIcon} testId="icon-add" />
          <IconButton label="Edit" Icon={PencilIcon} />
          <IconButton label="Delete" Icon={Trash2Icon} theme="red" />
        </XStack>
      </Column>
      <Column label="Split button">
        <SplitButton />
      </Column>
    </XStack>
  );
}

function SocialButtons() {
  return (
    <YStack gap="$space.3" width="100%" maxWidth={360}>
      <Button theme="accent" width="100%" icon={<GithubIcon size={16} />}>Continue with GitHub</Button>
      <Button variant="outlined" width="100%" icon={<AppleIcon size={16} />}>Continue with Apple</Button>
      <Button theme="blue" width="100%" icon={<FacebookIcon size={16} />}>Continue with Facebook</Button>
      <Button width="100%" icon={<MailIcon size={16} />}>Continue with email</Button>
    </YStack>
  );
}

export const ButtonGalleryExample: ComponentDemos = {
  name: "Button gallery",
  group: "Examples",
  description: "Buttons the way an app uses them: icon labels across themes and sizes, a loading state, icon-only and split buttons, and social sign-in.",
  demos: [
    {
      title: "With left icons",
      description: "The `icon` slot sized to each button's font, across themes, styles, sizes and grouped bars.",
      render: () => <LeftIconGrid />,
    },
    {
      title: "Loading",
      description: "A Spinner in the icon slot while the action runs, then a check mark.",
      render: () => <LoadingButtons />,
      shot: { click: "save-button", wait: 200 },
    },
    {
      title: "Icon-only",
      description: "Circular buttons with tooltips, and a split button whose chevron opens a menu.",
      render: () => <IconOnly />,
      shot: { click: "split-menu", hover: "icon-add", wait: 500 },
    },
    {
      title: "Social",
      description: "Full-width sign-in buttons with brand icons.",
      render: () => <SocialButtons />,
    },
  ],
};
