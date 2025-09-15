import React, { useState } from 'react';
import { useLists } from '../hooks/useLists';
import { useCards } from '../hooks/useCards';
import './HomeDashboard.css';
import LoadingOverlay from './LoadingOverlay';

interface HomeDashboardProps {
  boardId: string | null;
  onOpenList?: (listId: string) => void;
}

const HomeDashboard: React.FC<HomeDashboardProps> = ({ boardId, onOpenList }) => {
  const { lists, isLoading: listsLoading, error: listsError, handleCreateList } = useLists(boardId);
  const { cards, isLoading: cardsLoading, error: cardsError } = useCards(boardId);
  const [newListName, setNewListName] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 5) return 'Good Night';
    if (h < 12) return 'Good Morning';
    if (h < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const onCreateList = () => {
    if (!newListName.trim()) return;
    handleCreateList(newListName.trim());
    setNewListName('');
  };

  if (!boardId) {
    return (
      <div className="home-empty">
        <h2>Select or create a board to get started</h2>
      </div>
    );
  }

  if (listsLoading || cardsLoading) return <LoadingOverlay message="Cargando tablero…" />;
  if (listsError || cardsError) return <p className="error-message">{listsError || cardsError}</p>;

  // Reports data
  const allCards = Object.values(cards).flat();
  const totalLists = lists.length;
  const totalCards = allCards.length;
  const cardsWithDueDate = allCards.filter(c => !!c.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toLocalDateOnly = (d: any) => {
    const dt = new Date(d);
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
  };
  const cardsDueToday = cardsWithDueDate.filter(c => {
    const d = toLocalDateOnly(c.dueDate as any);
    return d >= today && d < tomorrow;
  });
  const cardsWithoutDue = totalCards - cardsWithDueDate.length;

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1>{greeting()}</h1>
          <p className="subtitle">Your Lists</p>
        </div>
        <div className="home-actions">
          {/* Placeholder for actions like upgrade/settings if needed */}
        </div>
      </header>

      <section className="home-reports">
        <div className="report-tile">
          <div className="report-value">{totalLists}</div>
          <div className="report-label">Listas</div>
        </div>
        <div className="report-tile">
          <div className="report-value">{totalCards}</div>
          <div className="report-label">Tarjetas</div>
        </div>
        <div className="report-tile">
          <div className="report-value">{cardsDueToday.length}</div>
          <div className="report-label">Vencen hoy</div>
        </div>
        <div className="report-tile">
          <div className="report-value">{cardsWithoutDue}</div>
          <div className="report-label">Sin fecha</div>
        </div>
      </section>

      <section className="lists-grid">
        {lists.map((list) => {
          const listCards = cards[list.listId] || [];
          return (
            <div
              key={list.listId}
              className="list-tile"
              onClick={() => onOpenList && onOpenList(list.listId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpenList && onOpenList(list.listId); }}
            >
              <div className="tile-header">
                <div className="badge" title={list.name}>{list.name?.[0]?.toUpperCase() || 'L'}</div>
                <h3 title={list.name}>{list.name}</h3>
                <button className="icon-btn" aria-label="List actions">•••</button>
              </div>
              <div className="tile-body">
                {(expanded[list.listId] ? listCards : listCards.slice(0, 4)).map((c, idx) => (
                  <div key={c.id} className="chip" title={c.title}>
                    <span className="chip-index">{idx + 1}</span>
                    <span className="chip-title">{c.title}</span>
                    <span className="chip-time">00:00</span>
                  </div>
                ))}
                {listCards.length > 4 && (
                  <button
                    className="link-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(prev => ({ ...prev, [list.listId]: !prev[list.listId] }));
                    }}
                  >
                    {expanded[list.listId] ? 'Ver menos' : `Ver todas (${listCards.length})`}
                  </button>
                )}
              </div>
              <div className="tile-footer">{listCards.length} cards</div>
            </div>
          );
        })}

        <div className="list-tile create">
          <div className="create-inner">
            <div className="plus">+</div>
            <input
              type="text"
              placeholder="Create list"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onCreateList()}
            />
            <button onClick={onCreateList}>Create</button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HomeDashboard;
