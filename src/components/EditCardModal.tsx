import React, { useState, useEffect } from 'react';
import { Card, User, Attachment } from '../types/data';
import './EditCardModal.css';
import Spinner from './Spinner';
import ConfirmDialog from './ConfirmDialog';

import CardComments from './CardComments';
import CardAttachments from './CardAttachments';


interface EditCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: Card | null;
  onSubmit: (updatedCard: Card) => void | Promise<void>;
  onDelete?: (card: Card) => void;
  users: User[];
  readOnly?: boolean;
}

const EditCardModal: React.FC<EditCardModalProps> = ({ isOpen, onClose, card, onSubmit, onDelete, users, readOnly = false }) => {
  const [formData, setFormData] = useState<Partial<Card>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const isReadOnly = Boolean(readOnly);

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
    if (isReadOnly) return;
    const { name, value, type } = e.target as HTMLInputElement; // cast to access 'type'

    if (name === 'priority') {
      setFormData(prev => ({ ...prev, priority: value as Card['priority'] }));
    } else if (type === 'number') {
      const numValue = value === '' ? undefined : Number(value);
      setFormData(prev => ({ ...prev, [name]: numValue }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAttachmentsChange = (attachments: Attachment[]) => {
    if (isReadOnly) return;
    setFormData(prev => ({ ...prev, attachments }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) {
      onClose();
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    const updatedCardData = { ...card, ...formData } as Card;

    if (updatedCardData.dueDate && typeof updatedCardData.dueDate === 'string') {
      updatedCardData.dueDate = fromInputDateLocal(updatedCardData.dueDate);
    }
    // Handle empty date as null for Supabase to clear the value
    if (updatedCardData.dueDate && (updatedCardData.dueDate as any) === '') {
      updatedCardData.dueDate = null as any;
    }

    try {
      await onSubmit(updatedCardData);
    } catch (e) {
      console.error("Error in modal submit", e);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFromModal = async () => {
    if (isReadOnly) return;
    if (!card || !onDelete) return;

    // Call parent handler
    onDelete(card);
    setConfirmDelete(false);
    // onClose(); // Parent will likely close it
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
              readOnly={isReadOnly}
              disabled={isSaving && !isReadOnly}
            />
          </label>
          <label>
            Description:
            <textarea
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              readOnly={isReadOnly}
              disabled={isSaving && !isReadOnly}
            />
          </label>
          <label>
            Due Date:
            <input
              type="date"
              name="dueDate"
              value={formData.dueDate?.toString() || ''}
              onChange={handleChange}
              disabled={isReadOnly || isSaving}
            />
          </label>
          <label>
            Priority:
            <select
              name="priority"
              value={formData.priority || 'medium'}
              onChange={handleChange}
              disabled={isReadOnly || isSaving}
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
              readOnly={isReadOnly}
              disabled={isSaving && !isReadOnly}
            />
          </label>
          <label>
            Assign to:
            <select name="assignedToUserId" value={formData.assignedToUserId || ''} onChange={handleChange} disabled={isReadOnly || isSaving}>
              <option value="">Unassigned</option>
              {users.map(user => (
                <option key={user.userId} value={user.userId}>{user.name}</option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            {isReadOnly ? (
              <button type="button" onClick={onClose} className="cancel-btn">Cerrar</button>
            ) : (
              <>
                <button type="submit" className="save-btn" disabled={isSaving}>{isSaving ? (<><Spinner /><span style={{ marginLeft: 6 }}>Guardando…</span></>) : 'Save'}</button>
                <button type="button" onClick={onClose} className="cancel-btn" disabled={isSaving}>Cancel</button>
                <button type="button" onClick={() => setConfirmDelete(true)} className="cancel-btn" disabled={isSaving} style={{ marginLeft: 'auto' }}>Delete</button>
              </>
            )}
          </div>
        </form>

        {!isReadOnly && (
          <>
            {/* Comments with @mentions */}
            <CardComments cardId={card.id} users={users} />

            {/* Attachments */}
            <CardAttachments
              cardId={card.id}
              attachments={Array.isArray(formData.attachments) ? (formData.attachments as any) : []}
              onAttachmentsChange={handleAttachmentsChange}
            />
          </>
        )}
        {isReadOnly && Array.isArray(formData.attachments) && (formData.attachments as Attachment[]).length > 0 && (
          <div className="attachment-list-readonly">
            <h3>Adjuntos</h3>
            <ul>
              {(formData.attachments as Attachment[]).map(att => (
                <li key={att.attachmentId}>
                  <a href={att.url} target="_blank" rel="noreferrer">
                    {att.fileName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {!isReadOnly && (
        <ConfirmDialog
          open={confirmDelete}
          title="Eliminar tarjeta"
          message="Esta acción no se puede deshacer. ¿Deseas eliminar la tarjeta?"
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={deleteFromModal}
        />
      )}
    </div>
  );
};

export default EditCardModal;
