import React, { useState, useEffect } from 'react';
import { Board } from '../types/data';

interface EditBoardModalProps {
  board: Board | null;
  onClose: () => void;
  onSubmit: (boardData: Partial<Board>) => void;
}

const EditBoardModal: React.FC<EditBoardModalProps> = ({ board, onClose, onSubmit }) => {
  const [formData, setFormData] = useState<Partial<Board>>({});

  useEffect(() => {
    if (board) {
      setFormData(board);
    }
  }, [board]);

  if (!board) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'priority') {
      setFormData(prev => ({ ...prev, [name]: value as 'low' | 'medium' | 'high' }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Edit Board</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Board Name:
            <input type="text" name="name" value={formData.name || ''} onChange={handleChange} required />
          </label>
          <label>
            Description (optional):
            <textarea name="description" value={formData.description || ''} onChange={handleChange} />
          </label>
          <label>
            Visibility:
            <select name="visibility" value={formData.visibility || 'private'} onChange={handleChange}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
          <label>
            Priority:
            <select name="priority" value={formData.priority || 'medium'} onChange={handleChange}>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
          </label>
          <div className="modal-actions">
            <button type="submit">Save Changes</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditBoardModal;
