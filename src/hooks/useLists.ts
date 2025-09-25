import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { List } from '../types/data';
import { useToast } from '../context/ToastContext';
import { API_URL } from '../config/api';

// Helper to format list dates (assuming lists also have createdAt/updatedAt)
const formatListDates = (list: any): List => {
    const createdAt = list.createdAt?._seconds ? new Date(list.createdAt._seconds * 1000) : new Date();
    const updatedAt = list.updatedAt?._seconds ? new Date(list.updatedAt._seconds * 1000) : new Date();
    return { ...list, createdAt, updatedAt } as List;
};

export const useLists = (boardId: string | null) => {
  const [lists, setLists] = useState<List[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchLists = useCallback(async (id: string) => {
    if (!id) {
      setLists([]);
      return;
    }
    setIsLoading(true);
    try {
      const response = await axios.get<any[]>(`${API_URL}/boards/${id}/lists`);
      const formattedLists = response.data.map(formatListDates);
      setLists(formattedLists);
      setError(null);
    } catch (err) {
      setError('Failed to fetch lists');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (boardId) {
      fetchLists(boardId);
    }
  }, [boardId, fetchLists]);

  const handleCreateList = async (name: string) => {
    if (!boardId) {
      setError('Cannot create list: no board selected.');
      return undefined;
    }
    try {
      const response = await axios.post<any>(`${API_URL}/boards/${boardId}/lists`, { name, position: lists.length });
      const serverList = response.data;
      const normalized = { ...serverList, listId: serverList.listId || serverList.id };
      const newList = formatListDates(normalized);
      setLists(prev => [...prev, newList]);
      showToast('Lista creada', 'success');
      return newList;
    } catch (err) {
      setError('Failed to create list');
      console.error(err);
      showToast('No se pudo crear la lista', 'error');
      return undefined;
    }
  };

  const handleUpdateList = async (listId: string, data: Partial<Pick<List, 'name' | 'position'>>) => {
    try {
      const response = await axios.put<any>(`${API_URL}/lists/${listId}`, data);
      const serverList = response.data;
      const normalized = { ...serverList, listId: serverList.listId || serverList.id };
      const updated = formatListDates(normalized);
      setLists(prev => prev.map(l => (l.listId === listId ? { ...l, ...updated } : l)));
    } catch (err) {
      setError('Failed to update list');
      console.error(err);
    }
  };

  const handleDeleteList = async (listId: string) => {
    try {
      await axios.delete(`${API_URL}/lists/${listId}`);
      setLists(prev => prev.filter(l => l.listId !== listId));
    } catch (err) {
      setError('Failed to delete list');
      console.error(err);
    }
  };

  return { lists, isLoading, error, handleCreateList, handleUpdateList, handleDeleteList, fetchLists };
};
