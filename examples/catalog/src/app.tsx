import { h } from "@jam/core/jsx";
import { $, replace, transaction, when } from "@jam/core";
import { XStack, YStack, Text, H2, Paragraph, Button, styled, setTheme } from "@jam/ui";
import { registry, groupOrder, findComponent } from "./registry";
import { findGuide, guides, type Guide } from "./docs";
import { renderInlineMarkdown, renderMarkdown } from "./markdown";
import type { CatalogEntry, Demo } from "./types";

// ---- URL <-> fact state ----

export type CatalogState = {
  component: string;
  theme: "light" | "dark";
  chrome: boolean;
  demo: number | null;
};

function readUrl(): CatalogState {
  const params = new URLSearchParams(location.search);
  const theme = params.get("theme") === "dark" ? "dark" : "light";
  const demo = params.get("demo");
  return {
    component: params.get("c") ?? registry[0].name,
    theme,
    chrome: params.get("chrome") !== "0",
    demo: demo != null && demo !== "" ? Number(demo) : null,
  };
}

function writeUrl(state: CatalogState): void {
  const params = new URLSearchParams();
  params.set("c", state.component);
  params.set("theme", state.theme);
  if (!state.chrome) params.set("chrome", "0");
  if (state.demo != null) params.set("demo", String(state.demo));
  history.replaceState(null, "", `?${params}`);
}

export function applyState(state: CatalogState): void {
  transaction(() => {
    replace("catalog", "component", state.component);
    replace("catalog", "theme", state.theme);
    replace("catalog", "chrome", state.chrome);
    replace("catalog", "demo", state.demo ?? -1);
  });
  setTheme(state.theme);
  document.documentElement.dataset.theme = state.theme;
  writeUrl(state);
}

export function initCatalogState(): void {
  applyState(readUrl());
  window.addEventListener("popstate", () => applyState(readUrl()));
}

function useCatalogState(): CatalogState {
  const component = String(when(["catalog", "component", $.v])[0]?.v ?? registry[0].name);
  const theme = (when(["catalog", "theme", $.v])[0]?.v as "light" | "dark") ?? "light";
  const chrome = when(["catalog", "chrome", $.v])[0]?.v !== false;
  const demoRaw = Number(when(["catalog", "demo", $.v])[0]?.v ?? -1);
  return { component, theme, chrome, demo: demoRaw >= 0 ? demoRaw : null };
}

function update(patch: Partial<CatalogState>): void {
  const params = new URLSearchParams(location.search);
  const current: CatalogState = {
    component: params.get("c") ?? registry[0].name,
    theme: params.get("theme") === "dark" ? "dark" : "light",
    chrome: params.get("chrome") !== "0",
    demo: params.get("demo") ? Number(params.get("demo")) : null,
  };
  applyState({ ...current, ...patch });
}

// ---- Shell components ----

const NavLink = styled("a", {
  name: "NavLink",
  defaultProps: {
    display: "block",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: "$radius.2",
    color: "$color",
    fontSize: 13,
    textDecorationLine: "none",
    cursor: "pointer",
    hoverStyle: { backgroundColor: "$backgroundHover" },
  },
  variants: {
    active: {
      true: { backgroundColor: "$backgroundPress", fontWeight: "600" },
    },
  },
});

const DemoFrame = styled("div", {
  name: "DemoFrame",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "$borderColor",
    borderRadius: "$radius.4",
    overflow: "hidden",
    backgroundColor: "$background",
  },
});

const DemoBody = styled("div", {
  name: "DemoBody",
  defaultProps: {
    display: "flex",
    flexDirection: "column",
    padding: 24,
    minHeight: 80,
    alignItems: "flex-start",
    "$max-sm": { padding: 12 },
  },
});

const GroupLabel = styled(Text, {
  name: "GroupLabel",
  defaultProps: {
    fontSize: 11,
    fontWeight: "600",
    opacity: 0.5,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 10,
    paddingBottom: 4,
  },
});

function Sidebar() {
  const state = useCatalogState();
  return (
    <YStack
      width={220}
      flexShrink={0}
      padding="$space.4"
      gap="$space.2"
      borderRightWidth={1}
      borderRightColor="$borderColor"
      borderRightStyle="solid"
      overflowY="auto"
      height="100vh"
      position="sticky"
      top={0}
      data-testid="sidebar"
    >
      <XStack alignItems="center" justifyContent="space-between" paddingHorizontal={10} paddingBottom="$space.2">
        <Text fontWeight="700" fontSize={15}>@jam/ui</Text>
        <Button
          size="1"
          variant="outlined"
          onClick={() => update({ theme: state.theme === "dark" ? "light" : "dark" })}
          data-testid="theme-toggle"
          aria-label="Dark theme"
          aria-pressed={state.theme === "dark" ? "true" : "false"}
        >
          {state.theme === "dark" ? "☾" : "☀"}
        </Button>
      </XStack>
      <NavLink href="?c=all" active={state.component === "all" ? "true" : "false"} onClick={(e: Event) => { e.preventDefault(); update({ component: "all" }); }}>
        All components
      </NavLink>
      <YStack gap={1} paddingTop="$space.3">
        <GroupLabel>Guides</GroupLabel>
        {guides.map((guide) => (
          <NavLink
            key={guide.slug}
            href={`?c=${guide.slug}`}
            active={state.component.toLowerCase() === guide.slug ? "true" : "false"}
            onClick={(e: Event) => {
              e.preventDefault();
              update({ component: guide.slug, demo: null });
            }}
            data-nav={guide.slug}
          >
            {guide.title}
          </NavLink>
        ))}
      </YStack>
      {groupOrder.map((group) => {
        const items = registry.filter((c) => c.group === group);
        if (items.length === 0) return null;
        return (
          <YStack key={group} gap={1} paddingTop="$space.3">
            <GroupLabel>{group}</GroupLabel>
            {items.map((c) => (
              <NavLink
                key={c.name}
                href={`?c=${c.name}`}
                active={state.component.toLowerCase() === c.name.toLowerCase() ? "true" : "false"}
                onClick={(e: Event) => {
                  e.preventDefault();
                  update({ component: c.name, demo: null });
                }}
                data-nav={c.name}
              >
                {c.name}
              </NavLink>
            ))}
          </YStack>
        );
      })}
    </YStack>
  );
}

function DemoCard({ demo, index }: { demo: Demo; index: number }) {
  return (
    <DemoFrame data-demo={index} data-demo-title={demo.title}>
      <XStack paddingHorizontal="$space.4" paddingVertical="$space.3" borderBottomWidth={1} borderBottomStyle="solid" borderBottomColor="$borderColor" alignItems="baseline" gap="$space.3">
        <Text fontWeight="600" fontSize={13}>{demo.title}</Text>
        {demo.description ? <Text fontSize={12} opacity={0.6}>{demo.description}</Text> : null}
      </XStack>
      <DemoBody>{demo.render()}</DemoBody>
    </DemoFrame>
  );
}

function ComponentPage({ component, only, docs }: { component: CatalogEntry; only: number | null; docs: boolean }) {
  const demos = only != null ? component.demos.filter((_, i) => i === only) : component.demos;
  const doc = component.doc;
  return (
    <YStack gap="$space.8">
      <YStack gap="$space.5" data-component={component.name}>
        <YStack gap="$space.2">
          <H2 margin={0}>{doc?.title ?? component.name}</H2>
          <Paragraph margin={0} opacity={0.7}>{renderInlineMarkdown(doc?.lead ?? component.description)}</Paragraph>
        </YStack>
        {demos.map((demo, i) => <DemoCard key={demo.title} demo={demo} index={only ?? i} />)}
      </YStack>
      {docs && doc ? (
        <YStack tag="article" gap="$space.4" maxWidth={960} data-docs={component.name} aria-label={`${doc.title} reference`}>
          {renderMarkdown(doc.body, { onNavigate: navigateToDoc })}
        </YStack>
      ) : null}
    </YStack>
  );
}

function navigateToDoc(page: string): void {
  update({ component: page, demo: null });
}

function GuidePage({ guide }: { guide: Guide }) {
  return (
    <YStack gap="$space.5" maxWidth={960} data-guide={guide.slug}>
      <YStack gap="$space.2">
        <H2 margin={0}>{guide.title}</H2>
        <Paragraph margin={0} opacity={0.7}>{renderInlineMarkdown(guide.lead, { onNavigate: navigateToDoc })}</Paragraph>
      </YStack>
      <YStack tag="article" gap="$space.4" data-docs={guide.slug} aria-label={`${guide.title} guide`}>
        {renderMarkdown(guide.body, { onNavigate: navigateToDoc })}
      </YStack>
    </YStack>
  );
}

function Main() {
  const state = useCatalogState();
  const isAll = state.component === "all";
  const selected = isAll ? null : findComponent(state.component);
  const guide = isAll || selected ? null : findGuide(state.component);
  return (
    <YStack flex={1} padding="$space.7" $max-sm={{ padding: "$space.3" }} gap="$space.8" minWidth={0} data-testid="main">
      {isAll
        ? registry.map((c) => <ComponentPage key={c.name} component={c} only={null} docs={false} />)
        : selected
          ? <ComponentPage component={selected} only={state.demo} docs={true} />
          : guide
            ? <GuidePage guide={guide} />
            : <Text>Unknown component “{state.component}”</Text>}
    </YStack>
  );
}

export function App() {
  const state = useCatalogState();
  return (
    <XStack minHeight="100vh" alignItems="stretch" fontFamily="$body" backgroundColor="$background" color="$color" className={`t_${state.theme}`}>
      {state.chrome ? <Sidebar /> : null}
      <Main />
    </XStack>
  );
}
