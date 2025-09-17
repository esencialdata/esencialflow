import React from 'react';
import { Card } from '../types/data';
import './ListView.css';

interface ListViewProps {
  cards: Card[];
  onCardClick: (card: Card) => void;
}

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
            {/* Add more card details here as needed, e.g., due date, assignee */}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ListView;