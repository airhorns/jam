import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, Card, Button, Slider, Switch, Label, Separator, SizableText, Paragraph, H4, Circle, Avatar, Text, useStableId } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { PlusIcon, MinusIcon, Trash2Icon, CheckIcon, ZapIcon, ShieldIcon, LayersIcon, BellIcon } from "./icons";

function Panel({ children }: { children?: VChild | VChild[] }) {
  return (
    <Card bordered padding="$space.5" width="100%" maxWidth={480}>
      <YStack gap="$space.4">{children}</YStack>
    </Card>
  );
}

// ---- Number slider ----

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** Each digit is keyed by its place and value so only the digits that change remount and drop in. */
function AnimatedNumber({ value }: { value: number }) {
  const digits = String(value).split("");
  return (
    <XStack alignItems="baseline" justifyContent="center" gap={2} height={64} data-testid="micro-readout">
      {digits.map((digit, i) => (
        <SizableText
          key={`${digits.length - i}-${digit}`}
          size="$13"
          fontWeight="700"
          fontVariant="tabular-nums"
          lineHeight={64}
          animation="bouncy"
          animateOnly={["transform", "opacity"]}
          enterStyle={{ y: -28, opacity: 0 }}
        >
          {digit}
        </SizableText>
      ))}
      <SizableText size="$7" color="$color10" fontWeight="500">%</SizableText>
    </XStack>
  );
}

/** Rendered inside the thumb button so it rides along with it; spans keep the button's content valid. */
function ValueBubble({ value }: { value: number }) {
  return (
    <YStack tag="span" theme="accent" position="absolute" bottom="100%" left="50%" x="-50%" marginBottom={10} alignItems="center" pointerEvents="none">
      <YStack tag="span" backgroundColor="$background" borderRadius="$radius.3" paddingHorizontal={8} paddingVertical={3}>
        <SizableText size="$2" fontWeight="600" color="$color" fontVariant="tabular-nums" lineHeight={16} whiteSpace="nowrap">
          {value}
        </SizableText>
      </YStack>
      <YStack tag="span" width={8} height={8} backgroundColor="$background" rotate="45deg" marginTop={-4} />
    </YStack>
  );
}

function NumberSlider() {
  const [value, setValue] = useDemoState("micro.slider", 42);
  const step = (delta: number) => setValue(clamp(value + delta, 0, 100));
  return (
    <Panel>
      <YStack gap="$space.1" alignItems="center">
        <AnimatedNumber value={value} />
        <SizableText size="$2" color="$color10" textTransform="uppercase" letterSpacing={1}>Brightness</SizableText>
      </YStack>
      <XStack alignItems="center" gap="$space.4" paddingTop="$space.5">
        <Button circular size="$3" variant="outlined" aria-label="Decrease" icon={<MinusIcon size={16} />} onClick={() => step(-5)} data-testid="micro-minus" />
        <Slider flex={1} value={value} min={0} max={100} onValueChange={([next]) => setValue(next)}>
          <Slider.Track>
            <Slider.TrackActive />
          </Slider.Track>
          <Slider.Thumb aria-label="Brightness" data-testid="micro-thumb">
            <ValueBubble value={value} />
          </Slider.Thumb>
        </Slider>
        <Button circular size="$3" variant="outlined" aria-label="Increase" icon={<PlusIcon size={16} />} onClick={() => step(5)} data-testid="micro-plus" />
      </XStack>
    </Panel>
  );
}

// ---- Slide in list ----

type Item = { id: number; label: string };

const itemPool = ["Book the flights", "Renew passport", "Pack chargers", "Call the hotel", "Buy travel insurance", "Download offline maps", "Print boarding passes", "Arrange airport pickup"];
const initialItems: Item[] = [
  { id: 1, label: itemPool[0] },
  { id: 2, label: itemPool[1] },
];

function useItems(): [Item[], (next: Item[]) => void] {
  const [json, setJson] = useDemoState("micro.items", JSON.stringify(initialItems));
  return [JSON.parse(json) as Item[], (next) => setJson(JSON.stringify(next))];
}

function SlideInList() {
  const [items, setItems] = useItems();
  const nextId = items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  const add = () => setItems([...items, { id: nextId, label: itemPool[(nextId - 1) % itemPool.length] }]);
  const remove = (id: number) => setItems(items.filter((item) => item.id !== id));

  return (
    <Panel>
      <XStack alignItems="center" justifyContent="space-between">
        <YStack>
          <H4 margin={0}>Trip checklist</H4>
          <SizableText size="$2" color="$color10">{items.length} {items.length === 1 ? "item" : "items"}</SizableText>
        </YStack>
        <Button size="$3" theme="accent" icon={<PlusIcon size={16} />} onClick={add} data-testid="micro-add">
          Add item
        </Button>
      </XStack>
      <YStack gap="$space.2" minHeight={52}>
        {items.length === 0 ? (
          <Paragraph margin={0} color="$color10" textAlign="center" paddingVertical="$space.3">Nothing left to do.</Paragraph>
        ) : null}
        {items.map((item) => (
          <XStack
            key={item.id}
            alignItems="center"
            gap="$space.3"
            paddingVertical="$space.2"
            paddingLeft="$space.3"
            paddingRight="$space.1"
            borderRadius="$radius.3"
            backgroundColor="$color2"
            animation="quick"
            enterStyle={{ opacity: 0, x: -20 }}
          >
            <Circle size={10} backgroundColor="$color9" />
            <SizableText flex={1} size="$3">{item.label}</SizableText>
            <Button
              size="$2"
              circular
              chromeless
              aria-label={`Remove ${item.label}`}
              icon={<Trash2Icon size={14} />}
              color="$color10"
              hoverStyle={{ color: "$red10" }}
              onClick={() => remove(item.id)}
              data-testid={`micro-remove-${item.id}`}
            />
          </XStack>
        ))}
      </YStack>
    </Panel>
  );
}

// ---- Hover and press ----

const features = [
  { icon: ZapIcon, title: "Instant", body: "Renders in a single frame from the fact database." },
  { icon: ShieldIcon, title: "Safe", body: "Every write is validated before it reaches the DOM." },
  { icon: LayersIcon, title: "Layered", body: "Themes stack, so one class swap restyles the tree." },
];

function HoverCards() {
  return (
    <XStack gap="$space.4" flexWrap="wrap" width="100%" justifyContent="center">
      {features.map(({ icon: Icon, title, body }, i) => (
        <Card
          key={title}
          bordered
          elevate
          width={200}
          padding="$space.4"
          cursor="pointer"
          animation="bouncy"
          hoverStyle={{ scale: 1.03, y: -2, borderColor: "$borderColorHover", shadowColor: "$shadow4", shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }}
          pressStyle={{ scale: 0.98, y: 0 }}
          tabIndex={0}
          focusVisibleStyle={{ outlineColor: "$outlineColor", outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 }}
          data-testid={i === 0 ? "micro-hover-card" : undefined}
        >
          <YStack gap="$space.3">
            <Circle size={36} backgroundColor="$color4">
              <Icon size={18} />
            </Circle>
            <YStack gap="$space.1">
              <SizableText size="$5" fontWeight="600">{title}</SizableText>
              <SizableText size="$2" color="$color10">{body}</SizableText>
            </YStack>
          </YStack>
        </Card>
      ))}
    </XStack>
  );
}

// ---- Toggle reveal ----

function SettingRow({ id, label, hint, checked, onChange, testId }: { id: string; label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void; testId?: string }) {
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$space.4">
      <YStack flex={1}>
        <Label htmlFor={id} size="$3" lineHeight={20}>{label}</Label>
        {hint ? <SizableText size="$2" color="$color10">{hint}</SizableText> : null}
      </YStack>
      <Switch id={id} size="$3" checked={checked} onCheckedChange={onChange} data-testid={testId}>
        <Switch.Thumb />
      </Switch>
    </XStack>
  );
}

function ToggleReveal() {
  const id = useStableId();
  const [notify, setNotify] = useDemoState("micro.notify", false);
  const [digest, setDigest] = useDemoState("micro.digest", true);
  const [mentions, setMentions] = useDemoState("micro.mentions", false);
  const [following, setFollowing] = useDemoState("micro.following", false);

  return (
    <Panel>
      <XStack alignItems="center" gap="$space.3">
        <Circle size={36} backgroundColor="$color4">
          <BellIcon size={18} />
        </Circle>
        <YStack flex={1}>
          <H4 margin={0}>Notifications</H4>
          <SizableText size="$2" color="$color10">Choose what you hear about.</SizableText>
        </YStack>
      </XStack>

      <SettingRow id={`${id}-notify`} label="Email notifications" hint="Turn on to pick which emails you get." checked={notify} onChange={setNotify} testId="micro-switch" />

      {notify ? (
        <YStack
          key="extra"
          gap="$space.3"
          padding="$space.3"
          borderRadius="$radius.4"
          backgroundColor="$color2"
          animation="quick"
          enterStyle={{ opacity: 0, y: -8 }}
          data-testid="micro-revealed"
        >
          <SettingRow id={`${id}-digest`} label="Weekly digest" checked={digest} onChange={setDigest} />
          <SettingRow id={`${id}-mentions`} label="Mentions and replies" checked={mentions} onChange={setMentions} />
        </YStack>
      ) : null}

      <Separator />

      <XStack alignItems="center" justifyContent="space-between" gap="$space.4">
        <XStack alignItems="center" gap="$space.3">
          <Avatar size="$4" circular>
            <Avatar.Fallback backgroundColor="$purple5">
              <Text fontWeight="600" fontSize={14} color="$purple11">NW</Text>
            </Avatar.Fallback>
          </Avatar>
          <YStack>
            <SizableText size="$3" fontWeight="600">Nate Wienert</SizableText>
            <SizableText size="$2" color="$color10">@natebirdman</SizableText>
          </YStack>
        </XStack>
        <Button
          size="$3"
          theme={following ? undefined : "accent"}
          variant={following ? "outlined" : undefined}
          width={124}
          onClick={() => setFollowing(!following)}
          icon={
            following ? (
              <XStack key="check" tag="span" animation="bouncy" enterStyle={{ scale: 0, opacity: 0 }}>
                <CheckIcon size={16} />
              </XStack>
            ) : undefined
          }
          data-testid="micro-follow"
        >
          <Button.Text key={following ? "following" : "follow"} animation="quick" enterStyle={{ opacity: 0, y: 6 }}>
            {following ? "Following" : "Follow"}
          </Button.Text>
        </Button>
      </XStack>
    </Panel>
  );
}

// ---- Skeleton loading ----

const activity = [
  { initials: "AL", color: "blue", name: "Ada Lovelace", action: "merged “Faster diff for keyed lists”", when: "2m" },
  { initials: "GH", color: "green", name: "Grace Hopper", action: "commented on the release checklist", when: "14m" },
  { initials: "LT", color: "orange", name: "Linus Torvalds", action: "opened “Tighten the renderer hot path”", when: "1h" },
];

function Bone(props: { width: number | string; height?: number; pulse: boolean; circular?: boolean }) {
  return (
    <YStack
      width={props.width}
      height={props.height ?? 12}
      flexShrink={0}
      borderRadius={props.circular ? 100_000 : "$radius.2"}
      backgroundColor="$color5"
      opacity={props.pulse ? 0.45 : 1}
      animation="medium"
      animateOnly={["opacity"]}
    />
  );
}

function SkeletonRows({ pulse }: { pulse: boolean }) {
  return (
    <YStack key="skeleton" gap="$space.3" aria-busy="true" aria-label="Loading activity" data-testid="micro-skeleton">
      {activity.map((_, i) => (
        <XStack key={i} alignItems="center" gap="$space.3" paddingVertical="$space.1">
          <Bone width={36} height={36} circular pulse={pulse} />
          <YStack flex={1} gap="$space.2">
            <Bone width={i === 1 ? "55%" : "70%"} pulse={pulse} />
            <Bone width={i === 2 ? "40%" : "30%"} height={10} pulse={pulse} />
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

function ActivityRows() {
  return (
    <YStack key="content" gap="$space.3" data-testid="micro-activity">
      {activity.map((entry) => (
        <XStack key={entry.name} alignItems="center" gap="$space.3" paddingVertical="$space.1" animation="quick" enterStyle={{ opacity: 0, y: 6 }}>
          <Avatar size={36} circular>
            <Avatar.Fallback backgroundColor={`$${entry.color}5`}>
              <Text fontWeight="600" fontSize={13} color={`$${entry.color}11`}>{entry.initials}</Text>
            </Avatar.Fallback>
          </Avatar>
          <YStack flex={1}>
            <SizableText size="$3">
              <Text fontWeight="600">{entry.name}</Text> {entry.action}
            </SizableText>
            <SizableText size="$2" color="$color10">{entry.when} ago</SizableText>
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

function SkeletonLoading() {
  const [loading, setLoading] = useDemoState("micro.loading", false);
  const [pulse, setPulse] = useDemoState("micro.pulse", false);

  const reload = () => {
    if (loading) return;
    setLoading(true);
    setPulse(true);
    let on = true;
    const ticker = setInterval(() => {
      on = !on;
      setPulse(on);
    }, 400);
    setTimeout(() => {
      clearInterval(ticker);
      setPulse(false);
      setLoading(false);
    }, 1500);
  };

  return (
    <Panel>
      <XStack alignItems="center" justifyContent="space-between">
        <H4 margin={0}>Team activity</H4>
        <Button size="$3" variant="outlined" onClick={reload} disabled={loading} data-testid="micro-reload">
          {loading ? "Loading…" : "Reload"}
        </Button>
      </XStack>
      {loading ? <SkeletonRows pulse={pulse} /> : <ActivityRows />}
    </Panel>
  );
}

export const MicrointeractionsExample: ComponentDemos = {
  name: "Microinteractions",
  group: "Examples",
  description: "Small motion details built from animation, enterStyle, hoverStyle and pressStyle: an animated number readout, rows that slide in, cards that lift, a settings block that reveals, and skeleton rows that pulse while loading.",
  demos: [
    {
      title: "Number slider",
      description: "The bubble rides on the thumb; digits that change drop into the readout.",
      render: () => <NumberSlider />,
    },
    {
      title: "Slide in list",
      description: "New rows slide in from the left with animation=\"quick\".",
      render: () => <SlideInList />,
      shot: { click: ["micro-add", "micro-add"], wait: 300 },
    },
    {
      title: "Hover and press",
      description: "Cards lift and grow a shadow on hover, and settle to 98% while pressed.",
      render: () => <HoverCards />,
      shot: { hover: "micro-hover-card" },
    },
    {
      title: "Toggle reveal",
      description: "The switch reveals more settings with an enter animation; the button's label and check mark animate in on each change.",
      render: () => <ToggleReveal />,
      shot: { click: ["micro-switch", "micro-follow"], wait: 300 },
    },
    {
      title: "Skeleton loading",
      description: "Reload swaps the list for pulsing placeholders for 1.5 seconds before the rows fade back in.",
      render: () => <SkeletonLoading />,
      shot: { click: "micro-reload", wait: 200 },
    },
  ],
};
