import React, { useEffect, useMemo, useState } from 'react';
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

const PRESETS = [
  { focus: 25, break: 5, label: '25/5' },
  { focus: 50, break: 10, label: '50/10' },
  { focus: 90, break: 15, label: '90/15' },
];

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
    setPreset,
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

  const extractScore = (description?: string): number => {
    if (!description) return 0;
    const match = description.match(/Score\s+calculado:\s*([\d.]+)/i);
    return match ? parseFloat(match[1]) : 0;
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
  const primaryActionLabel = isRunning
    ? 'Pausar'
    : remainingSec < phaseTotalSec
      ? 'Reanudar'
      : 'Iniciar';

  const phaseLabel = phase === 'focus' ? 'Enfoque' : 'Descanso';

  const notificationLabel = requiresIOSInstall
    ? 'iPhone: agregar a inicio'
    : notificationPermission === 'granted'
      ? 'Notificaciones activas'
      : notificationPermission === 'denied'
        ? 'Notificaciones bloqueadas'
        : notificationPermission === 'unsupported'
          ? 'No soportado por navegador'
          : 'Activar notificaciones';

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

  return (
    <div className={`focus-view ${hasActiveCard ? 'focus-view--active' : ''}`}>
      <div className="focus-view__ambient" />

      <header className="focus-view__topbar">
        <button className="focus-chip" onClick={() => setQueueOpen(true)}>
          Cola ({queueForModal.length})
        </button>
        {hasActiveCard && (
          <button className="focus-chip focus-chip--ghost" onClick={() => void handleFinishSession()}>
            Cerrar sesión
          </button>
        )}
        <button
          className={`focus-chip ${notificationPermission === 'granted' ? 'focus-chip--ok' : ''}`}
          onClick={handleRequestPermission}
          disabled={notificationPermission === 'granted'}
        >
          {notificationLabel}
        </button>
      </header>

      {hasActiveCard ? (
        <section className="focus-session">
          <span className={`focus-session__phase ${phase === 'focus' ? 'focus' : 'break'}`}>
            {phaseLabel}
          </span>

          <h1 className="focus-session__time">{mmss}</h1>

          <div className="focus-session__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
            <span style={{ width: `${progressPercent}%` }} />
          </div>

          <h2 className="focus-session__title">{activeCard?.title}</h2>

          {activeCard?.description && (
            <div className="focus-session__description">
              <SmartDescription description={activeCard.description} compact maxLength={180} />
            </div>
          )}

          <div className="focus-session__meta">
            <span>{isRunning ? 'Sesión en curso' : 'Sesión en pausa'}</span>
            <span>{focusLen}m / {breakLen}m</span>
          </div>

          <div className="focus-session__presets" aria-label="Duración">
            {PRESETS.map(preset => {
              const isSelected = preset.focus === focusLen && preset.break === breakLen;
              return (
                <button
                  key={preset.label}
                  className={`preset-button ${isSelected ? 'preset-button--active' : ''}`}
                  onClick={() => setPreset(preset.focus, preset.break)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="focus-session__actions">
            <button className="focus-action focus-action--primary" onClick={() => void handlePrimaryAction()}>
              {primaryActionLabel}
            </button>
            <button className="focus-action focus-action--danger" onClick={() => void handleFinishSession()}>
              Terminar
            </button>
            <button className="focus-action" onClick={() => activeCard && onEditCard(activeCard)}>
              Editar tarea
            </button>
          </div>
        </section>
      ) : heroCard ? (
        <section className="focus-hero">
          <span className="focus-hero__kicker">Siguiente tarea esencial</span>
          <h1 className="focus-hero__title">{heroCard.title}</h1>

          {heroCard.description && (
            <div className="focus-hero__description">
              <SmartDescription description={heroCard.description} compact maxLength={240} />
            </div>
          )}

          <div className="focus-hero__meta">
            <span>{sortedQueue.length} tareas activas</span>
            <span>{highPriorityCount} prioridad alta</span>
            {heroCard.dueDate && <span>Vence {new Date(heroCard.dueDate).toLocaleDateString()}</span>}
          </div>

          <div className="focus-hero__actions">
            <button className="focus-action focus-action--primary" onClick={() => onStartFocus(heroCard)}>
              Iniciar enfoque
            </button>
            <button className="focus-action" onClick={() => onEditCard(heroCard)}>
              Editar
            </button>
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
