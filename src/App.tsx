import React, { useState, useEffect, useMemo } from 'react';
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
import N8nIntegration from './components/N8nIntegration';
import CalendarView from './components/CalendarView';
import ListView from './components/ListView';
import { Card, User } from './types/data';
import logoUrl from '../logo_esencial_w.svg';
import FocusWidget from './components/FocusWidget';
import { usePomodoro } from './context/PomodoroContext';
import ToastContainer from './components/ToastContainer';
import { useToast } from './context/ToastContext';
import ConfirmDialog from './components/ConfirmDialog';
import LoadingOverlay from './components/LoadingOverlay';
import { API_URL } from './config/api';
import { api } from './config/http';
import { auth } from './config/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { generateColorFromId, getUserInitials } from './utils/user';

type View = 'home' | 'kanban' | 'myday' | 'n8n' | 'calendar' | 'list';

function App() {
  const [authStateChecked, setAuthStateChecked] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setFirebaseUser(user);
      setAuthStateChecked(true);
    });
    return () => unsub();
  }, []);

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setLoginBusy(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch (error: any) {
      console.error('No se pudo iniciar sesión:', error);
      const message = error?.code === 'auth/invalid-credential'
        ? 'Correo o contraseña incorrectos'
        : error?.message || 'No se pudo iniciar sesión';
      setLoginError(message);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('No se pudo cerrar sesión:', error);
    }
  };

  const [focusCard, setFocusCard] = useState<Card | null>(null);
  const [currentView, setCurrentView] = useState<View>('home');
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [visibleUsers, setVisibleUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [cardsVersion, setCardsVersion] = useState(0);
  const [focusListId, setFocusListId] = useState<string | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const boardMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!boardMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (boardMenuRef.current && !boardMenuRef.current.contains(event.target as Node)) {
        setBoardMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [boardMenuOpen]);

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
  } = useBoards(firebaseUser?.uid);

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

  const resolveCurrentUser = (): User => {
    const uid = firebaseUser?.uid?.trim();
    const displayName = firebaseUser?.displayName?.trim();
    const email = firebaseUser?.email?.trim();
    return {
      userId: uid || fallbackUsers[0].userId,
      name: displayName || email || fallbackUsers[0].name,
      email: email || fallbackUsers[0].email,
    };
  };

  const applyUsers = (list: User[]) => {
    const normalized = Array.isArray(list)
      ? list
        .map(user => {
          const userId = typeof user.userId === 'string' ? user.userId.trim() : '';
          if (!userId) return null;
          return { ...user, userId } as User;
        })
        .filter((candidate): candidate is User => Boolean(candidate))
      : [];

    const uid = firebaseUser?.uid?.trim();
    const email = firebaseUser?.email?.trim().toLowerCase();

    const matchById = uid ? normalized.find(user => user.userId === uid) : undefined;
    const matchByEmail = email
      ? normalized.find(user => typeof user.email === 'string' && user.email.trim().toLowerCase() === email)
      : undefined;

    const resolved = matchById || matchByEmail || resolveCurrentUser();
    const reference = resolveCurrentUser();
    const resolvedUser: User = {
      ...resolved,
      userId: (resolved.userId || reference.userId).trim(),
      name: resolved.name || reference.name,
      email: resolved.email || reference.email,
    };

    const uniqueUsers = [...normalized];
    if (!uniqueUsers.some(user => user.userId === resolvedUser.userId)) {
      uniqueUsers.push(resolvedUser);
    }

    setAllUsers(uniqueUsers);
    setSelectedUserId(prev => {
      if (prev && uniqueUsers.some(user => user.userId === prev)) {
        return prev;
      }
      return resolvedUser.userId;
    });
  };

  const resolvedUserProfile = useMemo(() => resolveCurrentUser(), [firebaseUser]);
  const effectiveUserId = selectedUserId || resolvedUserProfile.userId;

  useEffect(() => {
    if (!selectedUserId && resolvedUserProfile.userId) {
      setSelectedUserId(resolvedUserProfile.userId);
    }
  }, [selectedUserId, resolvedUserProfile.userId]);

  useEffect(() => {
    if (firebaseUser) {
      fetchUsers();
    } else {
      setAllUsers([]);
      setVisibleUsers([]);
    }
  }, [firebaseUser]);

  useEffect(() => {
    const ensureSelection = (list: User[]) => {
      if (!list.length) return;
      setSelectedUserId(prev => {
        if (prev && list.some(user => user.userId === prev)) {
          return prev;
        }
        return list[0]?.userId || '';
      });
    };

    const currentBoard = boards.find(board => board.boardId === currentBoardId);
    if (!currentBoard) {
      const fallback = allUsers.length ? allUsers : resolvedUserProfile.userId ? [resolvedUserProfile] : [];
      setVisibleUsers(fallback);
      ensureSelection(fallback);
      return;
    }

    const allowedIds = new Set<string>();
    if (typeof currentBoard.ownerId === 'string' && currentBoard.ownerId.trim()) {
      allowedIds.add(currentBoard.ownerId.trim());
    }
    if (Array.isArray(currentBoard.memberIds)) {
      currentBoard.memberIds.forEach(id => {
        if (typeof id === 'string' && id.trim()) {
          allowedIds.add(id.trim());
        }
      });
    }
    if (resolvedUserProfile.userId) {
      allowedIds.add(resolvedUserProfile.userId);
    }

    const filtered = allUsers.filter(user => allowedIds.has(user.userId));
    const finalList = filtered.length
      ? filtered
      : allUsers.length
        ? allUsers
        : resolvedUserProfile.userId
          ? [resolvedUserProfile]
          : [];

    setVisibleUsers(finalList);
    ensureSelection(finalList);
  }, [allUsers, boards, currentBoardId, resolvedUserProfile]);

  useEffect(() => {
    if (effectiveUserId) {
      pomodoro.setUserId(effectiveUserId);
    }
  }, [effectiveUserId, pomodoro]);

  const fetchUsers = async () => {
    try {
      const res = await api.get<User[]>(`${API_URL}/users`);
      applyUsers(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error fetching users:", error);
      applyUsers([]);
    }
  };

  const handleStartFocus = (card: Card) => {
    setFocusCard(card);
    try { pomodoro.setActiveCard(card); } catch { }
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
      const res = await api.get(`${API_URL}/boards/${currentBoardId}/export`);
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
      const res = await api.post(`${API_URL}/boards/import`, json);
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
    } catch { }
  };

  const handleUpdateCard = async (updatedCard: Card) => {
    try {
      if (!updatedCard.assignedToUserId && visibleUsers.length === 1) {
        updatedCard.assignedToUserId = visibleUsers[0].userId;
      }
      await api.put(`${API_URL}/cards/${updatedCard.id}`, updatedCard);
      try { window.dispatchEvent(new CustomEvent('card:updated', { detail: updatedCard })); } catch { }
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

  const isAuthenticated = useMemo(() => authStateChecked && !!firebaseUser, [authStateChecked, firebaseUser]);
  const userAvatarInitials = useMemo(() => {
    return getUserInitials(firebaseUser?.displayName, firebaseUser?.email);
  }, [firebaseUser?.displayName, firebaseUser?.email]);

  const userAvatarColor = useMemo(() => {
    const seed = firebaseUser?.uid || firebaseUser?.email || 'esencial-user';
    return generateColorFromId(seed);
  }, [firebaseUser?.uid, firebaseUser?.email]);

  const userAvatarTitle = firebaseUser?.displayName || firebaseUser?.email || 'Usuario';
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (!userMenuRef.current) {
        return;
      }
      if (!userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  if (!isAuthenticated) {
    if (!authStateChecked) {
      return (
        <div className="App" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#f1f5f9' }}>
          Cargando…
        </div>
      );
    }

    return (
      <div className="App" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117' }}>
        <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: 'min(360px, 90vw)', padding: '32px', background: '#111826', borderRadius: '12px', boxShadow: '0 12px 32px rgba(0,0,0,0.35)', textAlign: 'center' }}>
          <img src={logoUrl} alt="Esencial Flow" style={{ maxWidth: '160px', alignSelf: 'center' }} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#f4f4f5', fontSize: '0.95rem' }}>
            Correo electrónico
            <input
              type="email"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="tu@correo.com"
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #1f2937', background: '#0f172a', color: '#f8fafc' }}
              autoFocus
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#f4f4f5', fontSize: '0.95rem' }}>
            Contraseña
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Ingresa tu contraseña"
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #1f2937', background: '#0f172a', color: '#f8fafc' }}
            />
          </label>
          {loginError ? <span style={{ color: '#f87171', fontSize: '0.85rem' }}>{loginError}</span> : null}
          <button type="submit" style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#1a73e8', color: '#f8fafc', fontWeight: 600, cursor: 'pointer' }} disabled={loginBusy}>
            {loginBusy ? 'Ingresando…' : 'Acceder'}
          </button>
        </form>
      </div>
    );
  }

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
          <button onClick={() => setCurrentView('n8n')} disabled={currentView === 'n8n'}>n8n</button>
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

          <div className="board-menu-container" ref={boardMenuRef}>
            <button className="icon-btn board-menu-trigger" onClick={() => setBoardMenuOpen(!boardMenuOpen)} title="Opciones del tablero">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
            {boardMenuOpen && (
              <div className="board-menu-dropdown">
                {currentBoardId && (
                  <>
                    <button onClick={() => { setBoardMenuOpen(false); exportBoard(); }}>Exportar Tablero</button>
                    <button onClick={() => { setBoardMenuOpen(false); triggerImport(); }}>Importar Tablero</button>
                    <hr className="menu-divider" />
                  </>
                )}
                <button onClick={() => { setBoardMenuOpen(false); setIsCreatingBoard(true); }}>Crear Nuevo Tablero</button>
                {currentBoardId && boards.length > 0 && (
                  <>
                    <button onClick={() => { setBoardMenuOpen(false); handleEditBoardClick(); }}>Editar Actual</button>
                    <button onClick={() => { setBoardMenuOpen(false); setConfirmDeleteBoard({ open: true, boardId: currentBoardId, busy: false }); }}>Eliminar Actual</button>
                  </>
                )}
              </div>
            )}
            <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
          </div>

          {visibleUsers.length > 1 && (
            <select onChange={(e) => setSelectedUserId(e.target.value)} value={selectedUserId} name="userSelector">
              {visibleUsers.map(u => (
                <option key={u.userId} value={u.userId}>{u.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="user-menu" ref={userMenuRef}>
          <button
            type="button"
            className="user-avatar-button"
            onClick={() => setUserMenuOpen(prev => !prev)}
            aria-haspopup="true"
            aria-expanded={userMenuOpen}
            title={userAvatarTitle}
          >
            <div className="user-avatar" style={{ backgroundColor: userAvatarColor }}>
              {firebaseUser?.photoURL ? (
                <img src={firebaseUser.photoURL} alt={userAvatarTitle} />
              ) : (
                userAvatarInitials
              )}
            </div>
          </button>
          {userMenuOpen && (
            <div className="user-menu-dropdown">
              <button type="button" onClick={() => { setUserMenuOpen(false); handleLogout(); }}>
                Salir
              </button>
            </div>
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
                  users={visibleUsers}
                  currentUserId={effectiveUserId}
                  filters={boardFilters}
                  onChangeFilters={(f) => { setBoardFilters(f); try { localStorage.setItem('kanban.filters', JSON.stringify(f)); } catch { } }}
                />
              ) : (
                <p>Selecciona un tablero.</p>
              );
            case 'myday':
              return <MyDay userId={effectiveUserId} users={visibleUsers} onEditCard={handleEditCard} onStartFocus={handleStartFocus} refreshKey={cardsVersion} />;
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
            case 'n8n':
              return <N8nIntegration />;
            default:
              return currentBoardId ? <KanbanBoard onStartFocus={handleStartFocus} onEditCard={handleEditCard} boardId={currentBoardId} users={visibleUsers} /> : <p>Selecciona un tablero.</p>;
          }
        })()}
      </main>
      <FocusMode card={focusCard} onClose={handleCloseFocus} />

      <CreateBoardModal
        isOpen={isCreatingBoard}
        onClose={() => setIsCreatingBoard(false)}
        currentUserId={firebaseUser?.uid ?? ''}
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
        users={visibleUsers}
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
