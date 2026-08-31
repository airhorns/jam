import { h } from "@jam/core/jsx";
import { replace } from "@jam/core";
import { ListItem, Paragraph, ScrollView, SizableText, Stack, YStack } from "@jam/ui";
import { formatDate, queryMeta, queryRows, readEntity, readValue } from "../facts";
import { updateIssue } from "../mutations";
import { projectPath } from "../projects";
import { ROW_HEIGHT, windowFor } from "../programs/queries";
import type { Route } from "../programs/router";
import type { Issue } from "../types";
import { Avatar } from "./Avatar";
import { link } from "./links";
import { PriorityMenu, StatusMenu } from "./properties";

function onScroll(event: Event) {
  const scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  const current = windowFor(Number(readValue("ui", "list", "scrollTop") ?? 0));
  if (windowFor(scrollTop).offset !== current.offset) replace("ui", "list", "scrollTop", scrollTop);
}

function IssueRow({ issueId: id }: { issueId: string }) {
  const issue = readEntity<Issue>("issue", id);
  if (!issue?.project) return null;
  const href = projectPath(issue.project, `/issue/${id}`);
  return (
    <ListItem.Frame
      size="$2"
      height={ROW_HEIGHT}
      minHeight={ROW_HEIGHT}
      paddingVertical={0}
      paddingHorizontal="$4"
      gap="$2"
      justifyContent="flex-start"
      borderBottomWidth={1}
      borderColor="$borderColor"
      data-testid="issue-row"
      data-issue-id={id}
    >
      <PriorityMenu menu={`row-priority:${id}`} value={issue.priority} onChange={(priority) => updateIssue(id, { priority })} />
      <StatusMenu menu={`row-status:${id}`} value={issue.status} onChange={(status) => updateIssue(id, { status })} />
      <ListItem.Title
        tag="a"
        href={href}
        onClick={link(href)}
        fontWeight="500"
        cursor="pointer"
        textDecorationLine="none"
        hoverStyle={{ color: "$blue10" }}
        data-testid="issue-row-title"
      >
        {issue.title}
      </ListItem.Title>
      <SizableText size="$2" width={56} textAlign="right" color="$color10" whiteSpace="nowrap" flexShrink={0}>
        {formatDate(issue.created)}
      </SizableText>
      <Avatar name={issue.username} />
    </ListItem.Frame>
  );
}

/** The windowed list: only the rows in facts are rendered, spacers stand in for the rest. */
export function IssueList({ route }: { route: Route }) {
  const ids = queryRows("list");
  const meta = queryMeta("list");
  const above = meta.offset * ROW_HEIGHT;
  const below = Math.max(0, meta.total - meta.offset - ids.length) * ROW_HEIGHT;
  return (
    <ScrollView flex={1} key={route.url} onScroll={onScroll} data-testid="issue-list-scroll">
      {/* flexShrink={0} everywhere: a ScrollView is a flex column with minHeight 0, so children squash instead of scrolling. */}
      <YStack role="list" aria-label="Issues" flexShrink={0}>
        <Stack key="above" height={above} flexShrink={0} aria-hidden="true" />
        {ids.map((id) => (
          <IssueRow key={id} issueId={id} />
        ))}
        <Stack key="below" height={below} flexShrink={0} aria-hidden="true" />
      </YStack>
      {meta.ready && ids.length === 0 && (
        <Paragraph key="empty" paddingVertical="$10" textAlign="center" color="$color10" data-testid="empty-state">
          No issues match this view.
        </Paragraph>
      )}
    </ScrollView>
  );
}
