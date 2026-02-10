import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import FocusView from './components/FocusView';
import EditCardModal from './components/EditCardModal';
import { useBoards } from './hooks/useBoards';
import { useCards } from './hooks/useCards';
import { Card, User } from './types/data';
import logoUrl from '../logo_esencial_w.svg';
import FocusWidget from './components/FocusWidget';
import { usePomodoro } from './context/PomodoroContext';
import ToastContainer from './components/ToastContainer';
import { useToast } from './context/ToastContext';
import { api } from './config/http';
import { API_URL } from './config/api';
import { auth } from './config/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { generateColorFromId, getUserInitials } from './utils/user';

function App() {
  const [authStateChecked, setAuthStateChecked] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  // Authentication Side Effect
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

  // State
  const [focusCard, setFocusCard] = useState<Card | null>(null);
  const [editingCard, setEditingCard] = useState<Card | null>(null);

  // Hooks
  const { currentBoardId } = useBoards(firebaseUser?.uid);
  const { fetchCards: reloadCards } = useCards(currentBoardId);
  const pomodoro = usePomodoro();
  const { showToast } = useToast();

  // Users Logic (Simplified for Focus Mode)
  const [allUsers, setAllUsers] = useState<User[]>([]);
  useEffect(() => {
    if (firebaseUser) {
      api.get<User[]>(`${API_URL}/users`).then(res => {
        setAllUsers(Array.isArray(res.data) ? res.data : []);
      }).catch(console.error);
    }
  }, [firebaseUser]);

  const handleStartFocus = (card: Card) => {
    setFocusCard(card);
    try { pomodoro.setActiveCard(card); } catch { }
  };

  // const handleCloseFocus = () => { setFocusCard(null); }; // Unused

  const handleEditCard = (card: Card) => {
    setEditingCard(card);
  };

  const handleUpdateCard = async (updatedCard: Card) => {
    try {
      await api.put(`${API_URL}/cards/${updatedCard.id}`, updatedCard);
      try { window.dispatchEvent(new CustomEvent('card:updated', { detail: updatedCard })); } catch { }
      setEditingCard(null);
      if (currentBoardId) {
        reloadCards(currentBoardId);
      }
      showToast('Tarjeta actualizada', 'success');
    } catch (error) {
      console.error("Error updating card:", error);
      showToast('No se pudo actualizar la tarjeta', 'error');
    }
  };


  // Tunnel Mode Effect
  useEffect(() => {
    if (pomodoro.isRunning) {
      document.body.classList.add('focus-tunnel');
    } else {
      document.body.classList.remove('focus-tunnel');
    }
  }, [pomodoro.isRunning]);

  // Auth Guard
  const isAuthenticated = useMemo(() => authStateChecked && !!firebaseUser, [authStateChecked, firebaseUser]);

  if (!isAuthenticated) {
    if (!authStateChecked) {
      return (
        <div className="App" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#f1f5f9' }}>
          Cargando…
        </div>
      );
    }
    // Login Screen
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
      <main className="App-main" style={{ padding: 0, margin: 0 }}>
        {/* Radical Focus: Only FocusView */}
        <FocusView
          boardId={currentBoardId}
          onStartFocus={handleStartFocus}
          onEditCard={handleEditCard}
        />
      </main>

      {/* Legacy Logic preserved for now (Modals) */}
      <EditCardModal
        isOpen={editingCard !== null}
        card={editingCard}
        users={allUsers}
        onClose={() => setEditingCard(null)}
        onSubmit={handleUpdateCard}
      />

      <FocusWidget onOpen={() => focusCard ? null : setFocusCard(pomodoro.activeCard as Card)} />
      <ToastContainer />
    </div>
  );
}

export default App;
