import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Card } from '../types/data';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config/api';

// Robust date parser for fields that may come as Firestore Timestamp, ISO string, number, or Date
const parseDate = (value: any): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  // Firestore Timestamp shapes
  if (typeof value === 'object') {
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  }
  // ISO string or epoch number
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value === 'number') return new Date(value);
  return undefined;
};

// Helper to format card dates
const formatCardDates = (card: any): Card => {
  const createdAt = parseDate(card.createdAt) || new Date();
  const updatedAt = parseDate(card.updatedAt) || new Date();
  const dueDate = parseDate(card.dueDate);
  const priority = typeof card.priority === 'string' && ['low', 'medium', 'high'].includes(card.priority)
    ? card.priority as Card['priority']
    : 'medium';
  return { ...card, createdAt, updatedAt, dueDate, priority } as Card;
};

export const useCards = (boardId: string | null) => {
  const [cardsByList, setCardsByList] = useState<Record<string, Card[]>>({}); // Changed state name and type
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchCards = useCallback(async (id: string) => {
    if (!id) {
      setCardsByList({}); // Clear cards if no boardId
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.get<any[]>(`${API_URL}/boards/${id}/cards`);
      const formattedCards = response.data.map(formatCardDates);
      
      // Group cards by listId and sort by position (fallback to createdAt)
      const groupedCards: Record<string, Card[]> = {};
      formattedCards.forEach(card => {
        if (!groupedCards[card.listId]) {
          groupedCards[card.listId] = [];
        }
        groupedCards[card.listId].push(card);
      });
      Object.keys(groupedCards).forEach(listId => {
        groupedCards[listId].sort((a, b) => {
          const pa = a.position ?? Number.MAX_SAFE_INTEGER;
          const pb = b.position ?? Number.MAX_SAFE_INTEGER;
          if (pa !== pb) return pa - pb;
          const ca = new Date(a.createdAt as any).getTime();
          const cb = new Date(b.createdAt as any).getTime();
          return ca - cb;
        });
      });
      setCardsByList(groupedCards);
      setError(null);
    } catch (err) {
      setError('Failed to fetch cards');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (boardId) {
      fetchCards(boardId);
    }
  }, [boardId, fetchCards]);

  // Listen for global card updates to reflect changes immediately across views
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<any>;
      const updated: Card | undefined = ce.detail as any;
      if (!updated) return;
      setCardsByList(prev => {
        // Remove from any list where it exists
        const next: Record<string, Card[]> = {};
        Object.keys(prev).forEach(listId => {
          const filtered = (prev[listId] || []).filter(c => c.id !== updated.id);
          next[listId] = filtered;
        });
        // Insert into its (possibly new) list
        const targetList = updated.listId;
        next[targetList] = [...(next[targetList] || []), updated];
        return next;
      });
    };
    window.addEventListener('card:updated', handler as EventListener);
    return () => window.removeEventListener('card:updated', handler as EventListener);
  }, []);

  // Listen for deletions
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<any>;
      const payload = ce.detail as { id: string; listId?: string };
      if (!payload?.id) return;
      setCardsByList(prev => {
        const next: Record<string, Card[]> = {};
        Object.keys(prev).forEach(listId => {
          next[listId] = (prev[listId] || []).filter(c => c.id !== payload.id);
        });
        return next;
      });
    };
    window.addEventListener('card:deleted', handler as EventListener);
    return () => window.removeEventListener('card:deleted', handler as EventListener);
  }, []);

  const handleCreateCard = async (listId: string, cardData: Omit<Card, 'id' | 'listId' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await axios.post<any>(`${API_URL}/lists/${listId}/cards`, cardData);
      const newCard = formatCardDates(response.data);
      setCardsByList(prev => {
        const updatedCards = { ...prev };
        if (!updatedCards[listId]) {
            updatedCards[listId] = [];
        }
        updatedCards[listId].push(newCard);
        return updatedCards;
      });
      showToast('Tarjeta creada', 'success');
    } catch (err) {
      setError('Failed to create card');
      console.error(err);
      showToast('No se pudo crear la tarjeta', 'error');
    }
  };

  const handleUpdateCard = async (cardId: string, data: Partial<Card>) => {
    try {
      const response = await axios.put<any>(`${API_URL}/cards/${cardId}`, data);
      const updated = formatCardDates(response.data);
      setCardsByList(prev => {
        const next: Record<string, Card[]> = {};
        // Remove from all lists
        Object.keys(prev).forEach(listId => {
          next[listId] = (prev[listId] || []).filter(c => c.id !== cardId);
        });
        // Insert into its list (from response)
        const lid = updated.listId;
        next[lid] = [...(next[lid] || []), updated];
        return next;
      });
    } catch (err) {
      setError('Failed to update card');
      console.error(err);
    }
  };

  const persistListOrder = async (listId: string, cards: Card[]) => {
    // Persist positions in a single batch request for performance
    try {
      const updates = cards.map((c, idx) => ({ cardId: c.id, listId, position: idx }));
      await axios.post(`${API_URL}/cards/reorder-batch`, { updates });
    } catch (err) {
      console.error('Failed to persist list order:', err);
    }
  };

  // Update local state for drag & drop and persist to backend
  const handleMoveCard = async (
    draggableId: string,
    fromListId: string,
    toListId: string,
    toIndex: number
  ) => {
    let updatedFrom: Card[] = [];
    let updatedTo: Card[] = [];

    setCardsByList(prev => {
      const next = { ...prev };
      const from = [...(next[fromListId] || [])];
      const to = fromListId === toListId ? from : [...(next[toListId] || [])];

      const cardIndex = from.findIndex(c => c.id === draggableId);
      if (cardIndex === -1) return prev; // nothing to do

      const [moved] = from.splice(cardIndex, 1);
      const updatedMoved = { ...moved, listId: toListId } as Card;

      // insert into destination at the correct index
      to.splice(toIndex, 0, updatedMoved);

      // Reindex positions locally
      const reindex = (arr: Card[], listId: string) => arr.map((c, idx) => ({ ...c, listId, position: idx }));
      if (fromListId === toListId) {
        const re = reindex(to, toListId);
        next[toListId] = re;
        updatedTo = re;
      } else {
        const reFrom = reindex(from, fromListId);
        const reTo = reindex(to, toListId);
        next[fromListId] = reFrom;
        next[toListId] = reTo;
        updatedFrom = reFrom;
        updatedTo = reTo;
      }
      return next;
    });

    try {
      // Persist destination order (and source if moved across lists)
      if (updatedTo.length) await persistListOrder(toListId, updatedTo);
      if (updatedFrom.length) await persistListOrder(fromListId, updatedFrom);
    } catch (err) {
      console.error('Failed to persist card move:', err);
      if (boardId) fetchCards(boardId);
      showToast('No se pudo persistir el movimiento', 'error');
    }
  };

  return { cards: cardsByList, isLoading, error, fetchCards, handleCreateCard, handleMoveCard, handleUpdateCard }; // Return cards as cardsByList
};
