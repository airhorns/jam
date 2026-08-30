import { h } from "@jam/core/jsx";
import { replace } from "@jam/core";
import { formatDate, queryMeta, queryRows, readEntity, readValue } from "../facts";
import { updateIssue } from "../mutations";
import { ROW_HEIGHT, windowFor } from "../programs/queries";
import type { Route } from "../programs/router";
import type { Issue } from "../types";
import { Avatar } from "./Avatar";
import { SyncedIcon } from "./icons";
import { link } from "./links";
import { PriorityMenu, StatusMenu } from "./properties";

function onScroll(event: Event) {
  const scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  const current = windowFor(Number(readValue("ui", "list", "scrollTop") ?? 0));
  if (windowFor(scrollTop).offset !== current.offset) replace("ui", "list", "scrollTop", scrollTop);
}

function IssueRow({ issueId: id }: { issueId: string }) {
  const issue = readEntity<Issue>("issue", id);
  if (!issue) return null;
  return (
    <div class="issue-row" data-issue-id={id}>
      <PriorityMenu menu={`row-priority:${id}`} value={issue.priority} onChange={(priority) => updateIssue(id, { priority })} />
      <StatusMenu menu={`row-status:${id}`} value={issue.status} onChange={(status) => updateIssue(id, { status })} />
      <a class="issue-row-title" href={`/issue/${id}`} onClick={link(`/issue/${id}`)}>
        {issue.title}
      </a>
      <SyncedIcon synced={issue.synced} />
      <span class="issue-row-date">{formatDate(issue.created)}</span>
      <Avatar name={issue.username} />
    </div>
  );
}

/** The windowed list: only the rows in facts are rendered, spacers stand in for the rest. */
export function IssueList({ route }: { route: Route }) {
  const ids = queryRows("list");
  const meta = queryMeta("list");
  const above = meta.offset * ROW_HEIGHT;
  const below = Math.max(0, meta.total - meta.offset - ids.length) * ROW_HEIGHT;
  return (
    <div class="issue-list">
      <div class="issue-list-scroll" key={route.url} onScroll={onScroll}>
        <div class="issue-list-spacer" key="above" style={`height: ${above}px`} />
        {ids.map((id) => (
          <IssueRow key={id} issueId={id} />
        ))}
        <div class="issue-list-spacer" key="below" style={`height: ${below}px`} />
        {meta.ready && ids.length === 0 && (
          <div class="empty-state" key="empty">
            No issues match this view.
          </div>
        )}
      </div>
    </div>
  );
}
