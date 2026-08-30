import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { XStack, YStack, H2, H3, H4, Paragraph, SizableText, Text, Button, Card, Separator, ToggleGroup, Accordion, ScrollView } from "@jam/ui";
import type { ComponentDemos } from "../../types";
import { useDemoState } from "../state";
import { Page } from "./shared";
import { CheckIcon, MinusIcon, ChevronDownIcon, ZapIcon } from "./icons";

type Plan = {
  id: string;
  name: string;
  tagline: string;
  monthly: number;
  features: string[];
  cta: string;
  popular?: boolean;
};

const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For individuals and side projects.",
    monthly: 15,
    features: ["Up to 3 projects", "1 GB storage", "Community support", "Basic analytics"],
    cta: "Start free trial",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For teams that ship every week.",
    monthly: 40,
    features: ["Unlimited projects", "50 GB storage", "Priority email support", "Advanced analytics", "Custom domains", "Team roles"],
    cta: "Get started",
    popular: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Security and control at scale.",
    monthly: 120,
    features: ["Everything in Pro", "Unlimited storage", "Dedicated success manager", "SSO and SCIM", "Audit log", "99.99% uptime SLA"],
    cta: "Contact sales",
  },
];

const yearlyDiscount = 0.2;

type Cell = string | boolean;

const comparison: { group: string; rows: [string, Cell, Cell, Cell][] }[] = [
  {
    group: "Usage",
    rows: [
      ["Projects", "3", "Unlimited", "Unlimited"],
      ["Storage", "1 GB", "50 GB", "Unlimited"],
      ["Team members", "1", "10", "Unlimited"],
    ],
  },
  {
    group: "Features",
    rows: [
      ["Custom domains", false, true, true],
      ["Advanced analytics", false, true, true],
      ["SSO and SCIM", false, false, true],
      ["Audit log", false, false, true],
    ],
  },
  {
    group: "Support",
    rows: [
      ["Community forum", true, true, true],
      ["Priority email", false, true, true],
      ["Dedicated manager", false, false, true],
    ],
  },
];

const faqs = [
  {
    id: "trial",
    question: "Is there a free trial?",
    answer: "Every paid plan starts with a 14-day trial. You can cancel at any point before it ends and you won't be charged.",
  },
  {
    id: "switch",
    question: "Can I change plans later?",
    answer: "Yes. Upgrades apply immediately and are prorated; downgrades take effect at the start of your next billing cycle.",
  },
  {
    id: "payment",
    question: "What payment methods do you accept?",
    answer: "All major credit and debit cards. Enterprise customers can also pay by invoice with net-30 terms.",
  },
  {
    id: "cancel",
    question: "What happens when I cancel?",
    answer: "Your workspace stays available until the end of the period you've paid for, and you can export your data at any time.",
  },
];

function useBilling(): { yearly: boolean; setBilling: (value: string) => void } {
  const [billing, setBilling] = useDemoState("pricing.billing", "monthly");
  return { yearly: billing === "yearly", setBilling };
}

function Chip({ children, theme, backgroundColor, color }: { children: VChild; theme?: string; backgroundColor?: string; color?: string }) {
  return (
    <XStack theme={theme} alignItems="center" gap="$space.1" paddingHorizontal="$space.2" height={22} borderRadius={999} backgroundColor={backgroundColor ?? "$background"}>
      <SizableText size="$1" fontWeight="600" color={color ?? "$color"} whiteSpace="nowrap">
        {children}
      </SizableText>
    </XStack>
  );
}

function BillingToggle() {
  const { yearly, setBilling } = useBilling();
  return (
    <ToggleGroup type="single" size="$3" value={yearly ? "yearly" : "monthly"} onValueChange={setBilling} disableDeactivation aria-label="Billing period">
      <ToggleGroup.Item value="monthly" data-testid="pricing-monthly">
        Monthly
      </ToggleGroup.Item>
      <ToggleGroup.Item value="yearly" gap="$space.2" data-testid="pricing-yearly">
        Yearly
        <Chip backgroundColor="$green3" color="$green11">Save 20%</Chip>
      </ToggleGroup.Item>
    </ToggleGroup>
  );
}

function PlanCard({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const price = yearly ? Math.round(plan.monthly * (1 - yearlyDiscount)) : plan.monthly;
  return (
    <Card
      bordered
      elevate
      flex={1}
      flexBasis={260}
      minWidth={240}
      padding="$space.5"
      gap="$space.5"
      backgroundColor="$color1"
      borderColor={plan.popular ? "$accent2" : "$borderColor"}
      borderWidth={plan.popular ? 2 : 1}
    >
      <YStack gap="$space.2">
        <XStack alignItems="center" justifyContent="space-between" gap="$space.2">
          <H4 margin={0} size="$6">{plan.name}</H4>
          {plan.popular ? (
            <Chip theme="accent">
              <ZapIcon size={12} /> Most popular
            </Chip>
          ) : null}
        </XStack>
        <Paragraph margin={0} size="$3" color="$color10">{plan.tagline}</Paragraph>
      </YStack>

      <YStack gap="$space.1">
        <XStack alignItems="baseline" gap="$space.1">
          <SizableText size="$10" fontWeight="700" letterSpacing={-1.5}>${price}</SizableText>
          <SizableText size="$3" color="$color10">/ month</SizableText>
        </XStack>
        <SizableText size="$2" color="$color10">
          {yearly ? `Billed yearly as $${(price * 12).toLocaleString("en-US")}` : "Billed monthly"}
        </SizableText>
      </YStack>

      <Button theme={plan.popular ? "accent" : undefined} variant={plan.popular ? undefined : "outlined"} width="100%" size="$3">
        {plan.cta}
      </Button>

      <Separator />

      <YStack gap="$space.2">
        {plan.features.map((feature) => (
          <XStack key={feature} gap="$space.2" alignItems="center">
            <CheckIcon size={16} color="var(--green10)" />
            <SizableText size="$3" color="$color11">{feature}</SizableText>
          </XStack>
        ))}
      </YStack>
    </Card>
  );
}

function Plans() {
  const { yearly } = useBilling();
  return (
    <Page padding="$space.8" gap="$space.7" alignItems="center">
      <YStack gap="$space.4" alignItems="center" maxWidth={560}>
        <H2 margin={0} textAlign="center">Plans for every stage</H2>
        <Paragraph margin={0} color="$color10" textAlign="center">
          Start free, then pay as you grow. Every plan includes unlimited viewers, SSL and 24/7 monitoring.
        </Paragraph>
        <BillingToggle />
      </YStack>
      <XStack gap="$space.4" width="100%" maxWidth={960} alignItems="stretch" flexWrap="wrap">
        {plans.map((plan) => <PlanCard key={plan.id} plan={plan} yearly={yearly} />)}
      </XStack>
    </Page>
  );
}

function ComparisonCell({ value }: { value: Cell }) {
  if (value === true) return <CheckIcon size={16} color="var(--green10)" aria-label="Included" />;
  if (value === false) return <MinusIcon size={16} color="var(--color8)" aria-label="Not included" />;
  return <SizableText size="$3">{value}</SizableText>;
}

function ComparisonTable() {
  return (
    <Page padding="$space.8" alignItems="center">
      <Card bordered width="100%" maxWidth={880} backgroundColor="$color1" paddingVertical="$space.2" overflow="hidden">
        <ScrollView horizontal>
          <YStack width="100%" minWidth={560}>
            <XStack paddingHorizontal="$space.5" paddingVertical="$space.3" alignItems="center">
              <YStack flex={2}>
                <H4 margin={0} size="$5">Compare plans</H4>
              </YStack>
              {plans.map((plan) => (
                <YStack key={plan.id} flex={1} alignItems="center" gap={2}>
                  <SizableText size="$3" fontWeight="600">{plan.name}</SizableText>
                  <SizableText size="$1" color="$color10">${plan.monthly}/mo</SizableText>
                </YStack>
              ))}
            </XStack>
            {comparison.map((section) => (
              <YStack key={section.group}>
                <Separator />
                <XStack paddingHorizontal="$space.5" paddingTop="$space.3" paddingBottom="$space.1">
                  <SizableText size="$1" fontWeight="600" color="$color10" textTransform="uppercase" letterSpacing={0.6}>
                    {section.group}
                  </SizableText>
                </XStack>
                {section.rows.map(([feature, ...cells], index) => (
                  <YStack key={feature}>
                    {index > 0 ? <Separator marginHorizontal="$space.5" /> : null}
                    <XStack paddingHorizontal="$space.5" height={40} alignItems="center" hoverStyle={{ backgroundColor: "$backgroundHover" }}>
                      <YStack flex={2}>
                        <SizableText size="$3" color="$color11">{feature}</SizableText>
                      </YStack>
                      {cells.map((cell, i) => (
                        <XStack key={plans[i].id} flex={1} justifyContent="center" alignItems="center">
                          <ComparisonCell value={cell} />
                        </XStack>
                      ))}
                    </XStack>
                  </YStack>
                ))}
              </YStack>
            ))}
          </YStack>
        </ScrollView>
      </Card>
    </Page>
  );
}

function Faq() {
  const [open, setOpen] = useDemoState("pricing.faq", "trial");
  return (
    <Page padding="$space.8" alignItems="center">
      <YStack gap="$space.5" width="100%" maxWidth={680}>
        <YStack gap="$space.2" alignItems="center">
          <H3 margin={0} size="$8" textAlign="center">Frequently asked questions</H3>
          <Paragraph margin={0} color="$color10" textAlign="center">
            Still have questions?{" "}
            <Text tag="a" href="#" color="$color" textDecorationLine="underline" hoverStyle={{ color: "$colorHover" }}>
              Talk to us
            </Text>
            .
          </Paragraph>
        </YStack>
        <Accordion type="single" collapsible value={open} onValueChange={setOpen} backgroundColor="$color1">
          {faqs.map((faq) => (
            <Accordion.Item key={faq.id} value={faq.id}>
              <Accordion.Header>
                <Accordion.Trigger data-testid={`pricing-faq-${faq.id}`}>
                  <Text>{faq.question}</Text>
                  <Accordion.Indicator>
                    <ChevronDownIcon size={16} />
                  </Accordion.Indicator>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <Paragraph margin={0} size="$3" color="$color11">{faq.answer}</Paragraph>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion>
      </YStack>
    </Page>
  );
}

export const PricingExample: ComponentDemos = {
  name: "Pricing",
  group: "Examples",
  description: "A pricing page: a monthly/yearly toggle driving three plan cards, a feature comparison grid and an FAQ accordion.",
  demos: [
    {
      title: "Plans",
      description: "Switching to yearly billing discounts every plan by 20%.",
      render: () => <Plans />,
      shot: { click: "pricing-yearly" },
    },
    {
      title: "Comparison table",
      render: () => <ComparisonTable />,
    },
    {
      title: "FAQ",
      render: () => <Faq />,
    },
  ],
};
