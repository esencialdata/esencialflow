import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../types/data';
import { API_URL } from '../config/api';
import { api } from '../config/http';

type Phase = 'focus' | 'break';
type BrowserPermission = NotificationPermission | 'unsupported';

interface PomodoroContextValue {
  activeCard: Card | null;
  isRunning: boolean;
  remainingSec: number;
  phase: Phase;
  focusLen: number;
  breakLen: number;
  mmss: string;
  notificationPermission: BrowserPermission;
  // actions
  setActiveCard: (card: Card | null) => void;
  setUserId: (userId: string) => void;
  start: (card?: Card) => Promise<void>;
  pause: () => void;
  stop: () => Promise<void>;
  setPreset: (focus: number, brk: number) => void;
  requestPermission: () => Promise<BrowserPermission>;
}

interface PersistedPomodoroState {
  activeCard: Card | null;
  userId: string;
  phase: Phase;
  sessionId: string | null;
  isRunning: boolean;
  targetEndTime: number | null;
  focusLen: number;
  breakLen: number;
  remainingSec: number;
  savedAt: number;
}

const PomodoroContext = createContext<PomodoroContextValue | undefined>(undefined);

const getInitialPermission = (): BrowserPermission => {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
};

export const PomodoroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const defaultFocus = 25;
  const defaultBreak = 5;
  const STORAGE_KEY = 'pomodoro_state';

  const workerRef = useRef<Worker | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const phaseCompleteLockRef = useRef(false);

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(defaultFocus * 60);
  const [phase, setPhase] = useState<Phase>('focus');
  const [focusLen, setFocusLen] = useState<number>(defaultFocus);
  const [breakLen, setBreakLen] = useState<number>(defaultBreak);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('user-1');
  const [notificationPermission, setNotificationPermission] = useState<BrowserPermission>(getInitialPermission);

  const saveState = useCallback((state: Omit<PersistedPomodoroState, 'savedAt'>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        savedAt: Date.now(),
      }));
    } catch {
      // Ignore persistence errors.
    }
  }, []);

  const clearState = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore persistence errors.
    }
  }, []);

  const stateRef = useRef({ isRunning, phase, sessionId, focusLen, breakLen, activeCard, userId, remainingSec });
  stateRef.current = { isRunning, phase, sessionId, focusLen, breakLen, activeCard, userId, remainingSec };

  const mmss = useMemo(() => {
    const m = Math.floor(remainingSec / 60).toString().padStart(2, '0');
    const s = Math.floor(remainingSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [remainingSec]);

  const ensureNotifyPermission = useCallback(async (): Promise<BrowserPermission> => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }

    try {
      let nextPermission = Notification.permission;
      if (nextPermission === 'default') {
        nextPermission = await Notification.requestPermission();
      }
      setNotificationPermission(nextPermission);
      return nextPermission;
    } catch {
      setNotificationPermission(Notification.permission);
      return Notification.permission;
    }
  }, []);

  const unlockAudio = useCallback(async (): Promise<AudioContext | null> => {
    if (typeof window === 'undefined') return null;

    const WebAudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!WebAudioContext) return null;

    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new WebAudioContext();
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  const playBeep = useCallback(async () => {
    const ctx = await unlockAudio();
    if (!ctx) return;

    try {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 660;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.7);
    } catch {
      // Ignore audio errors.
    }
  }, [unlockAudio]);

  const notify = useCallback(async (title: string, body: string) => {
    const permission = await ensureNotifyPermission();

    if (permission === 'granted') {
      let shown = false;
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (registration?.showNotification) {
          await registration.showNotification(title, {
            body,
            tag: 'pomodoro-phase-notification',
          });
          shown = true;
        }
      } catch {
        // Fall through to Notification API.
      }

      if (!shown) {
        try {
          new Notification(title, { body });
          shown = true;
        } catch {
          // Ignore errors.
        }
      }

      if (!shown) {
        document.title = `⏰ ${title}`;
      }
    } else {
      document.title = `⏰ ${title}`;
    }

    await playBeep();
  }, [ensureNotifyPermission, playBeep]);

  const handlePhaseComplete = useCallback(async () => {
    if (phaseCompleteLockRef.current) return;
    phaseCompleteLockRef.current = true;

    try {
      const { phase: currentPhase, sessionId: currentSessionId, focusLen: currentFocusLen, breakLen: currentBreakLen, activeCard: currentCard, userId: currentUserId } = stateRef.current;

      setIsRunning(false);
      workerRef.current?.postMessage({ command: 'stop' });

      if (currentPhase === 'focus') {
        if (currentSessionId) {
          try {
            await api.patch(`${API_URL}/timer-sessions/${currentSessionId}`, { durationMinutes: currentFocusLen });
            if (currentCard) {
              await api.patch(`${API_URL}/cards/${currentCard.id}`, { incrementActualTime: currentFocusLen });
            }
          } catch (error) {
            console.error('Failed to complete timer session', error);
          } finally {
            setSessionId(null);
          }
        }

        const nextRemaining = currentBreakLen * 60;
        await notify('Focus terminado', 'Buen trabajo. Toma un descanso.');
        setPhase('break');
        setRemainingSec(nextRemaining);
        saveState({
          activeCard: currentCard,
          userId: currentUserId,
          phase: 'break',
          sessionId: null,
          isRunning: false,
          targetEndTime: null,
          focusLen: currentFocusLen,
          breakLen: currentBreakLen,
          remainingSec: nextRemaining,
        });
      } else {
        if (currentSessionId) {
          try {
            await api.patch(`${API_URL}/timer-sessions/${currentSessionId}`, { durationMinutes: currentBreakLen });
          } catch (error) {
            console.error('Failed to complete break session', error);
          } finally {
            setSessionId(null);
          }
        }

        const nextRemaining = currentFocusLen * 60;
        await notify('Descanso terminado', 'Volvamos al enfoque.');
        setPhase('focus');
        setRemainingSec(nextRemaining);
        saveState({
          activeCard: currentCard,
          userId: currentUserId,
          phase: 'focus',
          sessionId: null,
          isRunning: false,
          targetEndTime: null,
          focusLen: currentFocusLen,
          breakLen: currentBreakLen,
          remainingSec: nextRemaining,
        });
      }
    } finally {
      phaseCompleteLockRef.current = false;
    }
  }, [notify, saveState]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const saved = JSON.parse(raw) as Partial<PersistedPomodoroState>;
      const savedFocusLen = typeof saved.focusLen === 'number' ? saved.focusLen : defaultFocus;
      const savedBreakLen = typeof saved.breakLen === 'number' ? saved.breakLen : defaultBreak;
      const savedPhase: Phase = saved.phase === 'break' ? 'break' : 'focus';

      setActiveCard(saved.activeCard ?? null);
      if (saved.userId) setUserId(saved.userId);
      setPhase(savedPhase);
      setSessionId(saved.sessionId ?? null);
      setFocusLen(savedFocusLen);
      setBreakLen(savedBreakLen);

      if (saved.isRunning && saved.targetEndTime) {
        const diff = Math.max(0, Math.ceil((saved.targetEndTime - Date.now()) / 1000));
        if (diff > 0) {
          setRemainingSec(diff);
          setIsRunning(true);
          setTimeout(() => {
            workerRef.current?.postMessage({
              command: 'start',
              seconds: diff,
              endTime: saved.targetEndTime,
            });
          }, 250);
          return;
        }
      }

      const fallbackRemaining = typeof saved.remainingSec === 'number' && saved.remainingSec > 0
        ? saved.remainingSec
        : (savedPhase === 'focus' ? savedFocusLen : savedBreakLen) * 60;

      setRemainingSec(fallbackRemaining);
      setIsRunning(false);
    } catch (error) {
      console.error('Failed to rehydrate pomodoro state', error);
      clearState();
    }
  }, [clearState]);

  useEffect(() => {
    const worker = new Worker('/pomodoro-worker.js');
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent) => {
      const { type, remainingSeconds } = event.data;
      if (type === 'tick') {
        setRemainingSec(Math.max(0, Number(remainingSeconds) || 0));
      } else if (type === 'done') {
        void handlePhaseComplete();
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      console.error('[PomodoroContext] Worker error', event);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [handlePhaseComplete]);

  useEffect(() => {
    const syncPermission = () => {
      if (typeof Notification === 'undefined') {
        setNotificationPermission('unsupported');
        return;
      }
      setNotificationPermission(Notification.permission);
    };

    syncPermission();
    window.addEventListener('focus', syncPermission);
    return () => window.removeEventListener('focus', syncPermission);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const saved = JSON.parse(raw) as Partial<PersistedPomodoroState>;
        if (!saved.isRunning || !saved.targetEndTime) return;

        const diff = Math.max(0, Math.ceil((saved.targetEndTime - Date.now()) / 1000));
        if (diff > 0) {
          setRemainingSec(diff);
          workerRef.current?.postMessage({
            command: 'start',
            seconds: diff,
            endTime: saved.targetEndTime,
          });
          return;
        }

        void handlePhaseComplete();
      } catch {
        // Ignore visibility sync errors.
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handlePhaseComplete]);

  const start = async (card?: Card) => {
    if (card) {
      setActiveCard(card);
      stateRef.current.activeCard = card;
    }

    const {
      activeCard: currentCard,
      isRunning: currentlyRunning,
      userId: currentUserId,
      phase: currentPhase,
      focusLen: currentFocusLen,
      breakLen: currentBreakLen,
      remainingSec: currentRemainingSec,
      sessionId: currentSessionId,
    } = stateRef.current;

    if (!currentCard || currentlyRunning) return;

    await unlockAudio();
    void ensureNotifyPermission();

    setIsRunning(true);

    const phaseSeconds = (currentPhase === 'focus' ? currentFocusLen : currentBreakLen) * 60;
    const nextSeconds = currentRemainingSec > 0 ? currentRemainingSec : phaseSeconds;
    const targetEndTime = Date.now() + (nextSeconds * 1000);

    setRemainingSec(nextSeconds);

    saveState({
      activeCard: currentCard,
      userId: currentUserId,
      phase: currentPhase,
      sessionId: currentSessionId,
      isRunning: true,
      targetEndTime,
      focusLen: currentFocusLen,
      breakLen: currentBreakLen,
      remainingSec: nextSeconds,
    });

    workerRef.current?.postMessage({
      command: 'start',
      seconds: nextSeconds,
      endTime: targetEndTime,
    });

    if (!currentSessionId) {
      try {
        const response = await api.post(`${API_URL}/timer-sessions`, {
          cardId: currentCard.id,
          userId: currentUserId,
          type: currentPhase,
        });

        const id = response.data?.id ?? response.data?.sessionId ?? null;
        if (id) {
          setSessionId(id);
          saveState({
            activeCard: currentCard,
            userId: currentUserId,
            phase: currentPhase,
            sessionId: id,
            isRunning: true,
            targetEndTime,
            focusLen: currentFocusLen,
            breakLen: currentBreakLen,
            remainingSec: nextSeconds,
          });
        }
      } catch (error) {
        console.error('Failed to create timer session', error);
      }
    }
  };

  const pause = () => {
    const {
      activeCard: currentCard,
      userId: currentUserId,
      phase: currentPhase,
      focusLen: currentFocusLen,
      breakLen: currentBreakLen,
      remainingSec: currentRemainingSec,
      sessionId: currentSessionId,
    } = stateRef.current;

    setIsRunning(false);
    workerRef.current?.postMessage({ command: 'pause' });

    saveState({
      activeCard: currentCard,
      userId: currentUserId,
      phase: currentPhase,
      sessionId: currentSessionId,
      isRunning: false,
      targetEndTime: null,
      focusLen: currentFocusLen,
      breakLen: currentBreakLen,
      remainingSec: currentRemainingSec,
    });
  };

  const stop = async () => {
    const {
      phase: currentPhase,
      focusLen: currentFocusLen,
      breakLen: currentBreakLen,
      sessionId: currentSessionId,
      activeCard: currentCard,
      remainingSec: currentRemainingSec,
    } = stateRef.current;

    setIsRunning(false);
    workerRef.current?.postMessage({ command: 'stop' });
    clearState();

    const totalSeconds = (currentPhase === 'focus' ? currentFocusLen : currentBreakLen) * 60;
    if (currentSessionId) {
      try {
        const elapsedMinutes = Math.max(0, Math.round(((totalSeconds - currentRemainingSec) / 60) * 10) / 10);
        await api.patch(`${API_URL}/timer-sessions/${currentSessionId}`, { durationMinutes: elapsedMinutes });

        if (currentCard && elapsedMinutes > 0 && currentPhase === 'focus') {
          await api.patch(`${API_URL}/cards/${currentCard.id}`, { incrementActualTime: elapsedMinutes });
        }
      } catch (error) {
        console.error('Failed to end timer session', error);
      } finally {
        setSessionId(null);
      }
    }

    setRemainingSec(totalSeconds);
  };

  const setPreset = (nextFocusLen: number, nextBreakLen: number) => {
    const {
      phase: currentPhase,
      focusLen: currentFocusLen,
      breakLen: currentBreakLen,
      sessionId: currentSessionId,
      activeCard: currentCard,
      remainingSec: currentRemainingSec,
      userId: currentUserId,
    } = stateRef.current;

    const currentTotal = (currentPhase === 'focus' ? currentFocusLen : currentBreakLen) * 60;
    const elapsedMinutes = Math.max(0, Math.round(((currentTotal - currentRemainingSec) / 60) * 10) / 10);

    if (currentSessionId && elapsedMinutes > 0) {
      (async () => {
        try {
          await api.patch(`${API_URL}/timer-sessions/${currentSessionId}`, { durationMinutes: elapsedMinutes });
          if (currentCard && currentPhase === 'focus') {
            await api.patch(`${API_URL}/cards/${currentCard.id}`, { incrementActualTime: elapsedMinutes });
          }
        } catch (error) {
          console.error('Failed to persist timer session before preset switch', error);
        }
      })();
    }

    setIsRunning(false);
    workerRef.current?.postMessage({ command: 'stop' });
    setSessionId(null);
    setFocusLen(nextFocusLen);
    setBreakLen(nextBreakLen);
    setPhase('focus');
    setRemainingSec(nextFocusLen * 60);

    saveState({
      activeCard: currentCard,
      userId: currentUserId,
      phase: 'focus',
      sessionId: null,
      isRunning: false,
      targetEndTime: null,
      focusLen: nextFocusLen,
      breakLen: nextBreakLen,
      remainingSec: nextFocusLen * 60,
    });
  };

  const value: PomodoroContextValue = {
    activeCard,
    isRunning,
    remainingSec,
    phase,
    focusLen,
    breakLen,
    mmss,
    notificationPermission,
    setActiveCard,
    setUserId,
    start,
    pause,
    stop,
    setPreset,
    requestPermission: ensureNotifyPermission,
  };

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
};

export const usePomodoro = () => {
  const context = useContext(PomodoroContext);
  if (!context) {
    throw new Error('usePomodoro must be used within PomodoroProvider');
  }
  return context;
};
