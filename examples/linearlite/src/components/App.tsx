import { h } from "@jam/core/jsx";
import { $, when } from "@jam/core";
import type { LinearlitePG } from "../pglite";
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

function SyncOverlay() {
  const status = when(["sync", "status", "initial-sync"]);
  if (status.length === 0) return null;
  const message = when(["sync", "message", $.message])[0]?.message;
  return (
    <div class="sync-overlay">
      <div class="sync-overlay-card">
        <div class="spinner" />
        <div class="sync-overlay-title">Syncing with Electric</div>
        <div class="sync-overlay-message">{String(message || "")}</div>
      </div>
    </div>
  );
}

// Each page is keyed so switching pages lands on fresh DOM rather than reusing another page's elements.
function page(route: Route) {
  switch (route.page) {
    case "board":
      return <BoardPage key="board" route={route} />;
    case "issue":
      return <IssuePage key={`issue:${route.issueId}`} issueId={route.issueId!} />;
    default:
      return <ListPage key="list" route={route} />;
  }
}

export function App({ pg }: { pg: LinearlitePG }) {
  const route = currentRoute();
  return (
    <div class="app">
      <LeftMenu route={route} />
      <div class="main">{page(route)}</div>
      <NewIssueModal pg={pg} />
      <SyncOverlay />
    </div>
  );
}
