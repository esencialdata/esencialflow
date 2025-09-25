import { useState, useEffect } from 'react';
import axios from 'axios';
import { Board } from '../types/data';
import { API_URL } from '../config/api';

// Helper to format board dates from Firestore Timestamps
const formatBoardDates = (board: any): Board => {
    const createdAt = board.createdAt?._seconds ? new Date(board.createdAt._seconds * 1000) : new Date();
    const updatedAt = board.updatedAt?._seconds ? new Date(board.updatedAt._seconds * 1000) : new Date();
    const priority = typeof board.priority === 'string' && ['low', 'medium', 'high'].includes(board.priority)
      ? board.priority as Board['priority']
      : 'medium';
    return { ...board, createdAt, updatedAt, priority } as Board;
};

export const useBoards = () => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // This useEffect runs only once on mount to fetch all initial boards
  useEffect(() => {
    const fetchBoardsAndSetInitial = async () => {
        setIsLoading(true);
        try {
          const response = await axios.get<any[]>(`${API_URL}/boards`);
          const formattedBoards = response.data.map(formatBoardDates);
          setBoards(formattedBoards);
          
          if (formattedBoards.length > 0) {
            setCurrentBoardId(formattedBoards[0].boardId);
          }
        } catch (err) {
          setError('Failed to fetch boards');
          console.error(err);
        } finally {
          setIsLoading(false);
        }
    };
    
    fetchBoardsAndSetInitial();
  }, []); // Empty dependency array ensures this runs only ONCE.

  const handleCreateBoard = async (boardData: Omit<Board, 'boardId' | 'createdAt' | 'updatedAt'>) => {
    try {
      const payload = { ...boardData, priority: boardData.priority || 'medium' };
      const response = await axios.post<any>(`${API_URL}/boards`, payload);
      const newBoard = formatBoardDates(response.data);
      setBoards(prev => [...prev, newBoard]);
      setCurrentBoardId(newBoard.boardId);
      setIsCreatingBoard(false);
    } catch (err) {
      setError('Failed to create board');
      console.error(err);
    }
  };

  const handleUpdateBoard = async (boardData: Partial<Board>) => {
    if (!editingBoard) return;
    try {
      const response = await axios.put<any>(`${API_URL}/boards/${editingBoard.boardId}`, boardData);
      const updatedBoard = formatBoardDates(response.data);
      setBoards(prev => prev.map(b => b.boardId === editingBoard.boardId ? updatedBoard : b));
      setEditingBoard(null);
    } catch (err) {
      setError('Failed to update board');
      console.error(err);
    }
  };

  const handleDeleteBoard = async (boardId: string) => {
    try {
      await axios.delete(`${API_URL}/boards/${boardId}`);
      const newBoards = boards.filter(b => b.boardId !== boardId);
      setBoards(newBoards);

      if (currentBoardId === boardId) {
        const newCurrentId = newBoards.length > 0 ? newBoards[0].boardId : null;
        setCurrentBoardId(newCurrentId);
      }
    } catch (err) {
      setError('Failed to delete board');
      console.error(err);
    }
  };

  return {
    boards,
    currentBoardId,
    editingBoard,
    isCreatingBoard,
    isLoading,
    error,
    setCurrentBoardId,
    setEditingBoard,
    setIsCreatingBoard,
    handleCreateBoard,
    handleUpdateBoard,
    handleDeleteBoard,
  };
};
