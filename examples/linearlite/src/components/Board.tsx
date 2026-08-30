import { h } from "@jam/core/jsx";
import { queryMeta, queryRows, readEntity } from "../facts";
import { moveIssue, updateIssue } from "../mutations";
import { StatusDisplay, StatusValues, type Issue, type StatusValue } from "../types";
import { Avatar } from "./Avatar";
import { StatusIcon } from "./icons";
import { link } from "./links";
import { PriorityMenu } from "./properties";

// Browsers hand the dragged data to drop handlers only; the id is also kept
// here so a drop can be resolved even when dataTransfer is unavailable.
let dragging: string | null = null;

function onDragStart(id: string) {
  return (event: DragEvent) => {
    dragging = id;
    event.dataTransfer?.setData("text/plain", id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  };
}

function onDrop(status: StatusValue, ids: string[]) {
  return (event: DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer?.getData("text/plain") || dragging;
    dragging = null;
    if (!id) return;
    const others = ids.filter((other) => other !== id);
    const targetEl = (event.target as Element).closest<HTMLElement>("[data-issue-id]");
    const targetId = targetEl?.dataset.issueId;
    let index = others.length;
    if (targetEl && targetId && targetId !== id) {
      const rect = targetEl.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      index = others.indexOf(targetId) + (before ? 0 : 1);
    }
    moveIssue(id, status, others[index - 1], others[index]);
  };
}

function IssueCard({ issueId: id }: { issueId: string }) {
  const issue = readEntity<Issue>("issue", id);
  if (!issue) return null;
  return (
    <div class="issue-card" draggable="true" data-issue-id={id} onDragStart={onDragStart(id)} onDragEnd={() => (dragging = null)}>
      <a class="issue-card-title" href={`/issue/${id}`} onClick={link(`/issue/${id}`)}>
        {issue.title}
      </a>
      <div class="issue-card-footer">
        <PriorityMenu menu={`card-priority:${id}`} value={issue.priority} onChange={(priority) => updateIssue(id, { priority })} />
        <Avatar name={issue.username} />
      </div>
    </div>
  );
}

function BoardColumn({ status }: { status: StatusValue }) {
  const name = `board:${status}`;
  const ids = queryRows(name);
  const meta = queryMeta(name);
  const hidden = Math.max(0, meta.total - ids.length);
  return (
    <div class="board-column" data-status={status} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={onDrop(status, ids)}>
      <header class="board-column-header">
        <StatusIcon status={status} />
        <span class="board-column-title">{StatusDisplay[status]}</span>
        <span class="board-column-count">{meta.total}</span>
      </header>
      <div class="board-cards">
        {ids.map((id) => (
          <IssueCard key={id} issueId={id} />
        ))}
        {hidden > 0 && (
          <div class="board-more" key="more">
            {hidden} more not shown
          </div>
        )}
      </div>
    </div>
  );
}

export function Board() {
  return (
    <div class="board">
      {StatusValues.map((status) => (
        <BoardColumn key={status} status={status} />
      ))}
    </div>
  );
}
