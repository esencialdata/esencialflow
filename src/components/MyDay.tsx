import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Card as CardType, User } from '../types/data';
import CardContent from './CardContent';
import './MyDay.css';
import LoadingOverlay from './LoadingOverlay';

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
        const response = await axios.get<any[]>(`http://localhost:3001/api/cards/search?${params.toString()}`);
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
    </div>
  );
};

export default MyDay;
