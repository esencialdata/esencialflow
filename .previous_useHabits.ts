import { useState, useEffect, useCallback, useMemo } from 'react';
import { HabitDailyStatus } from '../types/data';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config/api';
import { api } from '../config/http';

const parseDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
};

const buildDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const toDateKey = (value?: Date | string): string => {
  if (!value) {
    return buildDateKey(new Date());
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return buildDateKey(parsed);
    }
    return buildDateKey(new Date());
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return buildDateKey(value);
  }
  return buildDateKey(new Date());
};

const normalizeHabit = (habit: any): HabitDailyStatus => {
  const createdAt = parseDate(habit.createdAt) || habit.createdAt;
  const updatedAt = parseDate(habit.updatedAt) || habit.updatedAt;
  const completedAt = parseDate(habit.completedAt) || habit.completedAt || null;
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    userId: habit.userId,
    archived: habit.archived,
    createdAt,
    updatedAt,
    date: habit.date,
    completed: Boolean(habit.completed),
    completedAt,
  };
};

export const useHabits = (userId?: string, targetDate?: Date | string) => {
  const [habits, setHabits] = useState<HabitDailyStatus[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);
  const [updatingHabitId, setUpdatingHabitId] = useState<string | null>(null);
  const { showToast } = useToast();

  const dateKey = useMemo(() => toDateKey(targetDate), [targetDate]);

  const fetchDailyHabits = useCallback(async () => {
    if (!userId) {
      setHabits([]);
      setError('Selecciona un usuario para ver hábitos');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.get(`${API_URL}/habits/daily`, {
        params: {
          date: dateKey,
          userId,
        },
      });
      const habitsData = Array.isArray(response.data) ? response.data : [];
      const normalized = habitsData
        .map(normalizeHabit)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setHabits(normalized);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch daily habits', err);
      setError('No se pudieron cargar los hábitos');
    } finally {
      setIsLoading(false);
    }
  }, [dateKey, userId]);

  useEffect(() => {
    fetchDailyHabits();
  }, [fetchDailyHabits]);

  const createHabit = useCallback(
    async (name: string, description?: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!trimmed) {
        showToast('El nombre del hábito es obligatorio', 'info');
        return false;
      }
      if (!userId) {
        showToast('Selecciona un usuario para crear hábitos', 'info');
        return false;
      }
      setIsCreating(true);
      try {
        await api.post(`${API_URL}/habits`, {
          name: trimmed,
          description: description?.trim() || '',
          userId,
        });
        await fetchDailyHabits();
        showToast('Hábito creado', 'success');
        return true;
      } catch (err) {
        console.error('Failed to create habit', err);
        setError('No se pudo crear el hábito');
        showToast('No se pudo crear el hábito', 'error');
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [fetchDailyHabits, showToast, userId]
  );

  const toggleHabit = useCallback(
    async (habitId: string, nextValue?: boolean): Promise<boolean> => {
      const targetHabit = habits.find(h => h.id === habitId);
      if (!targetHabit) return false;
      const shouldComplete = typeof nextValue === 'boolean' ? nextValue : !targetHabit.completed;
      setPendingHabitId(habitId);
      try {
        if (shouldComplete) {
          const response = await api.post(`${API_URL}/habits/${habitId}/check`, {
            date: dateKey,
            userId,
          });
          const completedAt = parseDate(response.data?.completedAt) || new Date();
          setHabits(prev => prev.map(h => (h.id === habitId ? { ...h, completed: true, completedAt } : h)));
        } else {
          await api.delete(`${API_URL}/habits/${habitId}/check`, {
            params: { date: dateKey, userId },
          });
          setHabits(prev => prev.map(h => (h.id === habitId ? { ...h, completed: false, completedAt: null } : h)));
        }
        setError(null);
        return shouldComplete;
      } catch (err) {
        console.error('Failed to toggle habit', err);
        setError('No se pudo actualizar el hábito');
        showToast('No se pudo actualizar el hábito', 'error');
        return targetHabit.completed;
      } finally {
        setPendingHabitId(null);
      }
    },
    [dateKey, habits, showToast, userId]
  );

  const updateHabit = useCallback(
    async (habitId: string, name: string, description?: string): Promise<boolean> => {
      const trimmed = name.trim();
      if (!trimmed) {
        showToast('El nombre del hábito es obligatorio', 'info');
        return false;
      }
      setUpdatingHabitId(habitId);
      try {
        await api.put(`${API_URL}/habits/${habitId}`, {
          name: trimmed,
          description: description?.trim() || '',
        });
        await fetchDailyHabits();
        showToast('Hábito actualizado', 'success');
        return true;
      } catch (err) {
        console.error('Failed to update habit', err);
        setError('No se pudo actualizar el hábito');
        showToast('No se pudo actualizar el hábito', 'error');
        return false;
      } finally {
        setUpdatingHabitId(null);
      }
    },
    [fetchDailyHabits, showToast]
  );

  const deleteHabit = useCallback(
    async (habitId: string): Promise<boolean> => {
      setUpdatingHabitId(habitId);
      try {
        await api.delete(`${API_URL}/habits/${habitId}`);
        setHabits(prev => prev.filter(h => h.id !== habitId));
        showToast('Hábito eliminado', 'success');
        return true;
      } catch (err) {
        console.error('Failed to delete habit', err);
        setError('No se pudo eliminar el hábito');
        showToast('No se pudo eliminar el hábito', 'error');
        return false;
      } finally {
        setUpdatingHabitId(null);
      }
    },
    [showToast]
  );

  return {
    habits,
    isLoading,
    error,
    isCreating,
    pendingHabitId,
    updatingHabitId,
    dateKey,
    refresh: fetchDailyHabits,
    createHabit,
    toggleHabit,
    updateHabit,
    deleteHabit,
  };
};

export type UseHabitsReturn = ReturnType<typeof useHabits>;
