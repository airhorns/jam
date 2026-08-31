import { h } from "@jam/core/jsx";
import type { VChild } from "@jam/core/jsx";
import { _, forget, replace, when } from "@jam/core";
import { AlertDialog, Button, Card, Form, H3, Input, Paragraph, ScrollView, Separator, SizableText, TextArea, XStack, YStack } from "@jam/ui";
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
    <XStack gap="$2.5" data-testid="comment" data-comment-id={id}>
      <Avatar name={comment.username} />
      <Card flex={1} size="$3" bordered padded gap="$1" backgroundColor="$color2">
        <XStack alignItems="center" gap="$2">
          <SizableText size="$1" fontWeight="500" data-testid="comment-author">
            {comment.username}
          </SizableText>
          <SizableText size="$1" color="$color10">
            {formatDate(comment.created)}
          </SizableText>
        </XStack>
        <Paragraph size="$2" margin={0} whiteSpace="pre-wrap" data-testid="comment-text">
          {comment.body}
        </Paragraph>
      </Card>
    </XStack>
  );
}

function submitComment(issueId: string) {
  return (event: Event) => {
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
    <YStack tag="section" marginTop="$7" paddingTop="$5" gap="$3" borderTopWidth={1} borderColor="$borderColor">
      <H3 size="$3" margin={0} data-testid="comments-heading">
        Comments{" "}
        <SizableText size="$3" color="$color10" fontWeight="400">
          {ids.length}
        </SizableText>
      </H3>
      <YStack gap="$3">
        {ids.map((id) => (
          <CommentItem key={id} commentId={id} />
        ))}
      </YStack>
      <Form onSubmit={submitComment(issueId)} alignItems="flex-end" gap="$2" marginTop="$3">
        <TextArea
          size="$3"
          rows={3}
          width="100%"
          placeholder="Leave a comment…"
          aria-label="Comment"
          data-testid="comment-input"
        />
        <Form.Trigger asChild>
          <Button size="$3" theme="blue_accent" data-testid="comment-submit">
            Comment
          </Button>
        </Form.Trigger>
      </Form>
    </YStack>
  );
}

function DeleteControls({ issueId: id, backHref }: { issueId: string; backHref: string }) {
  const confirming = when(["ui", "confirm", "delete", id]).length > 0;
  return (
    <AlertDialog
      open={confirming}
      onOpenChange={(open) => (open ? replace("ui", "confirm", "delete", id) : forget("ui", "confirm", "delete", _))}
    >
      <AlertDialog.Trigger asChild>
        <Button size="$2" chromeless color="$color11" data-testid="delete-button">
          Delete
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay />
        <AlertDialog.Content width={420} data-testid="delete-confirm">
          <AlertDialog.Title size="$5">Delete this issue?</AlertDialog.Title>
          <AlertDialog.Description>Its comments go with it, and the change syncs to everyone on the project.</AlertDialog.Description>
          <XStack gap="$3" justifyContent="flex-end">
            <AlertDialog.Cancel size="$3" data-testid="cancel-delete-button">
              Cancel
            </AlertDialog.Cancel>
            <AlertDialog.Action
              size="$3"
              theme="red"
              data-testid="confirm-delete-button"
              onClick={() => {
                forgetRecent(id);
                deleteIssue(id);
                navigate(backHref);
              }}
            >
              Delete
            </AlertDialog.Action>
          </XStack>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog>
  );
}

function Property({ label, children }: { label: string; children?: VChild }) {
  return (
    <XStack alignItems="center" gap="$2" minHeight={28}>
      <SizableText size="$2" width={72} flexShrink={0} color="$color10">
        {label}
      </SizableText>
      <XStack alignItems="center" gap="$2" flexGrow={1} minWidth={0}>
        {children}
      </XStack>
    </XStack>
  );
}

export function IssuePage({ route }: { route: Route }) {
  const id = route.issueId!;
  const backHref = projectPath(route.projectId!);
  const issue = readEntity<Issue>("issue", id);
  const meta = queryMeta("detail");
  if (!issue || issue.project !== route.projectId) {
    return (
      <YStack flex={1} padding="$10" alignItems="center">
        <Paragraph color="$color10" data-testid="issue-missing">
          {meta.ready ? "This issue doesn't exist." : "Loading…"}
        </Paragraph>
      </YStack>
    );
  }
  return (
    <YStack flex={1} minHeight={0} data-testid="issue-page">
      <XStack tag="header" alignItems="center" gap="$2.5" height={48} paddingHorizontal="$4" borderBottomWidth={1} borderColor="$borderColor">
        <Button
          tag="a"
          href={backHref}
          onClick={link(backHref)}
          size="$2"
          chromeless
          icon={<BackIcon />}
          color="$color11"
          data-testid="back-link"
        >
          Back
        </Button>
        <SizableText size="$3" fontWeight="600">
          Issue
        </SizableText>
        <XStack flexGrow={1} />
        <DeleteControls issueId={id} backHref={backHref} />
      </XStack>
      <XStack flex={1} minHeight={0}>
        <ScrollView tag="main" flex={1} minWidth={0} paddingVertical="$6" paddingHorizontal="$7" gap="$3">
          <Input
            size="$4"
            height="auto"
            flexShrink={0}
            paddingVertical="$2"
            fontSize={20}
            fontWeight="600"
            backgroundColor="transparent"
            borderColor="transparent"
            value={issue.title ?? ""}
            placeholder="Issue title"
            aria-label="Issue title"
            data-testid="issue-title"
            hoverStyle={{ borderColor: "$borderColor" }}
            onChangeText={(text) => updateIssue(id, { title: text })}
          />
          <TextArea
            size="$3"
            rows={10}
            flexShrink={0}
            backgroundColor="transparent"
            borderColor="transparent"
            value={issue.description ?? ""}
            placeholder="Add a description…"
            aria-label="Description"
            data-testid="issue-description"
            hoverStyle={{ borderColor: "$borderColor" }}
            onChangeText={(text) => updateIssue(id, { description: text })}
          />
          <Comments issueId={id} />
        </ScrollView>
        <YStack
          tag="aside"
          width={260}
          $max-md={{ display: "none" }}
          paddingVertical="$6"
          paddingHorizontal="$5"
          gap="$3.5"
          borderLeftWidth={1}
          borderColor="$borderColor"
          data-testid="issue-sidebar"
        >
          <Property label="Status">
            <StatusMenu menu="detail-status" value={issue.status} showLabel onChange={(status) => updateIssue(id, { status })} />
          </Property>
          <Property label="Priority">
            <PriorityMenu menu="detail-priority" value={issue.priority} showLabel onChange={(priority) => updateIssue(id, { priority })} />
          </Property>
          <Separator />
          <Property label="Assignee">
            <Avatar name={issue.username} />
            <SizableText size="$2">{issue.username}</SizableText>
          </Property>
          <Property label="Created">
            <SizableText size="$2">{formatDate(issue.created)}</SizableText>
          </Property>
          <Property label="Updated">
            <SizableText size="$2">{formatDate(issue.modified)}</SizableText>
          </Property>
        </YStack>
      </XStack>
    </YStack>
  );
}
