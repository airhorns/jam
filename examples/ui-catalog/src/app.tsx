import { $, remember, replace, when } from "@jam/core";
import { h } from "@jam/core/jsx";
import {
  Button,
  Card,
  Checkbox,
  Circle,
  H1,
  H2,
  Input,
  Label,
  Paragraph,
  Progress,
  RadioGroup,
  ScrollView,
  Separator,
  Slider,
  Square,
  Switch,
  Tabs,
  Text,
  TextArea,
  XStack,
  YStack,
  setTheme,
} from "@jam/ui";

remember("catalog", "theme", "light");
remember("catalog", "accepted", true);
remember("catalog", "notifications", false);
remember("catalog", "density", "comfortable");
remember("catalog", "tab", "overview");
remember("catalog", "choice", "native");

function valueFor<T extends string | boolean>(key: string, fallback: T): T {
  const stored = when(["catalog", key, $.value])[0]?.value;
  return (typeof stored === typeof fallback ? stored : fallback) as T;
}

function setCatalogTheme(theme: "light" | "dark") {
  replace("catalog", "theme", theme);
  setTheme(theme);
}

function swatch(color: string, label: string) {
  return (
    <YStack class="swatch" gap={6}>
      <div class="swatch-chip" style={`background:${color}`} />
      <Text fontSize={12}>{label}</Text>
    </YStack>
  );
}

function section(title: string, detail: string, body: unknown) {
  return (
    <section class="catalog-section" data-review-section={title.toLowerCase()}>
      <div class="section-heading">
        <H2>{title}</H2>
        <Paragraph>{detail}</Paragraph>
      </div>
      {body}
    </section>
  );
}

export function JamUICatalog() {
  const theme = valueFor("theme", "light") as "light" | "dark";
  const accepted = Boolean(valueFor("accepted", true));
  const notifications = Boolean(valueFor("notifications", false));
  const density = valueFor("density", "comfortable") as string;
  const tab = valueFor("tab", "overview") as string;
  const choice = valueFor("choice", "native") as string;
  const progress = notifications ? 82 : 48;

  return (
    <main class={`catalog-shell theme-${theme}`}>
      <header class="catalog-header">
        <YStack gap={12}>
          <Text class="eyebrow">Jam UI visual review</Text>
          <H1>@jam/ui component catalog</H1>
          <Paragraph class="lede">
            Review exported Jam UI primitives through the real Jam renderer, design tokens,
            themes, and fact-database interactions.
          </Paragraph>
        </YStack>
        <XStack class="toolbar" gap={8} alignItems="center">
          <Button
            variant={theme === "light" ? undefined : "outlined"}
            onClick={() => setCatalogTheme("light")}
          >
            <Text>Light</Text>
          </Button>
          <Button
            variant={theme === "dark" ? undefined : "outlined"}
            onClick={() => setCatalogTheme("dark")}
          >
            <Text>Dark</Text>
          </Button>
          <Switch
            id="notification-switch"
            checked={notifications}
            onCheckedChange={(next) => replace("catalog", "notifications", next)}
          />
        </XStack>
      </header>

      {section(
        "Foundations",
        "Theme tokens, responsive spacing, text hierarchy, and shape primitives.",
        <div class="foundation-grid">
          <Card class="review-card">
            <Card.Header>
              <Text fontWeight={700}>Palette</Text>
              <Text fontSize={13}>Core colors used by the catalog theme.</Text>
            </Card.Header>
            <XStack class="swatch-row" gap={12}>
              {swatch("#007f73", "teal")}
              {swatch("#2f6fcb", "blue")}
              {swatch("#b45f06", "amber")}
              {swatch("#b8325d", "rose")}
            </XStack>
          </Card>
          <Card class="review-card">
            <Card.Header>
              <Text fontWeight={700}>Typography</Text>
              <H2>Heading scale</H2>
              <Paragraph>
                Paragraph text stays readable while controls and metadata remain compact.
              </Paragraph>
            </Card.Header>
          </Card>
          <Card class="review-card">
            <Card.Header>
              <Text fontWeight={700}>Shapes</Text>
            </Card.Header>
            <XStack gap={16} alignItems="center">
              <Square size="5" backgroundColor="$color.teal" />
              <Circle size="5" backgroundColor="$color.blue" />
              <Square size="4" borderRadius="$radius.4" backgroundColor="$color.amber" />
            </XStack>
          </Card>
        </div>,
      )}

      {section(
        "Controls",
        "Buttons, text fields, switches, checkboxes, radios, sliders, and labels.",
        <div class="control-grid">
          <Card class="review-card">
            <Card.Header>
              <Text fontWeight={700}>Actions</Text>
              <XStack gap={8} flexWrap="wrap">
                <Button>
                  <Text>Primary</Text>
                </Button>
                <Button variant="outlined">
                  <Text>Outlined</Text>
                </Button>
                <Button variant="ghost">
                  <Text>Ghost</Text>
                </Button>
              </XStack>
            </Card.Header>
          </Card>
          <Card class="review-card">
            <Card.Header>
              <Text fontWeight={700}>Inputs</Text>
              <YStack gap={10}>
                <Label htmlFor="catalog-name">Name</Label>
                <Input id="catalog-name" placeholder="Ada Lovelace" />
                <TextArea placeholder="Review notes" />
              </YStack>
            </Card.Header>
          </Card>
          <Card class="review-card">
            <Card.Header>
              <Text fontWeight={700}>Choices</Text>
              <YStack gap={12}>
                <XStack gap={10} alignItems="center">
                  <Checkbox
                    checked={accepted}
                    onCheckedChange={(next) => replace("catalog", "accepted", next)}
                  >
                    <Checkbox.Indicator>
                      <Text>✓</Text>
                    </Checkbox.Indicator>
                  </Checkbox>
                  <Text>Accepted</Text>
                </XStack>
                <RadioGroup value={choice} orientation="horizontal">
                  <XStack gap={10} alignItems="center">
                    <RadioGroup.Item
                      value="web"
                      checked={choice === "web"}
                      onSelect={() => replace("catalog", "choice", "web")}
                    >
                      {choice === "web" ? <RadioGroup.Indicator /> : null}
                    </RadioGroup.Item>
                    <Text>Web</Text>
                    <RadioGroup.Item
                      value="native"
                      checked={choice === "native"}
                      onSelect={() => replace("catalog", "choice", "native")}
                    >
                      {choice === "native" ? <RadioGroup.Indicator /> : null}
                    </RadioGroup.Item>
                    <Text>Native</Text>
                  </XStack>
                </RadioGroup>
                <Slider value={[progress]} min={0} max={100} />
              </YStack>
            </Card.Header>
          </Card>
        </div>,
      )}

      {section(
        "Composition",
        "Tabs, progress, scroll containers, separators, and density variants.",
        <div class="composition-grid">
          <Card class="review-card wide">
            <Card.Header>
              <XStack gap={8} flexWrap="wrap">
                <Button
                  variant={density === "comfortable" ? undefined : "outlined"}
                  onClick={() => replace("catalog", "density", "comfortable")}
                >
                  <Text>Comfortable</Text>
                </Button>
                <Button
                  variant={density === "compact" ? undefined : "outlined"}
                  onClick={() => replace("catalog", "density", "compact")}
                >
                  <Text>Compact</Text>
                </Button>
              </XStack>
              <Progress value={progress}>
                <Progress.Indicator width={`${progress}%`} />
              </Progress>
            </Card.Header>
            <Separator />
            <ScrollView class={density === "compact" ? "scroll-sample compact" : "scroll-sample"}>
              <YStack gap={density === "compact" ? 6 : 12}>
                {["Token setup", "Theme switch", "Component audit", "Native smoke"].map((item) => (
                  <XStack class="timeline-row" gap={10} alignItems="center" key={item}>
                    <Circle size="2" backgroundColor="$color.teal" />
                    <Text>{item}</Text>
                  </XStack>
                ))}
              </YStack>
            </ScrollView>
          </Card>
          <Card class="review-card">
            <Tabs value={tab}>
              <Tabs.List>
                <Tabs.Tab onClick={() => replace("catalog", "tab", "overview")}>
                  <Text>Overview</Text>
                </Tabs.Tab>
                <Tabs.Tab onClick={() => replace("catalog", "tab", "native")}>
                  <Text>Native</Text>
                </Tabs.Tab>
              </Tabs.List>
              <Tabs.Content>
                <Text>{tab === "native" ? "Native mode keeps style facts available." : "Web mode injects CSS classes."}</Text>
              </Tabs.Content>
            </Tabs>
          </Card>
        </div>,
      )}
    </main>
  );
}
