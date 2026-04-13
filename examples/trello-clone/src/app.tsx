import { h } from "@jam/core/jsx";
import {
  addCard,
  getAdjacentColumnId,
  getBoard,
  getBoardSummary,
  getCardsForColumn,
  getColumnById,
  getColumns,
  getSelectedCard,
  moveCard,
  selectCard,
  type Card,
  type Column,
  type ColumnId,
} from "./state";

function submitCard(columnId: ColumnId) {
  const titleInput = document.getElementById(`add-card-title-${columnId}`) as HTMLInputElement | null;
  const descriptionInput = document.getElementById(
    `add-card-description-${columnId}`,
  ) as HTMLTextAreaElement | null;

  if (!titleInput || !descriptionInput) return;

  const newId = addCard(columnId, titleInput.value, descriptionInput.value);
  if (!newId) return;

  titleInput.value = "";
  descriptionInput.value = "";
  titleInput.focus();
}

function ColumnAddCard({ columnId }: { key?: unknown; columnId: ColumnId }) {
  return (
    <div class="add-card-panel" data-testid={`add-card-panel-${columnId}`}>
      <input
        id={`add-card-title-${columnId}`}
        class="add-card-title"
        data-testid={`add-card-title-${columnId}`}
        placeholder="Card title"
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitCard(columnId);
          }
        }}
      />
      <textarea
        id={`add-card-description-${columnId}`}
        class="add-card-description"
        data-testid={`add-card-description-${columnId}`}
        placeholder="Short description"
      />
      <button
        class="add-card-button"
        data-testid={`add-card-button-${columnId}`}
        onClick={() => submitCard(columnId)}
      >
        Add card
      </button>
    </div>
  );
}

function MoveButtons({ card }: { key?: unknown; card: Card }) {
  const leftColumnId = getAdjacentColumnId(card.columnId, -1);
  const rightColumnId = getAdjacentColumnId(card.columnId, 1);

  return (
    <div class="card-actions">
      <button
        class="move-button"
        data-testid={`move-left-${card.id}`}
        disabled={!leftColumnId}
        aria-label={`Move ${card.title} left`}
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          if (leftColumnId) moveCard(card.id, leftColumnId);
        }}
      >
        ←
      </button>
      <button
        class="move-button"
        data-testid={`move-right-${card.id}`}
        disabled={!rightColumnId}
        aria-label={`Move ${card.title} right`}
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          if (rightColumnId) moveCard(card.id, rightColumnId);
        }}
      >
        →
      </button>
    </div>
  );
}

function CardTile({ card }: { key?: unknown; card: Card }) {
  return (
    <article
      id={`card-${card.id}`}
      class="card-tile"
      data-testid={`card-${card.id}`}
      onClick={() => selectCard(card.id)}
    >
      <div class="card-tile-topline">
        <span class="card-pill">Task</span>
        <MoveButtons card={card} />
      </div>
      <h3 class="card-title">{card.title}</h3>
      <p class="card-description">{card.description || "No description yet."}</p>
    </article>
  );
}

function BoardColumn({ column }: { key?: unknown; column: Column }) {
  const cards = getCardsForColumn(column.id);

  return (
    <section
      id={`column-${column.id}`}
      class={`board-column accent-${column.accent}`}
      data-testid={`column-${column.id}`}
    >
      <header class="column-header">
        <div>
          <p class="column-kicker">{column.name}</p>
          <h2>{cards.length} {cards.length === 1 ? "card" : "cards"}</h2>
        </div>
      </header>
      <div class="column-card-list" data-testid={`column-card-list-${column.id}`}>
        {cards.map((card) => (
          <CardTile key={card.id} card={card} />
        ))}
      </div>
      <ColumnAddCard columnId={column.id} />
    </section>
  );
}

function DetailPanel() {
  const selectedCard = getSelectedCard();

  if (!selectedCard) {
    return (
      <aside class="detail-panel empty" data-testid="card-detail-panel">
        <p class="detail-eyebrow">Inspector</p>
        <h2>Select a card</h2>
        <p>Click any card to inspect it here and move it across the board.</p>
      </aside>
    );
  }

  const currentColumn = getColumnById(selectedCard.columnId);
  const leftColumnId = getAdjacentColumnId(selectedCard.columnId, -1);
  const rightColumnId = getAdjacentColumnId(selectedCard.columnId, 1);

  return (
    <aside class="detail-panel" data-testid="card-detail-panel">
      <div class="detail-header">
        <p class="detail-eyebrow">Inspector</p>
        <button class="detail-close" data-testid="card-detail-close" onClick={() => selectCard(null)}>
          Close
        </button>
      </div>
      <h2 data-testid="selected-card-title">{selectedCard.title}</h2>
      <p class="detail-column" data-testid="selected-card-column">
        Column: {currentColumn?.name ?? selectedCard.columnId}
      </p>
      <p class="detail-copy" data-testid="selected-card-description">
        {selectedCard.description || "No description yet."}
      </p>
      <div class="detail-actions">
        <button
          class="detail-move-button"
          data-testid="detail-move-left"
          disabled={!leftColumnId}
          onClick={() => {
            if (leftColumnId) moveCard(selectedCard.id, leftColumnId);
          }}
        >
          Move left
        </button>
        <button
          class="detail-move-button"
          data-testid="detail-move-right"
          disabled={!rightColumnId}
          onClick={() => {
            if (rightColumnId) moveCard(selectedCard.id, rightColumnId);
          }}
        >
          Move right
        </button>
      </div>
    </aside>
  );
}

export function TrelloCloneApp() {
  const board = getBoard();
  const columns = getColumns();
  const summary = getBoardSummary();

  if (!board) {
    return <div class="loading-shell">Loading board…</div>;
  }

  return (
    <div class="app-shell" data-testid="trello-clone-app">
      <header class="topbar">
        <div>
          <p class="topbar-kicker">Jam Example</p>
          <h1 data-testid="board-title">{board.name}</h1>
          <p class="board-description">{board.description}</p>
        </div>
        <div class="board-stats" data-testid="board-stats">
          <div>
            <strong>{summary.columnCount}</strong>
            <span>columns</span>
          </div>
          <div>
            <strong>{summary.cardCount}</strong>
            <span>cards</span>
          </div>
        </div>
      </header>

      <main class="board-layout">
        <section class="board-lane-area" data-testid="board-lanes">
          {columns.map((column) => (
            <BoardColumn key={column.id} column={column} />
          ))}
        </section>
        <DetailPanel />
      </main>
    </div>
  );
}
