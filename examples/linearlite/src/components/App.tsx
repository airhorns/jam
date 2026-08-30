import { h } from "@jam/core/jsx";
import { currentRoute, type Route } from "../programs/router";
import { Board } from "./Board";
import { IssueList } from "./IssueList";
import { IssuePage } from "./IssuePage";
import { LeftMenu } from "./LeftMenu";
import { NewIssueModal } from "./NewIssueModal";
import { TopFilter } from "./TopFilter";

function ListPage({ route }: { route: Route }) {
  return (
    <div class="page list-page">
      <TopFilter route={route} />
      <IssueList route={route} />
    </div>
  );
}

function BoardPage({ route }: { route: Route }) {
  return (
    <div class="page board-page">
      <TopFilter route={route} />
      <Board />
    </div>
  );
}

function HomePage() {
  return (
    <div class="page home-page">
      <div class="empty-state">Loading projects…</div>
    </div>
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
    <div class="app">
      <LeftMenu route={route} />
      <div class="main">{page(route)}</div>
      <NewIssueModal route={route} />
    </div>
  );
}
