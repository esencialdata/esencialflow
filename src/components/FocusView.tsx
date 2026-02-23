import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useCards } from '../hooks/useSupabaseCards';
import { Card } from '../types/data';
import { usePomodoro } from '../context/PomodoroContext';
import LoadingOverlay from './LoadingOverlay';
import QueueModal from './QueueModal';
import SmartDescription from './SmartDescription';
import { useToast } from '../context/ToastContext';
import './FocusView.css';

interface FocusViewProps {
  boardId: string | null;
  onStartFocus: (card: Card) => void;
  onEditCard: (card: Card) => void;
}



const isIOSDevice = () => /iPad|iPhone|iPod/i.test(navigator.userAgent);
const isStandalonePWA = () => window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

const FocusView: React.FC<FocusViewProps> = ({ boardId, onStartFocus, onEditCard }) => {
  const { cards, isLoading, error, handleUpdateCard, fetchCards } = useCards(boardId);
  const {
    isRunning,
    activeCard,
    mmss,
    pause,
    stop,
    phase,

    requestPermission,
    setActiveCard,
    focusLen,
    breakLen,
    remainingSec,
    notificationPermission,
    start,
  } = usePomodoro();
  const { showToast } = useToast();
  const requiresIOSInstall = isIOSDevice() && !isStandalonePWA();

  const [queueOpen, setQueueOpen] = useState(false);
  const [sleepProgress, setSleepProgress] = useState(0);
  const [smartInputText, setSmartInputText] = useState("");
  const [isSubmittingSmart, setIsSubmittingSmart] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Long press for editing
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const updateSleepProgress = () => {
      const now = new Date();
      const hardBlock = new Date(now);
      hardBlock.setHours(21, 0, 0, 0); // 21:00 target

      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const totalMs = hardBlock.getTime() - startOfDay.getTime();
      const elapsedMs = now.getTime() - startOfDay.getTime();

      let p = (elapsedMs / totalMs) * 100;
      if (p > 100) p = 100;
      if (p < 0) p = 0;
      setSleepProgress(p);
    };

    updateSleepProgress();
    const interval = setInterval(updateSleepProgress, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const extractScore = (description?: string): number => {
    if (!description) return 0;
    const match = description.match(/Score\s+calculado:\s*([\d.]+)/i);
    return match ? parseFloat(match[1]) : 0;
  };

  const extractProject = (description?: string): string | null => {
    if (!description) return null;
    const match = description.match(/(PRJ-[A-Z0-9]+)/i);
    return match ? match[1].toUpperCase() : null;
  };

  const handlePressStart = (card: Card | null) => {
    if (!card) return;
    longPressTimerRef.current = setTimeout(() => {
      onEditCard(card);
    }, 600); // 600ms long press to edit
  };

  const handlePressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const sortedQueue = useMemo(() => {
    if (!cards) return [];

    const active = Object.values(cards).flat().filter(card => !card.completed && !card.archived);

    return active.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;

      const scoreA = extractScore(a.description);
      const scoreB = extractScore(b.description);
      if (scoreA !== scoreB) return scoreB - scoreA;

      const dueA = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      if (dueA !== dueB) return dueA - dueB;

      const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return createdA - createdB;
    });
  }, [cards]);

  const heroCard = sortedQueue.length > 0 ? sortedQueue[0] : null;
  const hasActiveCard = Boolean(activeCard);

  const queueForModal = useMemo(() => {
    if (activeCard) {
      return sortedQueue.filter(card => card.id !== activeCard.id);
    }
    return sortedQueue.slice(1);
  }, [sortedQueue, activeCard]);

  const phaseTotalSec = (phase === 'focus' ? focusLen : breakLen) * 60;
  const progressPercent = Math.max(0, Math.min(100, ((phaseTotalSec - remainingSec) / phaseTotalSec) * 100));

  useEffect(() => {
    const handlePomodoroNotify = (event: Event) => {
      const customEvent = event as CustomEvent<{ title?: string; body?: string }>;
      const title = customEvent.detail?.title || 'Pomodoro';
      const body = customEvent.detail?.body || 'Se completó una fase.';
      showToast(`${title}: ${body}`, 'info', 5000);
    };

    window.addEventListener('pomodoro:notify', handlePomodoroNotify as EventListener);
    return () => window.removeEventListener('pomodoro:notify', handlePomodoroNotify as EventListener);
  }, [showToast]);

  const handleToggleComplete = async (card: Card) => {
    try {
      await handleUpdateCard(card.id, { completed: !card.completed });
    } catch (err) {
      console.error('Failed to toggle complete', err);
      showToast('No se pudo actualizar el estado de la tarea', 'error');
    }
  };

  const handleSmartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartInputText.trim() || isSubmittingSmart) return;
    setIsSubmittingSmart(true);

    try {
      const edgeFunctionUrl = 'https://vqvfdqtzrnhsfeafwrua.supabase.co/functions/v1/process-task';
      const res = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}` // Ensure anon/service key is sent if JWT auth is enabled in supabase project, currently --no-verify-jwt is active.
        },
        body: JSON.stringify({ input_text: smartInputText })
      });

      if (!res.ok) throw new Error('Error processing with AI');
      const data = await res.json();

      showToast(`Tarea procesada. Score: S/${data.score}${data.sleep_blocked ? ' (Bloqueada por sueño)' : ''}`, 'success');
      setSmartInputText("");

      // Force UI reload immediately since Realtime subscription might delay or be disabled in dashboard
      await fetchCards('global');

    } catch (err) {
      console.error(err);
      showToast('Hubo un error al procesar tu tarea estratégicamente.', 'error');
    } finally {
      setIsSubmittingSmart(false);
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Tu navegador no soporta reconocimiento de voz.', 'error');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES'; // Default checking Spanish
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      showToast('Escuchando instrucción estratégica...', 'info', 2000);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSmartInputText(prev => prev ? `${prev} ${transcript}` : transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
      showToast('Error al capturar audio.', 'error');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleRequestPermission = async () => {
    if (requiresIOSInstall) {
      showToast('En iPhone: comparte esta página y elige “Agregar a pantalla de inicio”. Luego activa notificaciones en esa app.', 'info', 6500);
      return;
    }

    const permission = await requestPermission();

    if (permission === 'granted') {
      showToast('Notificaciones activadas', 'success');
      return;
    }

    if (permission === 'denied') {
      showToast('Las notificaciones están bloqueadas. Habilítalas en tu navegador.', 'error', 4500);
      return;
    }

    if (permission === 'unsupported') {
      showToast('Este navegador no soporta notificaciones del sistema.', 'error');
      return;
    }

    showToast('Permiso de notificaciones pendiente', 'info');
  };

  const handlePrimaryAction = async () => {
    if (isRunning) {
      pause();
      showToast('Sesión pausada', 'info');
      return;
    }

    await start();
    showToast('Sesión en curso', 'success');
  };

  const handleFinishSession = async () => {
    await stop();
    setActiveCard(null);
    showToast('Sesión finalizada', 'info');
  };

  if (isLoading) return <LoadingOverlay message="Sintonizando frecuencia..." />;
  if (error) return <div className="error-message">{error}</div>;

  // Render variables for current relevant card
  const displayCard = hasActiveCard ? activeCard : heroCard;
  const score = displayCard ? extractScore(displayCard.description) : 0;
  const project = displayCard ? extractProject(displayCard.description) : null;

  // Enforce P0 rule for Radical Focus
  const isP0 = score >= 90;

  // If not P0 and not an active running card, heroCard vanishes in favor of "Todo limpio"
  const actualHero = (displayCard && isP0) || hasActiveCard ? displayCard : null;

  // Circular logic
  const circleRadius = 110;
  const circleStroke = 6;
  const circleNormalizedRadius = circleRadius - circleStroke * 2;
  const circleCircumference = circleNormalizedRadius * 2 * Math.PI;
  // Progress goes backwards as time dwindles so offset increases
  const strokeDashoffset = circleCircumference - (progressPercent / 100) * circleCircumference;

  // Sleep Block logic
  const now = new Date();
  const currentHour = now.getHours();
  const isSleepBlock = currentHour >= 21 || currentHour < 5;

  return (
    <div className={`focus-view ${hasActiveCard ? 'focus-view--active' : ''}`}>
      {/* Sleep Bar */}
      <div className="focus-view__sleep-bar">
        <div className="focus-view__sleep-bar-inner" style={{ width: `${sleepProgress}%`, backgroundColor: sleepProgress > 90 ? '#ef4444' : '#3b82f6' }} />
      </div>

      <header className="focus-view__topbar">
        <div className="topbar-actions">
          <button className="icon-btn" onClick={() => setQueueOpen(true)} title={`Cola (${queueForModal.length})`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            <span className="icon-badge">{queueForModal.length}</span>
          </button>

          <button
            className={`icon-btn ${notificationPermission === 'granted' ? 'icon-btn--ok' : ''}`}
            onClick={handleRequestPermission}
            disabled={notificationPermission === 'granted'}
            title="Notificaciones"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          </button>

          {hasActiveCard && (
            <button className="icon-btn icon-btn--danger" onClick={() => void handleFinishSession()} title="Cerrar sesión">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          )}
        </div>
      </header>

      {actualHero && !isSleepBlock ? (
        <section
          className="focus-hero"
          onMouseDown={() => handlePressStart(actualHero)}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressEnd}
          onTouchStart={() => handlePressStart(actualHero)}
          onTouchEnd={handlePressEnd}
        >
          {score > 0 && (
            <div className="focus-hero__score" title="Score Calculado">
              S/{score}
            </div>
          )}

          {project ? (
            <span className="focus-hero__project">{project}</span>
          ) : (
            <span className="focus-hero__project focus-hero__project--invisible">PRJ-NONE</span>
          )}

          <h1 className="focus-hero__title">{actualHero.title}</h1>

          {actualHero.description && !hasActiveCard && (
            <div className="focus-hero__description">
              <SmartDescription description={actualHero.description} compact maxLength={240} />
            </div>
          )}

          {/* Interactive Start/Timer Ring */}
          <div className="focus-hero__ring-container">
            {hasActiveCard ? (
              <div className="focus-hero__ring focus-hero__ring--active" onClick={() => void handlePrimaryAction()}>
                <svg
                  height={circleRadius * 2}
                  width={circleRadius * 2}
                  className="progress-ring"
                >
                  <circle
                    stroke="rgba(255,255,255,0.05)"
                    fill="transparent"
                    strokeWidth={circleStroke}
                    r={circleNormalizedRadius}
                    cx={circleRadius}
                    cy={circleRadius}
                  />
                  <circle
                    stroke={phase === 'focus' ? '#3b82f6' : '#10b981'}
                    fill="transparent"
                    strokeWidth={circleStroke}
                    strokeDasharray={circleCircumference + ' ' + circleCircumference}
                    style={{ strokeDashoffset }}
                    strokeLinecap="round"
                    className="progress-ring__circle"
                    r={circleNormalizedRadius}
                    cx={circleRadius}
                    cy={circleRadius}
                  />
                </svg>
                <div className="ring-content">
                  <div className={`phase-label ${phase}`}>{phase === 'focus' ? 'ENFOQUE' : 'DESCANSO'}</div>
                  <div className="time-display">{mmss}</div>
                  <div className="status-label">{isRunning ? 'Pausar' : 'Reanudar'}</div>
                </div>
              </div>
            ) : (
              <button className="focus-hero__circle" onClick={(e) => { e.stopPropagation(); onStartFocus(actualHero as Card); }} aria-label="Iniciar enfoque">
                <div className="focus-hero__circle-inner">INICIAR</div>
              </button>
            )}
          </div>

          <div className="focus-hero__meta">
            <span>Siguiente en cola: {sortedQueue.length - 1 > 0 ? sortedQueue.length - 1 : 0}</span>
            <span>Urgencia: {actualHero?.priority === 'high' ? 'Crítica' : actualHero?.priority === 'medium' ? 'Alta' : 'Normal'}</span>
            <button className="focus-hero__edit-discreet" onClick={() => onEditCard(actualHero as Card)} title="Editar tarea">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          </div>

        </section>
      ) : isSleepBlock ? (
        <section className="focus-empty">
          <h2>Bloque de Sueño Activo</h2>
          <p>La ejecución radical está bloqueada (21:00 - 05:00). Desconecta y recarga energía.</p>
        </section>
      ) : (
        <section className="focus-empty">
          <h2>Todo limpio</h2>
          <p>No hay tareas P0 (Score &gt;= 90). Refina tus prioridades o planifica la estrategia global.</p>
        </section>
      )}

      {/* Smart Input (Always visible at bottom) */}
      <form className="focus-smart-input-container" onSubmit={handleSmartSubmit}>
        <button
          type="button"
          className={`focus-smart-voice-btn ${isListening ? 'listening' : ''}`}
          onClick={startVoiceInput}
          disabled={isSubmittingSmart}
          title="Dictar tarea estratégicamente"
        >
          {isListening ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><rect x="9" y="9" width="6" height="6"></rect></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          )}
        </button>

        <input
          type="text"
          className="focus-smart-input"
          placeholder="¿Qué tienes en mente? (Gemini lo evaluará...)"
          value={smartInputText}
          onChange={(e) => setSmartInputText(e.target.value)}
          disabled={isSubmittingSmart}
        />

        <button type="submit" className="focus-smart-btn" disabled={!smartInputText.trim() || isSubmittingSmart}>
          {isSubmittingSmart ? '...' : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>}
        </button>
      </form>

      {/* Queue Modal */}
      <QueueModal
        isOpen={queueOpen}
        onClose={() => setQueueOpen(false)}
        queue={queueForModal}
        onJumpTo={(card: Card) => {
          onStartFocus(card);
          setQueueOpen(false);
        }}
        onToggleComplete={handleToggleComplete}
        onEdit={onEditCard}
      />
    </div>
  );
};

export default FocusView;
