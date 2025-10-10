import React, { useState, useEffect } from 'react';
import { Card as CardType, User } from '../types/data';
import CardContent from './CardContent';
import './MyDay.css';
import LoadingOverlay from './LoadingOverlay';
import { useHabits } from '../hooks/useHabits';
import { API_URL } from '../config/api';
import { api } from '../config/http';

interface MyDayProps {
  userId?: string; // optional: if missing, show all users' cards due today
  users: User[];
  onEditCard: (card: CardType) => void;
  onStartFocus: (card: CardType) => void;
  refreshKey?: number;
}

const MyDay: React.FC<MyDayProps> = ({ userId, users, onEditCard, onStartFocus, refreshKey }) => {
  const [todaysCards, setTodaysCards] = useState<CardType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
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

  // Robust parser for dueDate
  const parseDate = (value: any): Date | undefined => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'object') {
      if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
      if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    }
    if (typeof value === 'string') {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
      const d = new Date(value); return isNaN(d.getTime()) ? undefined : d;
    }
    if (typeof value === 'number') return new Date(value);
    return undefined;
  };

  const toLocalDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        setLoading(true);
        const today = toLocalDateOnly(new Date());
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const params = new URLSearchParams({ start: today.toISOString(), end: tomorrow.toISOString() });
        if (userId) params.set('userId', userId);
        const response = await api.get<any[]>(`${API_URL}/cards/search?${params.toString()}`);
        const filtered = response.data
          .map((c: any) => ({ ...c, dueDate: parseDate(c.dueDate) }))
          .filter((c: any) => !c.completed) as CardType[];

        setTodaysCards(filtered);
        setError(null);
      } catch (error) {
        console.error("Error fetching cards for MyDay:", error);
        setError('No se pudieron cargar las tareas de hoy');
      } finally {
        setLoading(false);
      }
    };
    fetchCards();
  }, [userId, refreshKey]);

  const handleCardClick = (card: CardType) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.focus-button')) return;
    onEditCard(card);
  };

  const handleStartFocus = (card: CardType) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartFocus(card);
  };

  const canManageHabits = Boolean(userId);

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
    <div className="my-day">
      <h2>Mi Día</h2>
      {loading && <LoadingOverlay message="Cargando tareas de hoy…" />}
      {error && <p className="error-message">{error}</p>}
      {!loading && todaysCards.length === 0 && !error && (
        <p>No tienes tareas con fecha para hoy.</p>
      )}
      <div className="todays-cards">
        {todaysCards.map(card => (
          <CardContent
            key={card.id}
            card={card}
            users={users}
            onClick={handleCardClick(card)}
            onStartFocus={handleStartFocus(card)}
          />
        ))}
      </div>
      <section className="habits-section">
        <div className="habits-header">
          <h3>Checklist de hábitos</h3>
          {habitsLoading && <span className="habit-status">Cargando…</span>}
        </div>
        {!canManageHabits && (
          <p className="habit-help">Selecciona un usuario para agregar o marcar hábitos.</p>
        )}
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
          {habits.length === 0 && !habitsLoading && (
            <li className="habit-empty">No tienes hábitos registrados para hoy.</li>
          )}
          {habits.map(habit => (
            <li
              key={habit.id}
              className={`habit-item ${habit.completed ? 'completed' : ''} ${pendingHabitId === habit.id ? 'pending' : ''}`.trim()}
            >
              <div className="habit-row">
                <label>
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
                        className="habit-action"
                        onClick={() => beginEditHabit(habit.id, habit.name)}
                        disabled={updatingHabitId === habit.id}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="habit-action danger"
                        onClick={() => handleDeleteHabit(habit.id)}
                        disabled={updatingHabitId === habit.id}
                      >
                        Borrar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};

export default MyDay;
