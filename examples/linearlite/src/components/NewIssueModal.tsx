import { h } from "@jam/core/jsx";
import { _, forget, replace, transaction } from "@jam/core";
import type { PGliteInterface } from "@electric-sql/pglite";
import { readValue } from "../facts";
import { createIssue } from "../mutations";
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

export function NewIssueModal({ pg }: { pg: PGliteInterface }) {
  if (!isModalOpen(NEW_ISSUE_MODAL)) return null;
  const status = (readValue("ui", "new-issue", "status") as StatusValue | undefined) ?? "backlog";
  const priority = (readValue("ui", "new-issue", "priority") as PriorityValue | undefined) ?? "none";

  const submit = async (event: Event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value.trim();
    if (!title) return;
    await createIssue(pg, { title, description, status, priority });
    close();
  };

  return (
    <div class="modal-backdrop" onClick={(event: MouseEvent) => event.target === event.currentTarget && close()}>
      <div class="modal" role="dialog" aria-label="New issue">
        <header class="modal-header">
          <span class="modal-title">New issue</span>
          <button type="button" class="icon-button" title="Close" onClick={close}>
            <CloseIcon />
          </button>
        </header>
        <form class="modal-form" onSubmit={submit}>
          <input class="new-issue-title" name="title" placeholder="Issue title" autocomplete="off" />
          <textarea class="new-issue-description" name="description" placeholder="Add a description…" rows="6" />
          <div class="modal-properties">
            <StatusMenu menu="new-issue-status" value={status} showLabel onChange={(value) => replace("ui", "new-issue", "status", value)} />
            <PriorityMenu menu="new-issue-priority" value={priority} showLabel onChange={(value) => replace("ui", "new-issue", "priority", value)} />
          </div>
          <footer class="modal-footer">
            <button type="button" class="button subtle" onClick={close}>
              Cancel
            </button>
            <button type="submit" class="button primary save-issue-button">
              Save issue
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
