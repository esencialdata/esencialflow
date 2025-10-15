import React from 'react';
import { Card as CardType, User } from '../types/data';
import './Card.css';
import { generateColorFromId, getUserInitials } from '../utils/user';

interface CardContentProps {
  card: CardType;
  users: User[];
  onClick: (e: React.MouseEvent) => void;
  onStartFocus: (e: React.MouseEvent) => void;
}

const getChecklistProgress = (card: CardType) => {
  if (!card.checklist || card.checklist.length === 0) {
    return null;
  }
  const completed = card.checklist.filter(item => item.completed).length;
  return { completed, total: card.checklist.length };
};

const PRIORITY_LABELS: Record<CardType['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

const CardContent: React.FC<CardContentProps> = ({ card, users, onClick, onStartFocus }) => {
  const assignedUser = users.find(u => u.userId === card.assignedToUserId);
  const checklistProgress = getChecklistProgress(card);
  const toLocalDateOnly = (d: Date | string) => { const dt = new Date(d); return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0,0,0,0); };
  const today = toLocalDateOnly(new Date());
  const isOverdue = !!card.dueDate && toLocalDateOnly(card.dueDate) < today;

  return (
    <div className="card" onClick={onClick}>
      <p>{card.title}</p>
      <div className="card-footer">
        <div className="card-meta">
          <span className={`card-priority ${card.priority}`}>{PRIORITY_LABELS[card.priority] || 'Media'}</span>
          {checklistProgress && checklistProgress.total > 0 && (
            <div className="card-checklist-progress" title={`${checklistProgress.completed} de ${checklistProgress.total} completadas`}>
              <span className="icon">✅</span>
              {checklistProgress.completed}/{checklistProgress.total}
            </div>
          )}
          {card.dueDate && (
            <div className={`card-due-date${isOverdue ? ' overdue' : ''}`} title={isOverdue ? 'Vencida' : 'Fecha'}>
              <span className="icon">{isOverdue ? '⚠️' : '📅'}</span>
              {new Date(card.dueDate).toLocaleDateString()}
            </div>
          )}
          {assignedUser && <div className="card-avatar" style={{ backgroundColor: generateColorFromId(assignedUser.userId) }} title={assignedUser.name}>{getUserInitials(assignedUser.name)}</div>}
        </div>
        <button className="focus-button" onClick={onStartFocus}>Focus</button>
      </div>
    </div>
  );
};

export default CardContent;
