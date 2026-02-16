import { useState, useEffect, useCallback } from 'react';
import { Card } from '../types/data';
import { useToast } from '../context/ToastContext';
import { supabase } from '../config/supabase';

// Helper to map Supabase snake_case to App camelCase
const mapFromSupabase = (record: any): Card => ({
  id: record.id,
  title: record.title,
  description: record.description,
  listId: record.list_id,
  priority: record.priority,
  position: record.position,
  dueDate: record.due_date ? new Date(record.due_date) : undefined,
  completed: record.completed,
  completedAt: record.completed_at ? new Date(record.completed_at) : undefined,
  archived: record.archived,
  archivedAt: record.archived_at ? new Date(record.archived_at) : undefined,
  assignedToUserId: record.assigned_to_user_id,
  estimatedTime: record.estimated_time,
  actualTime: record.actual_time,
  createdAt: record.created_at ? new Date(record.created_at) : new Date(),
  updatedAt: record.updated_at ? new Date(record.updated_at) : new Date(),
  checklist: record.checklist || [],
  attachments: record.attachments || []
});

// Helper to map App camelCase to Supabase snake_case
const mapToSupabase = (card: Partial<Card>): any => {
  const payload: any = {};
  if (card.title !== undefined) payload.title = card.title;
  if (card.description !== undefined) payload.description = card.description;
  if (card.listId !== undefined) payload.list_id = card.listId;
  if (card.priority !== undefined) payload.priority = card.priority;
  if (card.position !== undefined) payload.position = card.position;
  if (card.dueDate !== undefined) payload.due_date = toSupabaseDate(card.dueDate);
  if (card.completed !== undefined) payload.completed = card.completed;
  if (card.completedAt !== undefined) payload.completed_at = toSupabaseDate(card.completedAt);
  if (card.archived !== undefined) payload.archived = card.archived;
  if (card.archivedAt !== undefined) payload.archived_at = toSupabaseDate(card.archivedAt);
  if (card.assignedToUserId !== undefined) payload.assigned_to_user_id = card.assignedToUserId;
  if (card.estimatedTime !== undefined) payload.estimated_time = card.estimatedTime;
  if (card.actualTime !== undefined) payload.actual_time = card.actualTime;
  if (card.checklist !== undefined) payload.checklist = card.checklist;
  if (card.attachments !== undefined) payload.attachments = card.attachments;
  // Metadata
  payload.updated_at = new Date().toISOString();
  return payload;
};

// Helper for date sanitization
const toSupabaseDate = (date: any) => {
  if (!date || date === '') return null;
  if (date instanceof Date) return date.toISOString();
  return date;
};

export const useCards = (_boardId: string | null) => {
  const [cardsByList, setCardsByList] = useState<Record<string, Card[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchCards = useCallback(async (_id: string) => {
    setIsLoading(true);
    try {
      // Fetch all non-archived cards
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .neq('archived', true)
        .order('position', { ascending: true }); // Base sort by position

      if (error) throw error;

      const formattedCards = (data || []).map(mapFromSupabase);

      // Group cards by listId
      const groupedCards: Record<string, Card[]> = {};
      formattedCards.forEach(card => {
        if (!groupedCards[card.listId]) {
          groupedCards[card.listId] = [];
        }
        groupedCards[card.listId].push(card);
      });

      // Secondary sort in JS to be safe (though SQL order should stick)
      Object.keys(groupedCards).forEach(listId => {
        groupedCards[listId].sort((a, b) => (a.position || 0) - (b.position || 0));
      });

      setCardsByList(groupedCards);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch cards');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch (we ignore boardId for now as we have a single cards table)
    fetchCards('global');

    // Subscribe to realtime changes
    const channel = supabase
      .channel('public:cards')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, (payload) => {
        console.log('🔔 Realtime event received:', payload.eventType, payload);
        fetchCards('global');
      })
      .subscribe((status) => {
        console.log('📡 Realtime subscription status:', status);
      });

    // iOS PWA fix: WebSocket is killed when app goes to background.
    // Re-fetch cards when the app returns to the foreground.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('👁️ App visible again — refreshing cards');
        fetchCards('global');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Sync with App.tsx modal actions (delete/update dispatch events)
    const handleCardChange = () => fetchCards('global');
    window.addEventListener('card:deleted', handleCardChange);
    window.addEventListener('card:updated', handleCardChange);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('card:deleted', handleCardChange);
      window.removeEventListener('card:updated', handleCardChange);
    };
  }, [fetchCards]);


  const handleCreateCard = async (listId: string, cardData: Omit<Card, 'id' | 'listId' | 'createdAt' | 'updatedAt'>) => {
    try {
      const payload = mapToSupabase({ ...cardData, listId });
      const { data, error } = await supabase.from('cards').insert(payload).select().single();

      if (error) throw error;

      const newCard = mapFromSupabase(data);
      setCardsByList(prev => {
        const updatedCards = { ...prev };
        if (!updatedCards[listId]) {
          updatedCards[listId] = [];
        }
        updatedCards[listId].push(newCard); // Optimistic-ish update (fetchCards will correct)
        return updatedCards;
      });
      return newCard;
    } catch (err: any) {
      setError('Failed to create card');
      console.error(err);
      throw err; // Re-throw for UI handling
    }
  };

  const handleUpdateCard = async (cardId: string, data: Partial<Card>) => {
    try {
      const payload = mapToSupabase(data);
      const { error } = await supabase.from('cards').update(payload).eq('id', cardId);
      if (error) throw error;
      // fetchCards handled by subscription
    } catch (err: any) {
      setError('Failed to update card');
      console.error(err);
      throw err; // Re-throw for UI handling
    }
  };

  const handleDeleteCard = async (cardId: string, listId: string) => {
    try {
      const { error } = await supabase.from('cards').delete().eq('id', cardId);
      if (error) throw error;

      // Optimistic update
      setCardsByList(prev => {
        const updatedCards = { ...prev };
        if (updatedCards[listId]) {
          updatedCards[listId] = updatedCards[listId].filter(c => c.id !== cardId);
        }
        return updatedCards;
      });
    } catch (err: any) {
      setError('Failed to delete card');
      console.error(err);
      throw err;
    }
  };

  const handleMoveCard = async (
    draggableId: string,
    fromListId: string,
    toListId: string,
    toIndex: number
  ) => {
    // 1. Optimistic Update
    let newCardsByList = { ...cardsByList };
    const sourceList = Array.from(newCardsByList[fromListId] || []);
    const destList = fromListId === toListId ? sourceList : Array.from(newCardsByList[toListId] || []);

    // Find and remove from source
    const movedCardIndex = sourceList.findIndex(c => c.id === draggableId);
    if (movedCardIndex === -1) return;
    const [movedCard] = sourceList.splice(movedCardIndex, 1);

    // Insert into dest
    movedCard.listId = toListId;
    destList.splice(toIndex, 0, movedCard);

    // Update state
    if (fromListId === toListId) {
      newCardsByList[fromListId] = sourceList;
    } else {
      newCardsByList[fromListId] = sourceList;
      newCardsByList[toListId] = destList;
    }
    setCardsByList(newCardsByList);

    // 2. Persist Order
    // We need to update positions for all cards in the destination list (and source if different? Source just closes gap)
    // Actually, simple position logic: update all items in 'destList' with new index
    const updates = destList.map((card, index) => ({
      id: card.id,
      list_id: toListId,
      position: index
    }));

    try {
      // Promise.all for batch update (Supabase doesn't have a bulk update endpoint easily available without RPC)
      await Promise.all(updates.map(u =>
        supabase.from('cards').update({ position: u.position, list_id: u.list_id }).eq('id', u.id)
      ));

      // If moved across lists, we might want to update source list positions too to close gaps, 
      // but strictly speaking distinct positions are enough. Sorting handles gaps.
    } catch (err) {
      console.error("Failed to move card", err);
      showToast("Error al mover tarjeta", "error");
      fetchCards('global'); // Revert on error
    }
  };

  return { cards: cardsByList, isLoading, error, fetchCards, handleCreateCard, handleMoveCard, handleUpdateCard, handleDeleteCard };
};
