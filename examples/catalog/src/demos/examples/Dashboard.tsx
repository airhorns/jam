import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, H3, H4, Paragraph, SizableText, Button, Card, Select, Tabs, Progress, Avatar, Separator, Toast, useToastController } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { Page } from "./shared";
import { ArrowDownRightIcon, ArrowUpRightIcon, CalendarIcon, DownloadIcon, InboxIcon, PlusIcon } from "./icons";

const ranges = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
];

type Stat = { label: string; value: string; delta: number; trend: number[] };

const stats: Stat[] = [
  { label: "Revenue", value: "$48,290", delta: 12.4, trend: [32, 40, 36, 48, 52, 47, 60, 58, 66, 72, 70, 84] },
  { label: "Active users", value: "2,381", delta: 3.2, trend: [50, 54, 52, 60, 58, 64, 62, 68, 66, 72, 70, 76] },
  { label: "Conversion", value: "4.7%", delta: -0.8, trend: [70, 66, 72, 64, 60, 62, 56, 58, 52, 50, 46, 44] },
  { label: "Avg. order", value: "$86.20", delta: 1.9, trend: [40, 44, 42, 46, 50, 48, 52, 50, 54, 52, 56, 58] },
];

const revenue: Record<string, { total: string; bars: { label: string; value: number }[] }> = {
  week: {
    total: "$11,420",
    bars: [
      { label: "Mon", value: 48 },
      { label: "Tue", value: 62 },
      { label: "Wed", value: 55 },
      { label: "Thu", value: 78 },
      { label: "Fri", value: 92 },
      { label: "Sat", value: 40 },
      { label: "Sun", value: 34 },
    ],
  },
  month: {
    total: "$48,290",
    bars: [
      { label: "W1", value: 58 },
      { label: "W2", value: 72 },
      { label: "W3", value: 66 },
      { label: "W4", value: 88 },
    ],
  },
  year: {
    total: "$512,860",
    bars: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label, i) => ({
      label,
      value: [38, 42, 50, 46, 58, 64, 60, 72, 70, 82, 90, 96][i],
    })),
  },
};

const storage = [
  { label: "Documents", used: 31, total: 50 },
  { label: "Media", used: 19, total: 50 },
  { label: "Backups", used: 40.5, total: 50 },
];

const activity = [
  { initials: "AL", name: "Ada Lovelace", action: "Deployed api-v2 to prod", when: "2m ago", color: "$purple9" },
  { initials: "GH", name: "Grace Hopper", action: "Invited 3 teammates", when: "26m ago", color: "$blue9" },
  { initials: "MH", name: "Margaret Hamilton", action: "Closed 12 issues in Billing", when: "1h ago", color: "$green9" },
  { initials: "KJ", name: "Katherine Johnson", action: "Upgraded to the Pro plan", when: "3h ago", color: "$orange9" },
];

const percent = (used: number, total: number) => Math.round((used / total) * 100);

function DeltaChip({ delta }: { delta: number }) {
  const up = delta >= 0;
  const Arrow = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <XStack alignItems="center" gap={2} paddingHorizontal="$space.1.5" height={22} borderRadius={999} backgroundColor={up ? "$green3" : "$red3"}>
      <Arrow size={12} color={up ? "var(--green11)" : "var(--red11)"} />
      <SizableText size="$1" fontWeight="600" color={up ? "$green11" : "$red11"}>
        {up ? "+" : ""}{delta.toFixed(1)}%
      </SizableText>
    </XStack>
  );
}

function Sparkline({ values, up }: { values: number[]; up: boolean }) {
  return (
    <XStack alignItems="flex-end" gap={3} height={28} aria-hidden="true">
      {values.map((value, i) => (
        <YStack key={i} flex={1} height={`${value}%`} borderRadius={1} backgroundColor={i === values.length - 1 ? (up ? "$green9" : "$red9") : "$color4"} />
      ))}
    </XStack>
  );
}

function StatCard({ stat }: { stat: Stat }) {
  return (
    <Card bordered flex={1} flexBasis={180} minWidth={160} padding="$space.4" gap="$space.3" backgroundColor="$color1">
      <SizableText size="$2" color="$color10" fontWeight="500">{stat.label}</SizableText>
      <XStack alignItems="center" justifyContent="space-between" gap="$space.2">
        <SizableText size="$8" fontWeight="700" letterSpacing={-0.5} whiteSpace="nowrap">{stat.value}</SizableText>
        <DeltaChip delta={stat.delta} />
      </XStack>
      <Sparkline values={stat.trend} up={stat.delta >= 0} />
    </Card>
  );
}

function BarChart({ bars }: { bars: { label: string; value: number }[] }) {
  return (
    <YStack flex={1} gap="$space.2">
      <XStack flex={1} minHeight={160} alignItems="flex-end" gap="$space.2" borderBottomWidth={1} borderBottomStyle="solid" borderBottomColor="$borderColor">
        {bars.map((bar) => (
          <YStack key={bar.label} flex={1} height="100%" justifyContent="flex-end" alignItems="center">
            <YStack
              width="100%"
              maxWidth={56}
              height={`${bar.value}%`}
              backgroundColor="$blue9"
              borderTopLeftRadius={4}
              borderTopRightRadius={4}
              animation="quick"
              hoverStyle={{ backgroundColor: "$blue10" }}
              aria-label={`${bar.label}: ${bar.value}`}
            />
          </YStack>
        ))}
      </XStack>
      <XStack gap="$space.2">
        {bars.map((bar) => (
          <SizableText key={bar.label} flex={1} size="$1" color="$color10" textAlign="center">
            {bar.label}
          </SizableText>
        ))}
      </XStack>
    </YStack>
  );
}

function RevenueCard({ stateKey }: { stateKey: string }) {
  const [range, setRange] = useDemoState(`${stateKey}.revenueRange`, "month");
  const data = revenue[range] ?? revenue.month;
  return (
    <Card bordered flex={3} flexBasis={420} minWidth={280} padding="$space.5" backgroundColor="$color1">
      <Tabs value={range} onValueChange={setRange} size="$2" gap="$space.5" flex={1}>
        <XStack alignItems="flex-start" justifyContent="space-between" gap="$space.3" flexWrap="wrap">
          <YStack gap={2}>
            <H4 margin={0} size="$5">Revenue</H4>
            <XStack alignItems="baseline" gap="$space.2">
              <SizableText size="$7" fontWeight="700" letterSpacing={-0.5}>{data.total}</SizableText>
              <SizableText size="$2" color="$color10" whiteSpace="nowrap">this {range}</SizableText>
            </XStack>
          </YStack>
          <Tabs.List aria-label="Revenue period">
            <Tabs.Tab value="week" data-testid="dashboard-tab-week">Week</Tabs.Tab>
            <Tabs.Tab value="month" data-testid="dashboard-tab-month">Month</Tabs.Tab>
            <Tabs.Tab value="year" data-testid="dashboard-tab-year">Year</Tabs.Tab>
          </Tabs.List>
        </XStack>
        {Object.entries(revenue).map(([key, value]) => (
          <Tabs.Content key={key} value={key} padding={0}>
            <BarChart bars={value.bars} />
          </Tabs.Content>
        ))}
      </Tabs>
    </Card>
  );
}

function StorageCard() {
  const used = storage.reduce((sum, item) => sum + item.used, 0);
  const total = storage.reduce((sum, item) => sum + item.total, 0);
  return (
    <Card bordered padding="$space.5" gap="$space.4" backgroundColor="$color1">
      <XStack alignItems="baseline" justifyContent="space-between">
        <H4 margin={0} size="$5">Storage</H4>
        <SizableText size="$2" color="$color10">{used} of {total} GB used</SizableText>
      </XStack>
      <YStack gap="$space.3">
        {storage.map((item) => (
          <YStack key={item.label} gap="$space.1.5">
            <XStack justifyContent="space-between" alignItems="baseline">
              <SizableText size="$3" fontWeight="500">{item.label}</SizableText>
              <SizableText size="$2" color="$color10">{percent(item.used, item.total)}%</SizableText>
            </XStack>
            <Progress value={item.used} max={item.total} size="$2" aria-label={`${item.label} storage`}>
              <Progress.Indicator backgroundColor="$blue9" />
            </Progress>
          </YStack>
        ))}
      </YStack>
    </Card>
  );
}

function ActivityCard() {
  return (
    <Card bordered padding="$space.5" gap="$space.3" backgroundColor="$color1">
      <H4 margin={0} size="$5">Recent activity</H4>
      <YStack>
        {activity.map((item, i) => (
          <YStack key={item.name}>
            {i > 0 ? <Separator /> : null}
            <XStack alignItems="center" gap="$space.3" paddingVertical="$space.2.5">
              <Avatar size="$2.5" circular>
                <Avatar.Fallback backgroundColor={item.color}>
                  <SizableText size="$1" fontWeight="600" color="white">{item.initials}</SizableText>
                </Avatar.Fallback>
              </Avatar>
              <YStack flex={1}>
                <SizableText size="$3" fontWeight="600" ellipsis>{item.name}</SizableText>
                <SizableText size="$2" color="$color11" ellipsis>{item.action}</SizableText>
              </YStack>
              <SizableText size="$2" color="$color10" flexShrink={0}>{item.when}</SizableText>
            </XStack>
          </YStack>
        ))}
      </YStack>
    </Card>
  );
}

function TopBar({ stateKey, onExport }: { stateKey: string; onExport?: () => void }) {
  const [range, setRange] = useDemoState(`${stateKey}.range`, "30d");
  return (
    <XStack alignItems="center" justifyContent="space-between" gap="$space.3" flexWrap="wrap">
      <YStack gap={2}>
        <H3 margin={0} size="$8">Overview</H3>
        <Paragraph margin={0} size="$3" color="$color10">Welcome back, Ada. Here's what's happening across your workspace.</Paragraph>
      </YStack>
      <XStack gap="$space.2" alignItems="center" flexWrap="wrap">
        <Select value={range} onValueChange={setRange} size="$3">
          <Select.Trigger width={170} variant="outlined" icon={<CalendarIcon size={14} />} aria-label="Date range" data-testid="dashboard-range">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Viewport>
              {ranges.map((item) => (
                <Select.Item key={item.value} value={item.value}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select>
        <Button size="$3" variant="outlined" icon={<DownloadIcon size={14} />} onClick={onExport} data-testid="dashboard-export">
          Export
        </Button>
        <Button size="$3" theme="accent" icon={<PlusIcon size={14} />}>
          New
        </Button>
      </XStack>
    </XStack>
  );
}

function Overview({ stateKey = "dashboard", onExport }: { stateKey?: string; onExport?: () => void }) {
  return (
    <Page padding="$space.6" gap="$space.5">
      <TopBar stateKey={stateKey} onExport={onExport} />
      <XStack gap="$space.4" flexWrap="wrap">
        {stats.map((stat) => <StatCard key={stat.label} stat={stat} />)}
      </XStack>
      <XStack gap="$space.4" alignItems="stretch" flexWrap="wrap">
        <RevenueCard stateKey={stateKey} />
        <YStack flex={2} flexBasis={280} minWidth={260} gap="$space.4">
          <StorageCard />
          <ActivityCard />
        </YStack>
      </XStack>
    </Page>
  );
}

function OverviewWithToast() {
  const toast = useToastController();
  return (
    <Toast.Provider placement="bottom-right" duration={4000}>
      <Overview stateKey="dashboard.toast" onExport={() => toast.show("Export started", { message: "We'll email you a CSV of the last 30 days when it's ready." })} />
      <Toast.Viewport />
    </Toast.Provider>
  );
}

function EmptyState() {
  return (
    <Page padding="$space.6" alignItems="center" justifyContent="center">
      <Card bordered width="100%" maxWidth={520} padding="$space.8" alignItems="center" gap="$space.4" backgroundColor="$color1">
        <YStack width={56} height={56} borderRadius={999} backgroundColor="$color3" alignItems="center" justifyContent="center">
          <InboxIcon size={24} color="var(--color10)" />
        </YStack>
        <YStack gap="$space.2" alignItems="center">
          <H4 margin={0} size="$6">No reports yet</H4>
          <Paragraph margin={0} color="$color10" textAlign="center" maxWidth={340}>
            Reports summarise your workspace activity over a date range. Create one and it will show up here.
          </Paragraph>
        </YStack>
        <Button theme="accent" size="$3" icon={<PlusIcon size={14} />}>Create a report</Button>
      </Card>
    </Page>
  );
}

export const DashboardExample: ComponentDemos = {
  name: "Dashboard",
  group: "Examples",
  description: "An analytics overview: stat cards with sparklines, a tabbed bar chart, storage progress and an activity feed, plus a toast and an empty state.",
  demos: [
    {
      title: "Overview",
      render: () => <Overview />,
    },
    {
      title: "With toast",
      description: "Export shows an imperative toast in the page's viewport.",
      render: () => <OverviewWithToast />,
      shot: { click: "dashboard-export", wait: 200 },
    },
    {
      title: "Empty state",
      render: () => <EmptyState />,
    },
  ],
};
