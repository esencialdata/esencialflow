import React, { useState, useEffect } from 'react';
import './App.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import KanbanBoard from './components/KanbanBoard';
import HomeDashboard from './components/HomeDashboard';
import FocusMode from './components/FocusMode';
import MyDay from './components/MyDay';
import CreateBoardModal from './components/CreateBoardModal';
import EditBoardModal from './components/EditBoardModal';
import EditCardModal from './components/EditCardModal';
import { useBoards } from './hooks/useBoards';
import { useCards } from './hooks/useCards';
import ZapierIntegration from './components/ZapierIntegration';
import CalendarView from './components/CalendarView';
import ListView from './components/ListView';
import { Card, User } from './types/data';
import axios from 'axios';
import logoUrl from '../logo_esencial_w.svg';
import FocusWidget from './components/FocusWidget';
import { usePomodoro } from './context/PomodoroContext';
import ToastContainer from './components/ToastContainer';
import { useToast } from './context/ToastContext';
import ConfirmDialog from './components/ConfirmDialog';
import LoadingOverlay from './components/LoadingOverlay';
import { API_URL } from './config/api';

type View = 'home' | 'kanban' | 'myday' | 'zapier' | 'calendar' | 'list';

function App() {
  const [focusCard, setFocusCard] = useState<Card | null>(null);
  const [currentView, setCurrentView] = useState<View>('home');
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [cardsVersion, setCardsVersion] = useState(0);
  const [focusListId, setFocusListId] = useState<string | null>(null);
  const {
    boards,
    currentBoardId,
    editingBoard,
    isCreatingBoard,
    isLoading: boardsLoading,
    error: boardsError,
    setCurrentBoardId,
    setEditingBoard,
    setIsCreatingBoard,
    handleCreateBoard,
    handleUpdateBoard,
    handleDeleteBoard,
  } = useBoards();

  const { cards, isLoading: cardsLoading, error: cardsError, fetchCards: reloadCards } = useCards(currentBoardId);
  const pomodoro = usePomodoro();
  const { showToast } = useToast();
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState<{ open: boolean; boardId: string | null; busy: boolean }>({ open: false, boardId: null, busy: false });
  const [boardFilters, setBoardFilters] = useState<{ assignedToMe: boolean; assignedUserId?: string; dueToday: boolean; noDueDate: boolean; overdue: boolean; hasAttachments: boolean; showArchived: boolean; q: string }>(() => {
    try {
      const raw = localStorage.getItem('kanban.filters');
      return raw ? JSON.parse(raw) : { assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false, q: '' };
    } catch { return { assignedToMe: false, assignedUserId: '', dueToday: false, noDueDate: false, overdue: false, hasAttachments: false, showArchived: false, q: '' }; }
  });

  const fallbackUsers: User[] = [
    {
      userId: 'local-default',
      name: 'Aaron Espinosa',
      email: 'sin-correo@ejemplo.com',
    },
  ];

  const applyUsers = (list: User[]) => {
    if (!list.length) {
      setUsers(fallbackUsers);
      setSelectedUserId(prev => prev || fallbackUsers[0].userId);
      return;
    }
    setUsers(list);
    setSelectedUserId(prev => {
      if (prev && list.some(u => u.userId === prev)) {
        return prev;
      }
      return list[0].userId;
    });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      pomodoro.setUserId(selectedUserId);
    }
  }, [selectedUserId, pomodoro]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get<User[]>(`${API_URL}/users`);
      applyUsers(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error fetching users:", error);
      applyUsers([]);
    }
  };

  const handleStartFocus = (card: Card) => {
    setFocusCard(card);
    try { pomodoro.setActiveCard(card); } catch {}
  };

  const handleCloseFocus = () => {
    setFocusCard(null);
  };

  const currentBoard = boards.find(b => b.boardId === currentBoardId) || null;

  const handleEditCard = (card: Card) => {
    setEditingCard(card);
  };

  const handleEditBoardClick = () => {
    const boardToEdit = boards.find(b => b.boardId === currentBoardId);
    if (boardToEdit) {
      setEditingBoard(boardToEdit);
    }
  };

  const exportBoard = async () => {
    if (!currentBoardId) return;
    try {
      const res = await axios.get(`${API_URL}/boards/${currentBoardId}/export`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `board-${currentBoardId}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error exporting board', e);
    }
  };

  const importInputRef = React.useRef<HTMLInputElement>(null);
  const triggerImport = () => importInputRef.current?.click();
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await axios.post(`${API_URL}/boards/import`, json);
      const newBoardId = res.data?.newBoardId;
      if (newBoardId) {
        await reloadBoardsAfterImport(newBoardId);
      }
    } catch (e) {
      console.error('Error importing board', e);
    } finally {
      e.target.value = '';
    }
  };

  const reloadBoardsAfterImport = async (selectId: string) => {
    try {
      setCurrentBoardId(selectId);
    } catch {}
  };

  const handleUpdateCard = async (updatedCard: Card) => {
    try {
      if (!updatedCard.assignedToUserId && users.length === 1) {
        updatedCard.assignedToUserId = users[0].userId;
      }
      await axios.put(`${API_URL}/cards/${updatedCard.id}`, updatedCard);
      try { window.dispatchEvent(new CustomEvent('card:updated', { detail: updatedCard })); } catch {}
      setEditingCard(null);
      if (currentBoardId) {
        reloadCards(currentBoardId);
      }
      setCardsVersion(v => v + 1);
      showToast('Tarjeta actualizada', 'success');
    } catch (error) {
      console.error("Error updating card:", error);
      showToast('No se pudo actualizar la tarjeta', 'error');
    }
  };

  const openListFromHome = (listId: string) => {
    setFocusListId(listId);
    setCurrentView('kanban');
    setTimeout(() => setFocusListId(null), 1500);
  };

  return (
    <div className="App">
      <header className="App-header">
        <img src={logoUrl} alt="Esencial Flow" style={{ height: '30px' }} />
        <nav>
          <button onClick={() => setCurrentView('home')} disabled={currentView === 'home'}>Home</button>
          <button onClick={() => setCurrentView('kanban')} disabled={currentView === 'kanban'}>Tablero</button>
          <button onClick={() => setCurrentView('list')} disabled={currentView === 'list'}>Lista</button>
          <button onClick={() => setCurrentView('myday')} disabled={currentView === 'myday'}>Mi Día</button>
          <button onClick={() => setCurrentView('calendar')} disabled={currentView === 'calendar'}>Calendario</button>
          <button onClick={() => setCurrentView('zapier')} disabled={currentView === 'zapier'}>Zapier</button>
        </nav>
        <div className="board-selector">
          {boards.length > 0 && (
            <select onChange={(e) => setCurrentBoardId(e.target.value)} value={currentBoardId || ''} name="boardSelector">
              {boards.map(board => (
                <option key={board.boardId} value={board.boardId}>{board.name}</option>
              ))}
            </select>
          )}
          {currentBoard && (
            <span className={`board-priority ${currentBoard.priority}`}>Prioridad: {currentBoard.priority === 'high' ? 'Alta' : currentBoard.priority === 'low' ? 'Baja' : 'Media'}</span>
          )}
          {currentBoardId && (
            <>
              <button onClick={exportBoard}>Exportar</button>
              <button onClick={triggerImport}>Importar</button>
              <input ref={importInputRef} type="file" accept="application/json" style={{ display:'none' }} onChange={handleImportFile} />
            </>
          )}
          {users.length > 1 && (
            <select onChange={(e) => setSelectedUserId(e.target.value)} value={selectedUserId} name="userSelector">
              {users.map(u => (
                <option key={u.userId} value={u.userId}>{u.name}</option>
              ))}
            </select>
          )}
          <button onClick={() => setIsCreatingBoard(true)}>Crear Tablero</button>
          {currentBoardId && boards.length > 0 && (
            <>
              <button onClick={handleEditBoardClick}>Editar Tablero</button>
              <button onClick={() => setConfirmDeleteBoard({ open: true, boardId: currentBoardId, busy: false })}>Eliminar Tablero</button>
            </>
          )}
        </div>
      </header>
      <main className="App-main">
        {(() => {
          if (boardsLoading) {
            return <p>Cargando tableros...</p>;
          }
          if (boardsError) {
            return <p className="error-message">{boardsError}</p>;
          }
          if (boards.length === 0 && !isCreatingBoard) {
              return <p>No hay tableros. ¡Crea uno para empezar!</p>;
          }

          switch (currentView) {
            case 'home':
              return <HomeDashboard boardId={currentBoardId} onOpenList={openListFromHome} />;
            case 'kanban':
              return currentBoardId ? (
                <KanbanBoard
                  focusListId={focusListId || undefined}
                  onStartFocus={handleStartFocus}
                  onEditCard={handleEditCard}
                  boardId={currentBoardId}
                  users={users}
                  currentUserId={selectedUserId}
                  filters={boardFilters}
                  onChangeFilters={(f) => { setBoardFilters(f); try { localStorage.setItem('kanban.filters', JSON.stringify(f)); } catch {} }}
                />
              ) : (
                <p>Selecciona un tablero.</p>
              );
            case 'myday':
              return <MyDay userId={selectedUserId} users={users} onEditCard={handleEditCard} onStartFocus={handleStartFocus} refreshKey={cardsVersion} />;
            case 'calendar':
              if (cardsLoading) return <LoadingOverlay message="Cargando calendario…" />;
              if (cardsError) return <p className="error-message">{cardsError}</p>;
              const cardsArray = Object.values(cards || {}).flat();
              return <CalendarView cards={cardsArray} />;
            case 'list':
              if (cardsLoading) return <LoadingOverlay message="Cargando lista…" />;
              if (cardsError) return <p className="error-message">{cardsError}</p>;
              const allCards = Object.values(cards || {}).flat();
              return <ListView cards={allCards} onCardClick={handleEditCard} />;
            case 'zapier':
              return <ZapierIntegration />;
            default:
              return currentBoardId ? <KanbanBoard onStartFocus={handleStartFocus} onEditCard={handleEditCard} boardId={currentBoardId} users={users} /> : <p>Selecciona un tablero.</p>;
          }
        })()}
      </main>
      <FocusMode card={focusCard} onClose={handleCloseFocus} />

      <CreateBoardModal
        isOpen={isCreatingBoard}
        onClose={() => setIsCreatingBoard(false)}
        onSubmit={handleCreateBoard}
      />

      <EditBoardModal
        board={editingBoard}
        onClose={() => setEditingBoard(null)}
        onSubmit={handleUpdateBoard}
      />

      <EditCardModal
        isOpen={editingCard !== null}
        card={editingCard}
        users={users}
        onClose={() => setEditingCard(null)}
        onSubmit={handleUpdateCard}
      />

      <FocusWidget onOpen={() => focusCard ? null : setFocusCard(pomodoro.activeCard as Card)} />
      <ToastContainer />

      <ConfirmDialog
        open={confirmDeleteBoard.open}
        title="Eliminar tablero"
        message="Esta acción eliminará el tablero y sus listas/tarjetas. ¿Deseas continuar?"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        busy={confirmDeleteBoard.busy}
        onCancel={() => setConfirmDeleteBoard({ open: false, boardId: null, busy: false })}
        onConfirm={async () => {
          if (!confirmDeleteBoard.boardId) return;
          setConfirmDeleteBoard(prev => ({ ...prev, busy: true }));
          try {
            await handleDeleteBoard(confirmDeleteBoard.boardId);
            setConfirmDeleteBoard({ open: false, boardId: null, busy: false });
            showToast('Tablero eliminado', 'success');
          } catch (e) {
            setConfirmDeleteBoard(prev => ({ ...prev, busy: false }));
            showToast('No se pudo eliminar el tablero', 'error');
          }
        }}
      />
    </div>
  );
}

export default App;
