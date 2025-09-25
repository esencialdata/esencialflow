import React, { useState } from 'react';
import { Board } from '../types/data';

interface CreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (boardData: Omit<Board, 'boardId' | 'createdAt' | 'updatedAt'>) => void;
}

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // A real app would get ownerId from auth context
    const ownerId = 'user-1'; // Placeholder
    onSubmit({ name, description, visibility, ownerId, priority });
    setName('');
    setDescription('');
    setVisibility('private');
    setPriority('medium');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Create New Board</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Board Name:
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Description (optional):
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            Visibility:
            <select value={visibility} onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label>
            Priority:
            <select value={priority} onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <div className="modal-actions">
            <button type="submit">Create Board</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateBoardModal;
