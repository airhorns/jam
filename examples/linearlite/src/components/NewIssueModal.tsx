import { h } from "@jam/core/jsx";
import { _, forget, replace, transaction } from "@jam/core";
import { Button, Dialog, Form, Input, TextArea, XStack } from "@jam/ui";
import { readValue } from "../facts";
import { createIssue } from "../mutations";
import type { Route } from "../programs/router";
import { closeModal, isModalOpen } from "../programs/ui";
import type { PriorityValue, StatusValue } from "../types";
import { CloseIcon } from "./icons";
import { PriorityMenu, StatusMenu } from "./properties";

export const NEW_ISSUE_MODAL = "new-issue";

function close() {
  transaction(() => {
    closeModal(NEW_ISSUE_MODAL);
    forget("ui", "new-issue", _, _);
  });
}

export function NewIssueModal({ route }: { route: Route }) {
  const projectId = route.projectId;
  if (!projectId) return null;
  const status = (readValue("ui", "new-issue", "status") as StatusValue | undefined) ?? "backlog";
  const priority = (readValue("ui", "new-issue", "priority") as PriorityValue | undefined) ?? "none";

  const submit = (event: Event) => {
    const form = event.currentTarget as HTMLFormElement;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value.trim();
    if (!title) return;
    createIssue(projectId, { title, description, status, priority });
    close();
  };

  return (
    <Dialog open={isModalOpen(NEW_ISSUE_MODAL)} onOpenChange={(open) => open || close()}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content width={560} maxWidth="calc(100vw - 32px)" padding={0} gap={0} data-testid="new-issue-modal">
          <XStack alignItems="center" justifyContent="space-between" gap="$3" paddingVertical="$3" paddingHorizontal="$4" borderBottomWidth={1} borderColor="$borderColor">
            <Dialog.Title size="$4" fontWeight="600" margin={0}>
              New issue
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button size="$2" circular chromeless icon={<CloseIcon />} aria-label="Close" data-testid="close-modal" />
            </Dialog.Close>
          </XStack>
          <Form onSubmit={submit} padding="$4" gap="$3">
            <Input
              name="title"
              size="$4"
              fontSize={16}
              fontWeight="500"
              placeholder="Issue title"
              autocomplete="off"
              autofocus="true"
              required
              aria-label="Issue title"
              data-testid="new-issue-title"
            />
            <TextArea
              name="description"
              size="$3"
              rows={6}
              placeholder="Add a description…"
              aria-label="Description"
              data-testid="new-issue-description"
            />
            <XStack gap="$2" flexWrap="wrap">
              <StatusMenu menu="new-issue-status" value={status} showLabel bordered onChange={(value) => replace("ui", "new-issue", "status", value)} />
              <PriorityMenu menu="new-issue-priority" value={priority} showLabel bordered onChange={(value) => replace("ui", "new-issue", "priority", value)} />
            </XStack>
            <XStack justifyContent="flex-end" gap="$2">
              <Dialog.Close asChild>
                <Button size="$3" chromeless>
                  Cancel
                </Button>
              </Dialog.Close>
              <Form.Trigger asChild>
                <Button size="$3" theme="blue_accent" data-testid="save-issue-button">
                  Save issue
                </Button>
              </Form.Trigger>
            </XStack>
          </Form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
