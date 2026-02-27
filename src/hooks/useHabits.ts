import { useState, useEffect, useCallback, useMemo } from 'react';
import { HabitDailyStatus } from '../types/data';
import { useToast } from '../context/ToastContext';
import { supabase } from '../config/supabase';

const toDateKey = (value?: Date | string): string => {
  if (!value) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const p = new Date(value);
    if (!isNaN(p.getTime())) {
      return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`;
    }
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    setIsLoading(true);
    let uid = userId;
    if (!uid || uid === 'global') {
      const { data: { session } } = await supabase.auth.getSession();
      uid = session?.user?.id;
    }

    if (!uid) {
      setHabits([]);
      setError('Debes iniciar sesión para ver hábitos');
      setIsLoading(false);
      return;
    }

    try {
      // Fetch all active habits for user
      const { data: activeHabits, error: habitsErr } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', uid)
        .eq('archived', false)
        .order('name');
        
      if (habitsErr) throw habitsErr;

      // Fetch completions for the specific date
      const { data: completions, error: compErr } = await supabase
        .from('habit_completions')
        .select('*')
        .eq('user_id', uid)
        .eq('date', dateKey);

      if (compErr) throw compErr;

      const compsMap = new Map((completions || []).map(c => [c.habit_id, c]));

      const payload: HabitDailyStatus[] = (activeHabits || []).map(h => {
        const comp = compsMap.get(h.id);
        return {
          id: h.id,
          name: h.name,
          description: h.description,
          userId: h.user_id,
          archived: h.archived,
          createdAt: new Date(h.created_at),
          updatedAt: new Date(h.updated_at),
          date: dateKey,
          completed: !!comp,
          completedAt: comp ? new Date(comp.completed_at) : null,
        };
      });

      setHabits(payload);
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
      setIsCreating(true);
      
      let uid = userId;
      if (!uid || uid === 'global') {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }

      try {
        const { error } = await supabase.from('habits').insert({
          name: trimmed,
          description: description?.trim() || '',
          user_id: uid,
        });
        if (error) throw error;
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
      
      let uid = userId;
      if (!uid || uid === 'global') {
        const { data: { session } } = await supabase.auth.getSession();
        uid = session?.user?.id;
      }

      try {
        if (shouldComplete) {
          const { error } = await supabase.from('habit_completions').upsert({
            habit_id: habitId,
            user_id: uid,
            date: dateKey,
            completed_at: new Date().toISOString()
          }, { onConflict: 'habit_id,date' });
          if (error) throw error;
          const completedAt = new Date();
          setHabits(prev => prev.map(h => (h.id === habitId ? { ...h, completed: true, completedAt } : h)));
        } else {
          const { error } = await supabase.from('habit_completions').delete()
            .eq('habit_id', habitId)
            .eq('user_id', uid)
            .eq('date', dateKey);
          if (error) throw error;
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
        const { error } = await supabase.from('habits').update({
          name: trimmed,
          description: description?.trim() || '',
          updated_at: new Date().toISOString()
        }).eq('id', habitId);
        
        if (error) throw error;
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
        const { error } = await supabase.from('habits').delete().eq('id', habitId);
        if (error) throw error;
        setHabits(prev => prev.map(h => h.id === habitId ? { ...h, archived: true } : h).filter(h => h.id !== habitId));
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
