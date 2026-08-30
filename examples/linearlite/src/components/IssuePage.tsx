import { h } from "@jam/core/jsx";
import { _, forget, replace, when } from "@jam/core";
import { formatDate, queryMeta, queryRows, readEntity } from "../facts";
import { addComment, deleteIssue, updateIssue } from "../mutations";
import { forgetRecent } from "../programs/recent";
import { navigate, type Route } from "../programs/router";
import { projectPath } from "../projects";
import type { Comment, Issue } from "../types";
import { Avatar } from "./Avatar";
import { BackIcon } from "./icons";
import { link } from "./links";
import { PriorityMenu, StatusMenu } from "./properties";

function CommentItem({ commentId: id }: { commentId: string }) {
  const comment = readEntity<Comment>("comment", id);
  if (!comment) return null;
  return (
    <div class="comment" data-comment-id={id}>
      <Avatar name={comment.username} />
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">{comment.username}</span>
          <span class="comment-date">{formatDate(comment.created)}</span>
        </div>
        <div class="comment-text">{comment.body}</div>
      </div>
    </div>
  );
}

function submitComment(issueId: string) {
  return (event: Event) => {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).querySelector("textarea");
    const body = input?.value.trim();
    if (!input || !body) return;
    addComment(issueId, body);
    input.value = "";
  };
}

function Comments({ issueId }: { issueId: string }) {
  const ids = queryRows("comments");
  return (
    <section class="comments">
      <h3 class="comments-heading">
        Comments <span class="comments-count">{ids.length}</span>
      </h3>
      <div class="comment-list">
        {ids.map((id) => (
          <CommentItem key={id} commentId={id} />
        ))}
      </div>
      <form class="comment-form" onSubmit={submitComment(issueId)}>
        <textarea class="comment-input" placeholder="Leave a comment…" rows="3" />
        <button type="submit" class="button primary">
          Comment
        </button>
      </form>
    </section>
  );
}

function DeleteControls({ issueId: id, backHref }: { issueId: string; backHref: string }) {
  const confirming = when(["ui", "confirm", "delete", id]).length > 0;
  if (!confirming) {
    return (
      <button type="button" class="button subtle delete-button" onClick={() => replace("ui", "confirm", "delete", id)}>
        Delete
      </button>
    );
  }
  return (
    <span class="delete-confirm">
      <span>Delete this issue?</span>
      <button
        type="button"
        class="button danger confirm-delete-button"
        onClick={() => {
          forget("ui", "confirm", "delete", _);
          forgetRecent(id);
          deleteIssue(id);
          navigate(backHref);
        }}
      >
        Delete
      </button>
      <button type="button" class="button subtle" onClick={() => forget("ui", "confirm", "delete", _)}>
        Cancel
      </button>
    </span>
  );
}

export function IssuePage({ route }: { route: Route }) {
  const id = route.issueId!;
  const backHref = projectPath(route.projectId!);
  const issue = readEntity<Issue>("issue", id);
  const meta = queryMeta("detail");
  if (!issue || issue.project !== route.projectId) {
    return (
      <div class="issue-page">
        <div class="issue-missing">{meta.ready ? "This issue doesn't exist." : "Loading…"}</div>
      </div>
    );
  }
  return (
    <div class="issue-page">
      <header class="issue-header">
        <a class="button subtle back-link" href={backHref} onClick={link(backHref)}>
          <BackIcon />
          Back
        </a>
        <span class="issue-header-title">Issue</span>
        <span class="issue-header-spacer" />
        <DeleteControls issueId={id} backHref={backHref} />
      </header>
      <div class="issue-body">
        <main class="issue-main">
          <input
            class="issue-title"
            value={issue.title ?? ""}
            placeholder="Issue title"
            onInput={(event: Event) => updateIssue(id, { title: (event.target as HTMLInputElement).value })}
          />
          <textarea
            class="issue-description"
            value={issue.description ?? ""}
            placeholder="Add a description…"
            rows="10"
            onInput={(event: Event) => updateIssue(id, { description: (event.target as HTMLTextAreaElement).value })}
          />
          <Comments issueId={id} />
        </main>
        <aside class="issue-sidebar">
          <div class="issue-property">
            <span class="issue-property-label">Status</span>
            <StatusMenu menu="detail-status" value={issue.status} showLabel onChange={(status) => updateIssue(id, { status })} />
          </div>
          <div class="issue-property">
            <span class="issue-property-label">Priority</span>
            <PriorityMenu menu="detail-priority" value={issue.priority} showLabel onChange={(priority) => updateIssue(id, { priority })} />
          </div>
          <div class="issue-property">
            <span class="issue-property-label">Assignee</span>
            <span class="issue-property-value">
              <Avatar name={issue.username} />
              {issue.username}
            </span>
          </div>
          <div class="issue-property">
            <span class="issue-property-label">Created</span>
            <span class="issue-property-value">{formatDate(issue.created)}</span>
          </div>
          <div class="issue-property">
            <span class="issue-property-label">Updated</span>
            <span class="issue-property-value">{formatDate(issue.modified)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
