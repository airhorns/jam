import { beforeEach, describe, expect, it } from "vitest";
import { when, $ } from "@jam/core";
import {
  DEFAULT_BOARD_ID,
  addCard,
  getAdjacentColumnId,
  getBoard,
  getBoardSummary,
  getCard,
  getCardsForColumn,
  getColumns,
  getSelectedCardId,
  initializeTrelloClone,
  moveCard,
  resetBoardForTests,
  selectCard,
} from "../state";

describe("trello clone state", () => {
  beforeEach(() => {
    resetBoardForTests();
    initializeTrelloClone();
  });

  it("seeds a named board with three ordered columns", () => {
    const board = getBoard();
    const columns = getColumns();

    expect(board).toMatchObject({
      id: DEFAULT_BOARD_ID,
      name: "Product Launch Board",
    });
    expect(columns.map((column) => column.id)).toEqual([
      "column-backlog",
      "column-doing",
      "column-done",
    ]);
  });

  it("is idempotent when initialized multiple times", () => {
    initializeTrelloClone();

    expect(when(["board", $.id, "name", $.name])).toHaveLength(1);
    expect(when(["column", $.id, "name", $.name])).toHaveLength(3);
    expect(when(["card", $.id, "title", $.title])).toHaveLength(3);
  });

  it("adds a new card with trimmed fields and selects it", () => {
    const cardId = addCard(
      "column-backlog",
      "  Confirm analytics dashboard  ",
      "  Verify events and release dashboards.  ",
    );

    expect(cardId).toBe("card-4");
    expect(getCard(cardId!)).toMatchObject({
      title: "Confirm analytics dashboard",
      description: "Verify events and release dashboards.",
      columnId: "column-backlog",
    });
    expect(getSelectedCardId()).toBe("card-4");
  });

  it("rejects blank card titles", () => {
    const beforeCount = getCardsForColumn("column-backlog").length;

    const cardId = addCard("column-backlog", "   ", "ignored");

    expect(cardId).toBeNull();
    expect(getCardsForColumn("column-backlog")).toHaveLength(beforeCount);
  });

  it("appends new cards at the end of the target column", () => {
    const first = addCard("column-backlog", "Card A", "One");
    const second = addCard("column-backlog", "Card B", "Two");

    const cards = getCardsForColumn("column-backlog");
    expect(cards[cards.length - 2].id).toBe(first);
    expect(cards[cards.length - 1].id).toBe(second);
    expect(cards[cards.length - 1].position).toBeGreaterThan(cards[cards.length - 2].position);
  });

  it("moves cards between columns and appends them in the destination column", () => {
    const cardId = addCard("column-backlog", "Move me", "Across the board")!;
    addCard("column-doing", "Existing doing", "Already there");

    moveCard(cardId, "column-doing");

    const moved = getCard(cardId);
    const doingCards = getCardsForColumn("column-doing");
    expect(moved?.columnId).toBe("column-doing");
    expect(doingCards[doingCards.length - 1].id).toBe(cardId);
  });

  it("does nothing when moving to the same column", () => {
    const original = getCard("card-1");

    moveCard("card-1", "column-backlog");

    expect(getCard("card-1")).toEqual(original);
  });

  it("tracks card selection and allows clearing the inspector", () => {
    selectCard("card-1");
    expect(getSelectedCardId()).toBe("card-1");

    selectCard(null);
    expect(getSelectedCardId()).toBeNull();
  });

  it("provides adjacent columns for directional move controls", () => {
    expect(getAdjacentColumnId("column-backlog", -1)).toBeNull();
    expect(getAdjacentColumnId("column-backlog", 1)).toBe("column-doing");
    expect(getAdjacentColumnId("column-doing", -1)).toBe("column-backlog");
    expect(getAdjacentColumnId("column-doing", 1)).toBe("column-done");
    expect(getAdjacentColumnId("column-done", 1)).toBeNull();
  });

  it("computes a board summary from current facts", () => {
    addCard("column-backlog", "One more", "Extra work");

    expect(getBoardSummary()).toEqual({
      columnCount: 3,
      cardCount: 4,
    });
  });

  it("stores explicit facts that are easy to extend later", () => {
    expect(when(["board", DEFAULT_BOARD_ID, "description", $.value])[0]?.value).toContain("Jam kanban");
    expect(when(["column", "column-backlog", "accent", $.value])[0]?.value).toBe("slate");
    expect(when(["meta", "cards", "nextId", $.value])[0]?.value).toBe(4);
  });
});
