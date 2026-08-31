import { h } from "@jam/core/jsx";
import { Card, ScrollView, SizableText, XStack, YStack } from "@jam/ui";
import { queryMeta, queryRows, readEntity } from "../facts";
import { moveIssue, updateIssue } from "../mutations";
import { projectPath } from "../projects";
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
  if (!issue?.project) return null;
  const href = projectPath(issue.project, `/issue/${id}`);
  return (
    <Card
      size="$3"
      bordered
      padded
      gap="$2.5"
      flexShrink={0}
      backgroundColor="$background"
      cursor="grab"
      pressStyle={{ cursor: "grabbing" }}
      draggable="true"
      data-testid="issue-card"
      data-issue-id={id}
      onDragStart={onDragStart(id)}
      onDragEnd={() => (dragging = null)}
    >
      <SizableText
        tag="a"
        size="$2"
        fontWeight="500"
        href={href}
        onClick={link(href)}
        cursor="pointer"
        textDecorationLine="none"
        hoverStyle={{ color: "$blue10" }}
        data-testid="issue-card-title"
      >
        {issue.title}
      </SizableText>
      <XStack alignItems="center" justifyContent="space-between">
        <PriorityMenu menu={`card-priority:${id}`} value={issue.priority} onChange={(priority) => updateIssue(id, { priority })} />
        <Avatar name={issue.username} />
      </XStack>
    </Card>
  );
}

function BoardColumn({ status }: { status: StatusValue }) {
  const name = `board:${status}`;
  const ids = queryRows(name);
  const meta = queryMeta(name);
  const hidden = Math.max(0, meta.total - ids.length);
  return (
    <YStack
      width={300}
      flexShrink={0}
      borderRadius="$4"
      backgroundColor="$color3"
      data-testid="board-column"
      data-status={status}
      onDragOver={(event: DragEvent) => event.preventDefault()}
      onDrop={onDrop(status, ids)}
    >
      <XStack tag="header" alignItems="center" gap="$2" paddingHorizontal="$3" paddingVertical="$2.5" flexShrink={0}>
        <StatusIcon status={status} />
        <SizableText size="$2" fontWeight="600" data-testid="board-column-title">
          {StatusDisplay[status]}
        </SizableText>
        <SizableText size="$2" color="$color10" data-testid="board-column-count">
          {meta.total}
        </SizableText>
      </XStack>
      <ScrollView flex={1} minHeight={60} gap="$2" paddingHorizontal="$2" paddingBottom="$2" data-testid="board-cards">
        {ids.map((id) => (
          <IssueCard key={id} issueId={id} />
        ))}
        {hidden > 0 && (
          <SizableText key="more" size="$1" color="$color10" textAlign="center" paddingVertical="$2">
            {hidden} more not shown
          </SizableText>
        )}
      </ScrollView>
    </YStack>
  );
}

export function Board() {
  return (
    <ScrollView horizontal flex={1} gap="$3" padding="$3" backgroundColor="$color2" data-testid="board">
      {StatusValues.map((status) => (
        <BoardColumn key={status} status={status} />
      ))}
    </ScrollView>
  );
}
