import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@jam/core";
import { createNote, ensureSeedNotes, getBacklinks, getNoteOutline, getNoteStats, getOutgoingLinks, getSelectedNote, listNotes, parseWikiLinks, selectNote, updateNoteBody, updateNoteTitle } from "../model";

describe("obsidian clone model", () => {
  beforeEach(() => {
    db.clear();
  });

  it("seeds starter notes once", () => {
    ensureSeedNotes();
    ensureSeedNotes();

    const notes = listNotes();
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => note.title)).toEqual(["Project ideas", "Welcome"]);
  });

  it("creates a note with a stable id and selects it", () => {
    const id = createNote({ title: "Scratchpad", now: 42 });

    expect(id).toBe("note-1");
    expect(getSelectedNote()?.id).toBe("note-1");
    expect(listNotes()).toEqual([
      {
        id: "note-1",
        title: "Scratchpad",
        body: "",
        createdAt: 42,
        updatedAt: 42,
      },
    ]);
  });

  it("sorts notes by updated time descending", () => {
    const first = createNote({ title: "First", now: 10 });
    const second = createNote({ title: "Second", now: 20 });

    updateNoteBody(first, "Refreshed", 30);

    expect(listNotes().map((note) => note.id)).toEqual([first, second]);
  });

  it("updates note title and body metadata", () => {
    const id = createNote({ title: "Draft", now: 10 });

    updateNoteTitle(id, "Updated draft", 25);
    updateNoteBody(id, "Body copy", 30);

    expect(getSelectedNote()).toEqual({
      id,
      title: "Updated draft",
      body: "Body copy",
      createdAt: 10,
      updatedAt: 30,
    });
  });

  it("derives title from first non-empty line when still untitled", () => {
    const id = createNote({ title: "Untitled note", now: 5 });

    updateNoteBody(id, "\n\nA generated title\nextra", 8);

    expect(getSelectedNote()?.title).toBe("A generated title");
  });

  it("parses unique wikilinks", () => {
    expect(parseWikiLinks("See [[Welcome]] and [[welcome]] and [[Project ideas]]")).toEqual([
      "Welcome",
      "Project ideas",
    ]);
  });

  it("derives outgoing links and backlinks from note bodies", () => {
    const welcome = createNote({ title: "Welcome", body: "Landing page", now: 1 });
    const roadmap = createNote({
      title: "Roadmap",
      body: "Connect this to [[Welcome]] and [[Missing note]].",
      now: 2,
    });

    expect(getOutgoingLinks(roadmap)).toEqual([
      { title: "Welcome", targetId: welcome },
      { title: "Missing note", targetId: null },
    ]);
    expect(getBacklinks(welcome).map((note) => note.id)).toEqual([roadmap]);
  });

  it("derives a markdown outline and basic stats", () => {
    const id = createNote({
      title: "Spec",
      body: "# Heading\n\nSome copy here\n## Details\n[[Welcome]]",
      now: 1,
    });

    expect(getNoteOutline(id)).toEqual(["# Heading", "## Details"]);
    expect(getNoteStats(id)).toEqual({ wordCount: 8, linkCount: 1 });
  });

  it("allows selecting an existing note", () => {
    const first = createNote({ title: "One", now: 1 });
    const second = createNote({ title: "Two", now: 2 });

    selectNote(first);

    expect(getSelectedNote()?.id).toBe(first);
    expect(listNotes()[0].id).toBe(second);
  });
});
