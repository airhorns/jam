import { $, _, db, forget, remember, replace, transaction, when } from "@jam/core";

export type NoteRecord = {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

export type LinkedNote = {
  title: string;
  targetId: string | null;
};

export const DEFAULT_NOTE_TITLE = "Untitled note";

const NOTE = "note";
const UI = "ui";
const SYSTEM = "notes-system";

function titleFromBody(body: string): string {
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 60) : DEFAULT_NOTE_TITLE;
}

export function parseWikiLinks(body: string): string[] {
  const matches = body.matchAll(/\[\[([^\]]+)\]\]/g);
  const seen = new Set<string>();
  const results: string[] = [];

  for (const match of matches) {
    const title = match[1]?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(title);
  }

  return results;
}

function getNextIdNumber(): number {
  const current = when([SYSTEM, "next-id", $.value])[0]?.value;
  return typeof current === "number" ? current : 1;
}

function allocateNoteId(): string {
  const value = getNextIdNumber();
  replace(SYSTEM, "next-id", value + 1);
  return `note-${value}`;
}

export function listNotes(): NoteRecord[] {
  const notes = when(
    [NOTE, $.id, "title", $.title],
    [NOTE, $.id, "body", $.body],
    [NOTE, $.id, "createdAt", $.createdAt],
    [NOTE, $.id, "updatedAt", $.updatedAt],
  );

  return notes
    .map(({ id, title, body, createdAt, updatedAt }) => ({
      id: id as string,
      title: title as string,
      body: body as string,
      createdAt: createdAt as number,
      updatedAt: updatedAt as number,
    }))
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
}

export function getSelectedNoteId(): string | null {
  const match = when([UI, "selected-note-id", $.id])[0]?.id;
  return typeof match === "string" && match.length > 0 ? match : null;
}

export function getSelectedNote(): NoteRecord | null {
  const selectedId = getSelectedNoteId();
  if (!selectedId) return null;
  return listNotes().find((note) => note.id === selectedId) ?? null;
}

export function selectNote(noteId: string) {
  replace(UI, "selected-note-id", noteId);
}

export function createNote(options: { title?: string; body?: string; now?: number } = {}): string {
  const now = options.now ?? Date.now();
  const title = (options.title ?? DEFAULT_NOTE_TITLE).trim() || DEFAULT_NOTE_TITLE;
  const body = options.body ?? "";
  const id = allocateNoteId();

  transaction(() => {
    remember(NOTE, id, "title", title);
    remember(NOTE, id, "body", body);
    remember(NOTE, id, "createdAt", now);
    remember(NOTE, id, "updatedAt", now);
    replace(UI, "selected-note-id", id);
  });

  return id;
}

export function updateNoteTitle(noteId: string, title: string, now = Date.now()) {
  replace(NOTE, noteId, "title", title.trim() || DEFAULT_NOTE_TITLE);
  replace(NOTE, noteId, "updatedAt", now);
}

export function updateNoteBody(noteId: string, body: string, now = Date.now()) {
  replace(NOTE, noteId, "body", body);
  replace(NOTE, noteId, "updatedAt", now);

  const currentTitle = when([NOTE, noteId, "title", $.title])[0]?.title;
  if (typeof currentTitle !== "string" || currentTitle === DEFAULT_NOTE_TITLE) {
    replace(NOTE, noteId, "title", titleFromBody(body));
  }
}

export function ensureSeedNotes() {
  if (listNotes().length > 0) return;

  transaction(() => {
    createNote({
      now: 1,
      title: "Welcome",
      body: [
        "# Welcome to Jam Notes",
        "",
        "This starter vault is built with @jam/core.",
        "Try creating another note and linking it back with [[Welcome]].",
      ].join("\n"),
    });

    createNote({
      now: 2,
      title: "Project ideas",
      body: [
        "- Capture thoughts quickly",
        "- Link notes with [[Welcome]]",
        "- Extend this app with programs later",
      ].join("\n"),
    });
  });
}

export function getOutgoingLinks(noteId: string): LinkedNote[] {
  const note = listNotes().find((item) => item.id === noteId);
  if (!note) return [];

  const notesByTitle = new Map(listNotes().map((item) => [item.title.toLowerCase(), item.id]));
  return parseWikiLinks(note.body).map((title) => ({
    title,
    targetId: notesByTitle.get(title.toLowerCase()) ?? null,
  }));
}

export function getBacklinks(noteId: string): NoteRecord[] {
  const note = listNotes().find((item) => item.id === noteId);
  if (!note) return [];

  const key = note.title.toLowerCase();
  return listNotes().filter((candidate) => {
    if (candidate.id === noteId) return false;
    return parseWikiLinks(candidate.body).some((title) => title.toLowerCase() === key);
  });
}

export function getNoteOutline(noteId: string): string[] {
  const note = listNotes().find((item) => item.id === noteId);
  if (!note) return [];

  return note.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^#+\s+/.test(line));
}

export function getNoteStats(noteId: string): { wordCount: number; linkCount: number } {
  const note = listNotes().find((item) => item.id === noteId);
  if (!note) return { wordCount: 0, linkCount: 0 };

  const wordCount = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  return {
    wordCount,
    linkCount: parseWikiLinks(note.body).length,
  };
}

export function resetNotesState() {
  db.clear();
  forget(NOTE, _, _, _);
}
