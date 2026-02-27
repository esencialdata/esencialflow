import React, { useState } from 'react';
import { useHabits } from '../hooks/useHabits';
import './HabitsModal.css';

interface HabitsModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
}

const HabitsModal: React.FC<HabitsModalProps> = ({ isOpen, onClose, userId }) => {
    const [newHabitName, setNewHabitName] = useState('');
    const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
    const [editingHabitValue, setEditingHabitValue] = useState('');

    const {
        habits,
        isLoading: habitsLoading,
        error: habitsError,
        isCreating: habitCreating,
        pendingHabitId,
        updatingHabitId,
        createHabit,
        toggleHabit,
        updateHabit,
        deleteHabit,
    } = useHabits(userId);

    if (!isOpen) return null;

    const handleSubmitHabit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newHabitName.trim()) return;
        const created = await createHabit(newHabitName);
        if (created) {
            setNewHabitName('');
        }
    };

    const beginEditHabit = (habitId: string, currentName: string) => {
        setEditingHabitId(habitId);
        setEditingHabitValue(currentName);
    };

    const handleSaveHabit = async (habitId: string) => {
        if (!editingHabitValue.trim()) return;
        const ok = await updateHabit(habitId, editingHabitValue);
        if (ok) {
            setEditingHabitId(null);
            setEditingHabitValue('');
        }
    };

    const handleDeleteHabit = async (habitId: string) => {
        const confirmed = window.confirm('¿Eliminar este hábito? Se borrarán sus registros diarios.');
        if (!confirmed) return;
        await deleteHabit(habitId);
    };

    return (
        <div className="habits-modal-overlay" onMouseDown={onClose}>
            <div className="habits-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="habits-header">
                    <h3>Checklist de hábitos</h3>
                    <button className="icon-btn" onClick={onClose} title="Cerrar">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                {habitsLoading && <div className="habit-status">Cargando hábitos...</div>}
                {habitsError && <p className="error-message">{habitsError}</p>}

                <form className="habit-form" onSubmit={handleSubmitHabit}>
                    <input
                        type="text"
                        placeholder="Agregar nuevo hábito"
                        value={newHabitName}
                        onChange={(e) => setNewHabitName(e.target.value)}
                        disabled={habitCreating}
                    />
                    <button type="submit" disabled={habitCreating || !newHabitName.trim()}>
                        {habitCreating ? 'Guardando…' : 'Agregar'}
                    </button>
                </form>

                <ul className="habit-list">
                    {!habitsLoading && habits.length === 0 && (
                        <li className="habit-empty">No tienes hábitos registrados para hoy.</li>
                    )}
                    {habits.map(habit => (
                        <li
                            key={habit.id}
                            className={`habit-item ${habit.completed ? 'completed' : ''} ${pendingHabitId === habit.id ? 'pending' : ''}`.trim()}
                        >
                            <div className="habit-row">
                                <label className="habit-label">
                                    <input
                                        type="checkbox"
                                        checked={habit.completed}
                                        onChange={() => toggleHabit(habit.id)}
                                        disabled={pendingHabitId === habit.id || updatingHabitId === habit.id || habitsLoading}
                                    />
                                    {editingHabitId === habit.id ? (
                                        <input
                                            className="habit-edit-input"
                                            value={editingHabitValue}
                                            onChange={(e) => setEditingHabitValue(e.target.value)}
                                            autoFocus
                                        />
                                    ) : (
                                        <span>{habit.name}</span>
                                    )}
                                </label>
                                <div className="habit-actions">
                                    {editingHabitId === habit.id ? (
                                        <>
                                            <button
                                                type="button"
                                                className="habit-action"
                                                onClick={() => handleSaveHabit(habit.id)}
                                                disabled={updatingHabitId === habit.id || !editingHabitValue.trim()}
                                            >
                                                Guardar
                                            </button>
                                            <button
                                                type="button"
                                                className="habit-action"
                                                onClick={() => { setEditingHabitId(null); setEditingHabitValue(''); }}
                                                disabled={updatingHabitId === habit.id}
                                            >
                                                Cancelar
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="habit-action icon-btn-small"
                                                onClick={() => beginEditHabit(habit.id, habit.name)}
                                                disabled={updatingHabitId === habit.id}
                                                title="Editar"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                type="button"
                                                className="habit-action danger icon-btn-small"
                                                onClick={() => handleDeleteHabit(habit.id)}
                                                disabled={updatingHabitId === habit.id}
                                                title="Borrar"
                                            >
                                                🗑️
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default HabitsModal;
