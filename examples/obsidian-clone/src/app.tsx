import { h } from "@jam/core/jsx";
import { createNote, ensureSeedNotes, getBacklinks, getNoteOutline, getNoteStats, getOutgoingLinks, getSelectedNote, listNotes, selectNote, updateNoteBody, updateNoteTitle } from "./model";
import "./styles.css";

ensureSeedNotes();

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Sidebar({
  notes,
  selectedNoteId,
}: {
  notes: ReturnType<typeof listNotes>;
  selectedNoteId: string | null;
}) {

  return (
    <aside class="sidebar" data-testid="notes-sidebar">
      <div class="sidebar__top">
        <div>
          <div class="eyebrow">Jam vault</div>
          <h1 class="sidebar__title">Notes</h1>
        </div>
        <button
          id="create-note"
          data-testid="create-note"
          class="primary-button"
          onClick={() => createNote()}
        >
          + New note
        </button>
      </div>

      <div class="sidebar__list" data-testid="note-list">
        {notes.map((note) => {
          const isSelected = selectedNoteId === note.id;
          return (
            <button
              key={note.id}
              id={`note-list-item-${note.id}`}
              data-testid="note-list-item"
              data-note-id={note.id}
              class={isSelected ? "note-row note-row--selected" : "note-row"}
              onClick={() => selectNote(note.id)}
            >
              <span class="note-row__title">{note.title}</span>
              <span class="note-row__preview">{note.body || "Empty note"}</span>
              <span class="note-row__meta">Edited {formatDate(note.updatedAt)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function Editor({ note }: { note: ReturnType<typeof getSelectedNote> }) {

  if (!note) {
    return (
      <section class="editor editor--empty" data-testid="editor-panel">
        <h2>No note selected</h2>
      </section>
    );
  }

  return (
    <section class="editor" data-testid="editor-panel">
      <input
        id="note-title-input"
        data-testid="note-title-input"
        class="editor__title"
        value={note.title}
        onInput={(event: Event) => {
          const target = event.target as HTMLInputElement;
          updateNoteTitle(note.id, target.value);
        }}
      />
      <textarea
        id="note-body-input"
        data-testid="note-body-input"
        class="editor__body"
        value={note.body}
        placeholder="Write in markdown, add headings, and link notes with [[Title]]."
        onInput={(event: Event) => {
          const target = event.target as HTMLTextAreaElement;
          updateNoteBody(note.id, target.value);
        }}
      />
    </section>
  );
}

function Inspector({
  note,
  outgoingLinks,
  backlinks,
  outline,
  stats,
}: {
  note: ReturnType<typeof getSelectedNote>;
  outgoingLinks: ReturnType<typeof getOutgoingLinks>;
  backlinks: ReturnType<typeof getBacklinks>;
  outline: ReturnType<typeof getNoteOutline>;
  stats: ReturnType<typeof getNoteStats>;
}) {
  if (!note) {
    return null;
  }

  return (
    <aside class="inspector" data-testid="inspector-panel">
      <section class="inspector-card" data-testid="note-metadata-panel">
        <div class="inspector-card__label">Metadata</div>
        <div class="inspector-grid">
          <div>
            <span class="inspector-key">Created</span>
            <span class="inspector-value">{formatDate(note.createdAt)}</span>
          </div>
          <div>
            <span class="inspector-key">Updated</span>
            <span class="inspector-value">{formatDate(note.updatedAt)}</span>
          </div>
          <div>
            <span class="inspector-key">Words</span>
            <span class="inspector-value">{String(stats.wordCount)}</span>
          </div>
          <div>
            <span class="inspector-key">Links</span>
            <span class="inspector-value">{String(stats.linkCount)}</span>
          </div>
        </div>
      </section>

      <section class="inspector-card" data-testid="outgoing-links-panel">
        <div class="inspector-card__label">Outgoing links</div>
        {outgoingLinks.length > 0 ? (
          <div class="pill-list">
            {outgoingLinks.map((link) => (
              <button
                key={`${note.id}-${link.title}`}
                class={link.targetId ? "pill" : "pill pill--muted"}
                data-testid="outgoing-link"
                onClick={() => {
                  if (link.targetId) selectNote(link.targetId);
                }}
              >
                [[{link.title}]]
              </button>
            ))}
          </div>
        ) : (
          <div class="inspector-empty">No wikilinks yet.</div>
        )}
      </section>

      <section class="inspector-card" data-testid="backlinks-panel">
        <div class="inspector-card__label">Backlinks</div>
        {backlinks.length > 0 ? (
          <div class="link-stack">
            {backlinks.map((backlink) => (
              <button
                key={backlink.id}
                class="link-row"
                data-testid="backlink-item"
                onClick={() => selectNote(backlink.id)}
              >
                <span class="link-row__title">{backlink.title}</span>
                <span class="link-row__preview">{backlink.body}</span>
              </button>
            ))}
          </div>
        ) : (
          <div class="inspector-empty">No backlinks yet.</div>
        )}
      </section>

      <section class="inspector-card" data-testid="outline-panel">
        <div class="inspector-card__label">Outline</div>
        {outline.length > 0 ? (
          <ul class="outline-list">
            {outline.map((heading) => (
              <li key={heading}>{heading}</li>
            ))}
          </ul>
        ) : (
          <div class="inspector-empty">Add markdown headings to build an outline.</div>
        )}
      </section>
    </aside>
  );
}

export function ObsidianCloneApp() {
  const notes = listNotes();
  const selectedNote = getSelectedNote();
  const selectedNoteId = selectedNote?.id ?? null;
  const outgoingLinks = selectedNote ? getOutgoingLinks(selectedNote.id) : [];
  const backlinks = selectedNote ? getBacklinks(selectedNote.id) : [];
  const outline = selectedNote ? getNoteOutline(selectedNote.id) : [];
  const stats = selectedNote ? getNoteStats(selectedNote.id) : { wordCount: 0, linkCount: 0 };

  return (
    <div class="shell" data-testid="notes-app">
      <Sidebar notes={notes} selectedNoteId={selectedNoteId} />
      <Editor note={selectedNote} />
      <Inspector
        note={selectedNote}
        outgoingLinks={outgoingLinks}
        backlinks={backlinks}
        outline={outline}
        stats={stats}
      />
    </div>
  );
}
