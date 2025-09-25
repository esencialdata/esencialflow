import React, { useState, useEffect } from 'react';
import { Card, User, Attachment } from '../types/data';
import './EditCardModal.css';
import Spinner from './Spinner';
import ConfirmDialog from './ConfirmDialog';
import axios from 'axios';
import { useToast } from '../context/ToastContext';
import CardComments from './CardComments';
import CardAttachments from './CardAttachments';
import { API_URL } from '../config/api';

interface EditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: Card | null;
  onSubmit: (updatedCard: Card) => void;
  users: User[];
}

const EditCardModal: React.FC<EditCardModalProps> = ({ isOpen, onClose, card, onSubmit, users }) => {
  const [formData, setFormData] = useState<Partial<Card>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { showToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const toInputDateLocal = (value: Date | string): string => {
    const d = new Date(value);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fromInputDateLocal = (value: string): Date => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  };

  useEffect(() => {
    if (card) {
      setFormData({
        ...card,
        dueDate: card.dueDate ? toInputDateLocal(card.dueDate as any) : '',
        priority: card.priority || 'medium',
        attachments: Array.isArray(card.attachments) ? card.attachments : [],
      });
    }
  }, [card]);

  if (!isOpen || !card) {
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'priority') {
      setFormData(prev => ({ ...prev, priority: value as Card['priority'] }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAttachmentsChange = (attachments: Attachment[]) => {
    setFormData(prev => ({ ...prev, attachments }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    const updatedCardData = { ...card, ...formData } as Card;

    if (updatedCardData.dueDate && typeof updatedCardData.dueDate === 'string') {
        updatedCardData.dueDate = fromInputDateLocal(updatedCardData.dueDate);
    }

    try {
      onSubmit(updatedCardData);
    } finally {
      setIsSaving(false);
      onClose();
    }
  };

  const deleteFromModal = async () => {
    if (!card) return;
    try {
      await axios.delete(`${API_URL}/cards/${card.id}`);
      try { window.dispatchEvent(new CustomEvent('card:deleted', { detail: { id: card.id, listId: card.listId } })); } catch {}
      showToast('Tarjeta eliminada', 'success');
      onClose();
    } catch (e) {
      showToast('No se pudo eliminar la tarjeta', 'error');
    } finally {
      setConfirmDelete(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Edit Card</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Title:
            <input
              type="text"
              name="title"
              value={formData.title || ''}
              onChange={handleChange}
              required
            />
          </label>
          <label>
            Description:
            <textarea
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
            />
          </label>
          <label>
            Due Date:
            <input
              type="date"
              name="dueDate"
              value={formData.dueDate?.toString() || ''}
              onChange={handleChange}
            />
          </label>
          <label>
            Priority:
            <select
              name="priority"
              value={formData.priority || 'medium'}
              onChange={handleChange}
            >
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <label>
            Estimated Time (minutes):
            <input
              type="number"
              name="estimatedTime"
              value={formData.estimatedTime || ''}
              onChange={handleChange}
            />
          </label>
          <label>
            Assign to:
            <select name="assignedToUserId" value={formData.assignedToUserId || ''} onChange={handleChange}>
              <option value="">Unassigned</option>
              {users.map(user => (
                <option key={user.userId} value={user.userId}>{user.name}</option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="submit" className="save-btn" disabled={isSaving}>{isSaving ? (<><Spinner /><span style={{marginLeft:6}}>Guardando…</span></>) : 'Save'}</button>
            <button type="button" onClick={onClose} className="cancel-btn" disabled={isSaving}>Cancel</button>
            <button type="button" onClick={() => setConfirmDelete(true)} className="cancel-btn" disabled={isSaving} style={{marginLeft:'auto'}}>Delete</button>
          </div>
        </form>

        {/* Comments with @mentions */}
        <CardComments cardId={card.id} users={users} />

        {/* Attachments */}
        <CardAttachments
          cardId={card.id}
          attachments={Array.isArray(formData.attachments) ? (formData.attachments as any) : []}
          onAttachmentsChange={handleAttachmentsChange}
        />
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar tarjeta"
        message="Esta acción no se puede deshacer. ¿Deseas eliminar la tarjeta?"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={deleteFromModal}
      />
    </div>
  );
};

export default EditCardModal;
