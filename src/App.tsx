import React, { useState, useEffect, useMemo } from 'react';
import './App.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import FocusView from './components/FocusView';
import EditCardModal from './components/EditCardModal';
import { useBoards } from './hooks/useBoards';
import { useCards } from './hooks/useSupabaseCards';
import { Card, User } from './types/data';
import logoUrl from '../logo_esencial_w.svg';
import { usePomodoro } from './context/PomodoroContext';
import ToastContainer from './components/ToastContainer';
import { useToast } from './context/ToastContext';
import { api } from './config/http';
import { API_URL } from './config/api';
import { auth } from './config/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';

// Debug logging
console.log('App.tsx: Module loaded');

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
  // Force re-deploy

  // Hooks
  const { currentBoardId } = useBoards(firebaseUser?.uid);
  const { handleUpdateCard: updateCardSupabase, handleDeleteCard: deleteCardSupabase } = useCards(currentBoardId);
  const { start: startPomodoro, isRunning: isPomodoroRunning, setUserId } = usePomodoro();
  const { showToast } = useToast();

  // Users Logic (Simplified for Focus Mode)
  const [allUsers, setAllUsers] = useState<User[]>([]);
  useEffect(() => {
    if (firebaseUser) {
      // Users still fetched from API for now (or could be moved to Supabase later)
      api.get<User[]>(`${API_URL}/users`).then(res => {
        setAllUsers(Array.isArray(res.data) ? res.data : []);
      }).catch(console.error);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser?.uid) {
      setUserId(firebaseUser.uid);
    }
  }, [firebaseUser?.uid, setUserId]);

  const handleStartFocus = (card: Card) => {
    setFocusCard(card);
    void startPomodoro(card).catch(() => {
      showToast('No se pudo iniciar el temporizador', 'error');
    });
  };

  // const handleCloseFocus = () => { setFocusCard(null); }; // Unused

  const handleEditCard = (card: Card) => {
    setEditingCard(card);
  };

  const onUpdateCardSubmit = async (updatedCard: Card) => {
    try {
      // Use Supabase Hook directly
      await updateCardSupabase(updatedCard.id, updatedCard);

      try { window.dispatchEvent(new CustomEvent('card:updated', { detail: updatedCard })); } catch { }
      setEditingCard(null);

      showToast('Tarjeta actualizada', 'success');
    } catch (error: any) {
      console.error("Error updating card:", error);
      showToast(`Error: ${error.message || 'No se pudo actualizar'}`, 'error');
    }
  };

  const onDeleteCardSubmit = async (card: Card) => {
    try {
      await deleteCardSupabase(card.id, card.listId);
      try { window.dispatchEvent(new CustomEvent('card:deleted', { detail: { id: card.id, listId: card.listId } })); } catch { }
      setEditingCard(null);
      if (focusCard && focusCard.id === card.id) {
        setFocusCard(null);
      }
      showToast('Tarjeta eliminada', 'success');
    } catch (error) {
      console.error("Error deleting card:", error);
      showToast('No se pudo eliminar la tarjeta', 'error');
    }
  };

  // Tunnel Mode Effect
  useEffect(() => {
    if (isPomodoroRunning) {
      document.body.classList.add('focus-tunnel');
    } else {
      document.body.classList.remove('focus-tunnel');
    }
  }, [isPomodoroRunning]);

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
        onSubmit={onUpdateCardSubmit}
        onDelete={onDeleteCardSubmit}
      />

      <ToastContainer />
    </div>
  );
}

export default App;
