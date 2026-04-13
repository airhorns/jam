import { $, _, db, forget, remember, replace, transaction, when } from "@jam/core";

export type ColumnId = "column-backlog" | "column-doing" | "column-done";

export interface Board {
  id: string;
  name: string;
  description: string;
}

export interface Column {
  id: ColumnId;
  boardId: string;
  name: string;
  position: number;
  accent: string;
}

export interface Card {
  id: string;
  boardId: string;
  columnId: ColumnId;
  title: string;
  description: string;
  position: number;
}

export const DEFAULT_BOARD_ID = "board-product-launch";
export const COLUMN_ORDER: ColumnId[] = ["column-backlog", "column-doing", "column-done"];

function querySingleValue<T>(pattern: any[], bindingName: string): T | null {
  const match = when(pattern as any)[0];
  return (match?.[bindingName] as T | undefined) ?? null;
}

function hasBoard(boardId: string): boolean {
  return when(["board", boardId, "name", $.name]).length > 0;
}

function getNextCardNumber(): number {
  return querySingleValue<number>(["meta", "cards", "nextId", $.value], "value") ?? 1;
}

function setNextCardNumber(nextId: number) {
  replace("meta", "cards", "nextId", nextId);
}

function makeCardId(nextId: number): string {
  return `card-${nextId}`;
}

function getMaxPositionForColumn(columnId: ColumnId): number {
  const cards = when(["card", $.id, "columnId", columnId], ["card", $.id, "position", $.position]);
  if (cards.length === 0) return -1;
  return Math.max(...cards.map((card) => card.position as number));
}

export function initializeTrelloClone() {
  if (hasBoard(DEFAULT_BOARD_ID)) return;

  transaction(() => {
    remember("board", DEFAULT_BOARD_ID, "name", "Product Launch Board");
    remember(
      "board",
      DEFAULT_BOARD_ID,
      "description",
      "A simple Jam kanban board for planning, doing, and shipping work.",
    );

    const columns: Column[] = [
      {
        id: "column-backlog",
        boardId: DEFAULT_BOARD_ID,
        name: "Backlog",
        position: 0,
        accent: "slate",
      },
      {
        id: "column-doing",
        boardId: DEFAULT_BOARD_ID,
        name: "In Progress",
        position: 1,
        accent: "blue",
      },
      {
        id: "column-done",
        boardId: DEFAULT_BOARD_ID,
        name: "Done",
        position: 2,
        accent: "green",
      },
    ];

    for (const column of columns) {
      remember("column", column.id, "boardId", column.boardId);
      remember("column", column.id, "name", column.name);
      remember("column", column.id, "position", column.position);
      remember("column", column.id, "accent", column.accent);
    }

    const starterCards = [
      {
        id: "card-1",
        columnId: "column-backlog",
        title: "Draft launch announcement",
        description: "Outline the launch post and collect screenshots for the release thread.",
        position: 0,
      },
      {
        id: "card-2",
        columnId: "column-doing",
        title: "Polish onboarding flow",
        description: "Tighten empty states and first-run copy before sharing the board broadly.",
        position: 0,
      },
      {
        id: "card-3",
        columnId: "column-done",
        title: "Settle brand colors",
        description: "Finalize the kanban palette so future mutations have a stable visual baseline.",
        position: 0,
      },
    ] as const;

    for (const card of starterCards) {
      remember("card", card.id, "boardId", DEFAULT_BOARD_ID);
      remember("card", card.id, "columnId", card.columnId);
      remember("card", card.id, "title", card.title);
      remember("card", card.id, "description", card.description);
      remember("card", card.id, "position", card.position);
    }

    remember("ui", "selectedBoardId", DEFAULT_BOARD_ID);
    remember("ui", "selectedCardId", "card-2");
    remember("meta", "cards", "nextId", 4);
  });
}

export function getBoard(boardId = DEFAULT_BOARD_ID): Board | null {
  const name = querySingleValue<string>(["board", boardId, "name", $.value], "value");
  const description =
    querySingleValue<string>(["board", boardId, "description", $.value], "value") ?? "";
  if (!name) return null;
  return { id: boardId, name, description };
}

export function getColumns(boardId = DEFAULT_BOARD_ID): Column[] {
  return when(
    ["column", $.id, "boardId", boardId],
    ["column", $.id, "name", $.name],
    ["column", $.id, "position", $.position],
    ["column", $.id, "accent", $.accent],
  )
    .map(
      ({ id, name, position, accent }) =>
        ({
          id: id as ColumnId,
          boardId,
          name: name as string,
          position: position as number,
          accent: accent as string,
        }) satisfies Column,
    )
    .sort((a, b) => a.position - b.position);
}

export function getCardsForColumn(columnId: ColumnId): Card[] {
  return when(
    ["card", $.id, "columnId", columnId],
    ["card", $.id, "boardId", $.boardId],
    ["card", $.id, "title", $.title],
    ["card", $.id, "description", $.description],
    ["card", $.id, "position", $.position],
  )
    .map(
      ({ id, boardId, title, description, position }) =>
        ({
          id: id as string,
          boardId: boardId as string,
          columnId,
          title: title as string,
          description: description as string,
          position: position as number,
        }) satisfies Card,
    )
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function getCard(cardId: string): Card | null {
  const match = when(
    ["card", cardId, "boardId", $.boardId],
    ["card", cardId, "columnId", $.columnId],
    ["card", cardId, "title", $.title],
    ["card", cardId, "description", $.description],
    ["card", cardId, "position", $.position],
  )[0];

  if (!match) return null;

  return {
    id: cardId,
    boardId: match.boardId as string,
    columnId: match.columnId as ColumnId,
    title: match.title as string,
    description: match.description as string,
    position: match.position as number,
  };
}

export function getSelectedCardId(): string | null {
  return querySingleValue<string>(["ui", "selectedCardId", $.value], "value");
}

export function getSelectedCard(): Card | null {
  const cardId = getSelectedCardId();
  return cardId ? getCard(cardId) : null;
}

export function selectCard(cardId: string | null) {
  if (cardId === null) {
    forget("ui", "selectedCardId", _);
    return;
  }

  replace("ui", "selectedCardId", cardId);
}

export function addCard(columnId: ColumnId, title: string, description: string) {
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (!cleanTitle) return null;

  const nextId = getNextCardNumber();
  const cardId = makeCardId(nextId);
  const boardId = querySingleValue<string>(["column", columnId, "boardId", $.value], "value");
  if (!boardId) return null;

  const nextPosition = getMaxPositionForColumn(columnId) + 1;

  transaction(() => {
    remember("card", cardId, "boardId", boardId);
    remember("card", cardId, "columnId", columnId);
    remember("card", cardId, "title", cleanTitle);
    remember("card", cardId, "description", cleanDescription);
    remember("card", cardId, "position", nextPosition);
    setNextCardNumber(nextId + 1);
    replace("ui", "selectedCardId", cardId);
  });

  return cardId;
}

export function moveCard(cardId: string, targetColumnId: ColumnId) {
  const card = getCard(cardId);
  if (!card || card.columnId === targetColumnId) return;

  const nextPosition = getMaxPositionForColumn(targetColumnId) + 1;

  transaction(() => {
    replace("card", cardId, "columnId", targetColumnId);
    replace("card", cardId, "position", nextPosition);
  });
}

export function getColumnById(columnId: ColumnId): Column | null {
  return getColumns().find((column) => column.id === columnId) ?? null;
}

export function getAdjacentColumnId(columnId: ColumnId, direction: -1 | 1): ColumnId | null {
  const columns = getColumns();
  const index = columns.findIndex((column) => column.id === columnId);
  if (index === -1) return null;
  return columns[index + direction]?.id ?? null;
}

export function getBoardSummary(boardId = DEFAULT_BOARD_ID) {
  const columns = getColumns(boardId);
  const totalCards = columns.reduce((sum, column) => sum + getCardsForColumn(column.id).length, 0);
  return {
    columnCount: columns.length,
    cardCount: totalCards,
  };
}

export function resetBoardForTests() {
  db.clear();
}
