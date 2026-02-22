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
  const { cards, isLoading, error, handleUpdateCard } = useCards(boardId);
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

  const highPriorityCount = sortedQueue.filter(card => card.priority === 'high').length;

  if (isLoading) return <LoadingOverlay message="Sintonizando frecuencia..." />;
  if (error) return <div className="error-message">{error}</div>;

  // Render variables for current relevant card
  const displayCard = hasActiveCard ? activeCard : heroCard;
  const score = displayCard ? extractScore(displayCard.description) : 0;
  const project = displayCard ? extractProject(displayCard.description) : null;

  // Circular logic
  const circleRadius = 110;
  const circleStroke = 6;
  const circleNormalizedRadius = circleRadius - circleStroke * 2;
  const circleCircumference = circleNormalizedRadius * 2 * Math.PI;
  // Progress goes backwards as time dwindles so offset increases
  const strokeDashoffset = circleCircumference - (progressPercent / 100) * circleCircumference;

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

      {displayCard ? (
        <section
          className="focus-hero"
          onMouseDown={() => handlePressStart(displayCard)}
          onMouseUp={handlePressEnd}
          onMouseLeave={handlePressEnd}
          onTouchStart={() => handlePressStart(displayCard)}
          onTouchEnd={handlePressEnd}
        >
          {score > 0 && (
            <div className="focus-hero__score" title="Score Calculado">
              {score}
            </div>
          )}

          {project ? (
            <span className="focus-hero__project">{project}</span>
          ) : (
            <span className="focus-hero__project focus-hero__project--invisible">PRJ-NONE</span>
          )}

          <h1 className="focus-hero__title">{displayCard.title}</h1>

          {displayCard.description && !hasActiveCard && (
            <div className="focus-hero__description">
              <SmartDescription description={displayCard.description} compact maxLength={240} />
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
              <button className="focus-hero__circle" onClick={(e) => { e.stopPropagation(); onStartFocus(displayCard); }} aria-label="Iniciar enfoque">
                <div className="focus-hero__circle-inner">INICIAR</div>
              </button>
            )}
          </div>

          <div className="focus-hero__meta">
            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="9" x2="15" y2="15"></line><line x1="15" y1="9" x2="9" y2="15"></line></svg> {sortedQueue.length} activas</span>
            {highPriorityCount > 0 && <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg> {highPriorityCount} urgentes</span>}
          </div>

        </section>
      ) : (
        <section className="focus-empty">
          <h2>Todo limpio</h2>
          <p>No hay tareas pendientes. Es un buen momento para planear lo próximo.</p>
        </section>
      )}

      <QueueModal
        isOpen={queueOpen}
        onClose={() => setQueueOpen(false)}
        queue={queueForModal}
        onJumpTo={card => {
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
