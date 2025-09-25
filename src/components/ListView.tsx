import React from 'react';
import { Card } from '../types/data';
import './ListView.css';

interface ListViewProps {
  cards: Card[];
  onCardClick: (card: Card) => void;
}

const PRIORITY_LABELS: Record<Card['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

const ListView: React.FC<ListViewProps> = ({ cards, onCardClick }) => {
  if (!cards || cards.length === 0) {
    return <div className="list-view-empty">No hay tareas en esta vista.</div>;
  }

  return (
    <div className="list-view-container">
      <ul className="list-view-ul">
        {cards.map(card => (
          <li key={card.id} className="list-view-item" onClick={() => onCardClick(card)}>
            <div className="list-view-card-title">{card.title}</div>
            <div className="list-view-meta">
              <span className={`priority-chip ${card.priority}`}>{PRIORITY_LABELS[card.priority] || 'Media'}</span>
              {card.dueDate && (
                <span className="list-view-date">{new Date(card.dueDate).toLocaleDateString()}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ListView;
