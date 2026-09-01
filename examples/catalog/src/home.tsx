import { h } from "@jam/core/jsx";
import { Anchor, H1, Paragraph, Separator, Text, XStack, YStack, styled } from "@jam/ui";
import { REPO_URL, readme } from "./docs";
import { renderInlineMarkdown, renderMarkdown } from "./markdown";
import { isPlainClick } from "./links";
import { registry } from "./registry";

// The landing page: the repository README, with its title and lead as a hero
// above three ways into the site, then the rest of the README as an article.

const CallToAction = styled(Anchor, {
  name: "CallToAction",
  defaultProps: {
    display: "inline-flex",
    alignItems: "center",
    height: 40,
    paddingHorizontal: 18,
    borderRadius: "$radius.3",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "none",
    color: "$color",
    backgroundColor: "$background",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    cursor: "pointer",
    hoverStyle: { backgroundColor: "$backgroundHover", borderColor: "$borderColorHover" },
  },
  variants: {
    primary: {
      true: {
        color: "$background",
        backgroundColor: "$color",
        borderColor: "$color",
        hoverStyle: { opacity: 0.85 },
      },
    },
  },
});

const EntryCard = styled(Anchor, {
  name: "EntryCard",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 220,
    gap: 6,
    padding: 18,
    borderRadius: "$radius.4",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    textDecorationLine: "none",
    color: "$color",
    hoverStyle: { backgroundColor: "$backgroundHover", borderColor: "$borderColorHover" },
  },
});

type Entry = { href: string; page?: string; title: string; detail: string };

function pageEntries(): Entry[] {
  const components = registry.filter((entry) => entry.group !== "Examples");
  const examples = registry.filter((entry) => entry.group === "Examples");
  return [
    {
      href: "?c=all",
      page: "all",
      title: `${components.length} components`,
      detail: "Interactive demos of every @jam/ui component, each followed by the reference doc agents read.",
    },
    {
      href: `?c=${examples[0]?.name ?? "all"}`,
      page: examples[0]?.name ?? "all",
      title: `${examples.length} example UIs`,
      detail: "Real screens — forms, tables, chat, settings — composed from the kit.",
    },
    {
      href: `${REPO_URL}/tree/main/.agents/skills/jam-ui`,
      title: "The jam-ui skill",
      detail: "The same docs as plain markdown in the repo, for agents building with @jam/ui.",
    },
  ];
}

export function HomePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const navigate = (page: string) => (event: Event) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    onNavigate(page);
  };
  return (
    <YStack gap="$space.7" maxWidth={960} data-page="home">
      <YStack gap="$space.5" paddingTop="$space.4">
        <YStack gap="$space.3">
          <H1 margin={0} size="$11">{readme.title}</H1>
          <Paragraph margin={0} size="$6" opacity={0.8} maxWidth={760}>
            {renderInlineMarkdown(readme.lead)}
          </Paragraph>
        </YStack>
        <XStack gap="$space.3" flexWrap="wrap">
          <CallToAction primary href="?c=all" onClick={navigate("all")} data-testid="home-components">
            Browse components
          </CallToAction>
          <CallToAction href="?c=style-system" onClick={navigate("style-system")} data-testid="home-style-system">
            Style system guide
          </CallToAction>
          <CallToAction href={REPO_URL} target="_blank" rel="noreferrer" data-testid="home-github">
            GitHub ↗
          </CallToAction>
        </XStack>
      </YStack>
      <XStack gap="$space.3" flexWrap="wrap" data-testid="home-entries">
        {pageEntries().map((entry) => (
          <EntryCard
            key={entry.title}
            href={entry.href}
            onClick={entry.page ? navigate(entry.page) : undefined}
            target={entry.page ? undefined : "_blank"}
            rel={entry.page ? undefined : "noreferrer"}
          >
            <Text fontWeight="600" fontSize={15}>{entry.title}</Text>
            <Text fontSize={13} opacity={0.7} lineHeight={19}>{entry.detail}</Text>
          </EntryCard>
        ))}
      </XStack>
      <Separator />
      <YStack tag="article" gap="$space.4" data-docs="readme" aria-label="README">
        {renderMarkdown(readme.body, { onNavigate, relativeLinkBase: `${REPO_URL}/blob/main` })}
      </YStack>
    </YStack>
  );
}
