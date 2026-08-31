import { h } from "@jam/core/jsx";
import { Paragraph, XStack, YStack } from "@jam/ui";
import { currentRoute, type Route } from "../programs/router";
import { Board } from "./Board";
import { IssueList } from "./IssueList";
import { IssuePage } from "./IssuePage";
import { LeftMenu } from "./LeftMenu";
import { NewIssueModal } from "./NewIssueModal";
import { TopFilter } from "./TopFilter";

function Page({ children }: { children?: unknown }) {
  return (
    <YStack flex={1} minHeight={0} data-testid="page">
      {children as never}
    </YStack>
  );
}

function ListPage({ route }: { route: Route }) {
  return (
    <Page>
      <TopFilter route={route} />
      <IssueList route={route} />
    </Page>
  );
}

function BoardPage({ route }: { route: Route }) {
  return (
    <Page>
      <TopFilter route={route} />
      <Board />
    </Page>
  );
}

function HomePage() {
  return (
    <Page>
      <Paragraph paddingVertical="$10" textAlign="center" color="$color10" data-testid="empty-state">
        Loading projects…
      </Paragraph>
    </Page>
  );
}

// Each page is keyed so switching pages lands on fresh DOM rather than reusing another page's elements.
function page(route: Route) {
  switch (route.page) {
    case "home":
      return <HomePage key="home" />;
    case "board":
      return <BoardPage key="board" route={route} />;
    case "issue":
      return <IssuePage key={`issue:${route.issueId}`} route={route} />;
    default:
      return <ListPage key="list" route={route} />;
  }
}

export function App() {
  const route = currentRoute();
  return (
    <XStack height="100%" overflow="hidden" backgroundColor="$background" fontFamily="$body" data-testid="app">
      <LeftMenu route={route} />
      <YStack flex={1} minWidth={0} data-testid="main">
        {page(route)}
      </YStack>
      <NewIssueModal route={route} />
    </XStack>
  );
}
