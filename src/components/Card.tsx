import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Draggable } from 'react-beautiful-dnd';
import { Card as CardType, User } from '../types/data';
import './Card.css';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from './ConfirmDialog';
import { usePomodoro } from '../context/PomodoroContext';
import { API_URL } from '../config/api';
import { api } from '../config/http';
import { generateColorFromId, getUserInitials } from '../utils/user';

interface CardProps {
  card: CardType;
  index: number;
  users: User[];
  onEditCard: (card: CardType) => void;
  onStartFocus: (card: CardType) => void;
  onToggleComplete: (card: CardType) => void;
  onArchiveToggle: (card: CardType) => void;
}

const PRIORITY_LABELS: Record<CardType['priority'], string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
};

const Card: React.FC<CardProps> = ({ card, index, users, onEditCard, onStartFocus, onToggleComplete, onArchiveToggle }) => {
  const assignedUser = users.find(u => u.userId === card.assignedToUserId);
  const { showToast } = useToast();
  const { activeCard } = usePomodoro();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(card.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const toLocalDateOnly = (d: Date | string) => { const dt = new Date(d); return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0,0,0,0); };
  const today = toLocalDateOnly(new Date());
  const isOverdue = !!card.dueDate && toLocalDateOnly(card.dueDate) < today;

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.focus-button')) {
      return;
    }
    if ((e.target as HTMLElement).closest('.card-actions')) {
      return;
    }
    if (isEditingTitle) return;
    onEditCard(card);
  };

  const saveTitle = async () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === card.title) { setIsEditingTitle(false); setTitleValue(card.title); return; }
    try {
      setBusy(true);
      const payload = { ...card, title: trimmed } as CardType;
      await api.put(`${API_URL}/cards/${card.id}`, payload);
      try { window.dispatchEvent(new CustomEvent('card:updated', { detail: payload })); } catch {}
      showToast('Título actualizado', 'success');
      setIsEditingTitle(false);
    } catch (e) {
      showToast('No se pudo actualizar el título', 'error');
      setTitleValue(card.title);
    } finally { setBusy(false); }
  };

  const deleteCard = async () => {
    try {
      setBusy(true);
      await api.delete(`${API_URL}/cards/${card.id}`);
      try { window.dispatchEvent(new CustomEvent('card:deleted', { detail: { id: card.id, listId: card.listId } })); } catch {}
      showToast('Tarjeta eliminada', 'success');
    } catch (e) {
      showToast('No se pudo eliminar la tarjeta', 'error');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
    <Draggable draggableId={card.id} index={index}>
      {(provided, snapshot) => {
        const cardNode = (
          <div
            className={`card${activeCard && activeCard.id === card.id ? ' in-focus' : ''}${card.completed ? ' completed' : ''}`}
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            onClick={handleCardClick}
            style={provided.draggableProps.style as React.CSSProperties}
          >
          {isEditingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onClick={(e)=>e.stopPropagation()}
              onChange={(e)=>setTitleValue(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e)=>{
                if (e.key==='Enter') { e.preventDefault(); saveTitle(); }
                if (e.key==='Escape') { setIsEditingTitle(false); setTitleValue(card.title); }
              }}
            />
          ) : (
            <p onDoubleClick={(e)=>{ e.stopPropagation(); setIsEditingTitle(true); }}>{card.title}</p>
          )}
          <div className="card-footer">
            <div className="card-meta">
              <span className={`card-priority ${card.priority}`}>{PRIORITY_LABELS[card.priority] || 'Media'}</span>
              {card.dueDate && (
                <div className={`card-due-date${isOverdue ? ' overdue' : ''}`} title={isOverdue ? 'Vencida' : 'Fecha'}>
                  <span className="icon">{isOverdue ? '⚠️' : '📅'}</span>
                  {new Date(card.dueDate).toLocaleDateString()}
                </div>
              )}
              {assignedUser && <div className="card-avatar" style={{ backgroundColor: generateColorFromId(assignedUser.userId) }} title={assignedUser.name}>{getUserInitials(assignedUser.name, assignedUser.email)}</div>}
            </div>
            <div className="card-actions" style={{ display:'flex', gap:6, alignItems:'center' }}>
              <button className="focus-button" onClick={(e) => { e.stopPropagation(); onStartFocus(card); }}>Focus</button>
              <button onClick={(e)=>{ e.stopPropagation(); onToggleComplete(card); }} title={card.completed ? 'Marcar como pendiente' : 'Marcar como hecho'} disabled={busy}>{card.completed ? '↺' : '✓'}</button>
              <button onClick={(e)=>{ e.stopPropagation(); /* archive toggle below */ onArchiveToggle(card); }} title={card.archived ? 'Restaurar' : 'Archivar'} disabled={busy}>{card.archived ? '📤' : '🗄'}</button>
              <button onClick={(e)=>{ e.stopPropagation(); setIsEditingTitle(true); }} title="Renombrar" disabled={busy}>✎</button>
              <button onClick={(e)=>{ e.stopPropagation(); setConfirmDelete(true); }} title="Eliminar" disabled={busy}>🗑</button>
            </div>
          </div>
          </div>
        );
        return snapshot.isDragging ? createPortal(cardNode, document.body) : cardNode;
      }}
    </Draggable>
    <ConfirmDialog
      open={confirmDelete}
      title="Eliminar tarjeta"
      message="Esta acción no se puede deshacer. ¿Deseas eliminar la tarjeta?"
      confirmLabel="Eliminar"
      cancelLabel="Cancelar"
      busy={busy}
      onCancel={()=> setConfirmDelete(false)}
      onConfirm={deleteCard}
    />
    </>
  );
};

export default Card;
