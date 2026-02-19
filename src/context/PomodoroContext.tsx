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
  sessionType: Phase | null;
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

const isIOSDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent);
};

const isStandalonePWA = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
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
  const [sessionType, setSessionType] = useState<Phase | null>(null);
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

  const stateRef = useRef({ isRunning, phase, sessionId, sessionType, focusLen, breakLen, activeCard, userId, remainingSec });
  stateRef.current = { isRunning, phase, sessionId, sessionType, focusLen, breakLen, activeCard, userId, remainingSec };

  const mergeStateRef = useCallback((partial: Partial<typeof stateRef.current>) => {
    stateRef.current = { ...stateRef.current, ...partial };
  }, []);

  const mmss = useMemo(() => {
    const m = Math.floor(remainingSec / 60).toString().padStart(2, '0');
    const s = Math.floor(remainingSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [remainingSec]);

  const ensureServiceWorkerRegistration = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null;

    try {
      const current = await navigator.serviceWorker.getRegistration();
      if (current) return current;
      return await navigator.serviceWorker.register('/sw.js');
    } catch (error) {
      console.error('Could not register service worker for notifications', error);
      return null;
    }
  }, []);

  const ensureNotifyPermission = useCallback(async (): Promise<BrowserPermission> => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }

    // iOS only supports Web Push for installed Home Screen web apps.
    if (isIOSDevice() && !isStandalonePWA()) {
      setNotificationPermission('unsupported');
      return 'unsupported';
    }

    let nextPermission = Notification.permission;
    if (nextPermission === 'default') {
      try {
        // Ask permission before awaiting any async step to preserve user gesture.
        nextPermission = await Notification.requestPermission();
      } catch {
        nextPermission = Notification.permission;
      }
    }

    setNotificationPermission(nextPermission);

    if (nextPermission !== 'granted') {
      return nextPermission;
    }

    try {
      await ensureServiceWorkerRegistration();
      return nextPermission;
    } catch {
      return nextPermission;
    }
  }, [ensureServiceWorkerRegistration]);

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
    const permission: BrowserPermission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    let shown = false;
    if (permission === 'granted') {
      try {
        const registration = await ensureServiceWorkerRegistration();
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

    try {
      if (document.visibilityState === 'visible' || !shown) {
        window.dispatchEvent(new CustomEvent('pomodoro:notify', { detail: { title, body } }));
      }
    } catch {
      // Ignore UI dispatch errors.
    }

    if ('vibrate' in navigator) {
      try {
        navigator.vibrate([180, 80, 180]);
      } catch {
        // Ignore vibration errors.
      }
    }

    await playBeep();
  }, [ensureServiceWorkerRegistration, playBeep]);

  const persistCompletedSession = useCallback(async (
    currentSessionId: string | null,
    completedDuration: number,
    completedSessionType: Phase,
    currentCard: Card | null,
  ) => {
    if (!currentSessionId) return;

    try {
      await api.patch(`${API_URL}/timer-sessions/${currentSessionId}`, {
        durationMinutes: completedDuration,
        type: completedSessionType,
      });

      if (currentCard && completedSessionType === 'focus') {
        await api.patch(`${API_URL}/cards/${currentCard.id}`, { incrementActualTime: completedDuration });
      }
    } catch (error) {
      console.error('Failed to complete timer session', error);
    }
  }, []);

  const handlePhaseComplete = useCallback(async () => {
    if (phaseCompleteLockRef.current) return;
    phaseCompleteLockRef.current = true;

    try {
      const {
        phase: currentPhase,
        sessionId: currentSessionId,
        sessionType: currentSessionType,
        focusLen: currentFocusLen,
        breakLen: currentBreakLen,
        activeCard: currentCard,
        userId: currentUserId,
      } = stateRef.current;

      const completedSessionType: Phase = currentSessionType ?? currentPhase;
      const completedDuration = completedSessionType === 'focus' ? currentFocusLen : currentBreakLen;

      setIsRunning(false);
      workerRef.current?.postMessage({ command: 'stop' });
      setSessionId(null);
      setSessionType(null);
      mergeStateRef({ isRunning: false, sessionId: null, sessionType: null });

      if (currentPhase === 'focus') {
        const nextRemaining = currentBreakLen * 60;
        await notify('Focus terminado', 'Buen trabajo. Toma un descanso.');
        setPhase('break');
        setRemainingSec(nextRemaining);
        saveState({
          activeCard: currentCard,
          userId: currentUserId,
          phase: 'break',
          sessionId: null,
          sessionType: null,
          isRunning: false,
          targetEndTime: null,
          focusLen: currentFocusLen,
          breakLen: currentBreakLen,
          remainingSec: nextRemaining,
        });
        mergeStateRef({ phase: 'break', remainingSec: nextRemaining });

        void persistCompletedSession(currentSessionId, completedDuration, completedSessionType, currentCard);
      } else {
        const nextRemaining = currentFocusLen * 60;
        await notify('Descanso terminado', 'Volvamos al enfoque.');
        setPhase('focus');
        setRemainingSec(nextRemaining);
        saveState({
          activeCard: currentCard,
          userId: currentUserId,
          phase: 'focus',
          sessionId: null,
          sessionType: null,
          isRunning: false,
          targetEndTime: null,
          focusLen: currentFocusLen,
          breakLen: currentBreakLen,
          remainingSec: nextRemaining,
        });
        mergeStateRef({ phase: 'focus', remainingSec: nextRemaining });

        void persistCompletedSession(currentSessionId, completedDuration, completedSessionType, null);
      }
    } finally {
      phaseCompleteLockRef.current = false;
    }
  }, [mergeStateRef, notify, persistCompletedSession, saveState]);

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
      setSessionType((saved.sessionType ?? null) || (saved.sessionId ? savedPhase : null));
      setFocusLen(savedFocusLen);
      setBreakLen(savedBreakLen);

      if (saved.isRunning && saved.targetEndTime) {
        const diff = Math.max(0, Math.ceil((saved.targetEndTime - Date.now()) / 1000));
        if (diff > 0) {
          setRemainingSec(diff);
          setIsRunning(true);
          mergeStateRef({
            activeCard: saved.activeCard ?? null,
            userId: saved.userId ?? 'user-1',
            phase: savedPhase,
            sessionId: saved.sessionId ?? null,
            sessionType: (saved.sessionType ?? null) || (saved.sessionId ? savedPhase : null),
            focusLen: savedFocusLen,
            breakLen: savedBreakLen,
            remainingSec: diff,
            isRunning: true,
          });
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
      mergeStateRef({
        activeCard: saved.activeCard ?? null,
        userId: saved.userId ?? 'user-1',
        phase: savedPhase,
        sessionId: saved.sessionId ?? null,
        sessionType: (saved.sessionType ?? null) || (saved.sessionId ? savedPhase : null),
        focusLen: savedFocusLen,
        breakLen: savedBreakLen,
        remainingSec: fallbackRemaining,
        isRunning: false,
      });
    } catch (error) {
      console.error('Failed to rehydrate pomodoro state', error);
      clearState();
    }
  }, [clearState, mergeStateRef]);

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
      if (isIOSDevice() && !isStandalonePWA()) {
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
      sessionType: currentSessionType,
    } = stateRef.current;

    if (!currentCard || currentlyRunning) return;

    void ensureNotifyPermission();
    await unlockAudio();

    setIsRunning(true);

    const phaseSeconds = (currentPhase === 'focus' ? currentFocusLen : currentBreakLen) * 60;
    const nextSeconds = currentRemainingSec > 0 ? currentRemainingSec : phaseSeconds;
    const targetEndTime = Date.now() + (nextSeconds * 1000);
    const shouldCreateSession = !currentSessionId || (currentSessionType && currentSessionType !== currentPhase);
    const resumedSessionType = currentSessionType ?? (currentSessionId ? currentPhase : null);
    const effectiveSessionId = shouldCreateSession ? null : currentSessionId;
    const effectiveSessionType = shouldCreateSession ? null : resumedSessionType;

    setRemainingSec(nextSeconds);
    mergeStateRef({
      isRunning: true,
      remainingSec: nextSeconds,
      sessionId: effectiveSessionId,
      sessionType: effectiveSessionType,
    });
    if (shouldCreateSession) {
      setSessionId(null);
      setSessionType(null);
    } else if (effectiveSessionType) {
      setSessionType(effectiveSessionType);
    }

    saveState({
      activeCard: currentCard,
      userId: currentUserId,
      phase: currentPhase,
      sessionId: effectiveSessionId,
      sessionType: effectiveSessionType,
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

    if (shouldCreateSession) {
      try {
        const response = await api.post(`${API_URL}/timer-sessions`, {
          cardId: currentCard.id,
          userId: currentUserId,
          type: currentPhase,
        });

        const id = response.data?.id ?? response.data?.sessionId ?? null;
        if (id) {
          setSessionId(id);
          setSessionType(currentPhase);
          mergeStateRef({ sessionId: id, sessionType: currentPhase });
          saveState({
            activeCard: currentCard,
            userId: currentUserId,
            phase: currentPhase,
            sessionId: id,
            sessionType: currentPhase,
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
      sessionType: currentSessionType,
    } = stateRef.current;

    setIsRunning(false);
    workerRef.current?.postMessage({ command: 'pause' });
    mergeStateRef({ isRunning: false });

    saveState({
      activeCard: currentCard,
      userId: currentUserId,
      phase: currentPhase,
      sessionId: currentSessionId,
      sessionType: currentSessionType ?? (currentSessionId ? currentPhase : null),
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
      sessionType: currentSessionType,
      activeCard: currentCard,
      remainingSec: currentRemainingSec,
    } = stateRef.current;

    const effectiveSessionType: Phase = currentSessionType ?? currentPhase;
    setIsRunning(false);
    workerRef.current?.postMessage({ command: 'stop' });
    clearState();
    setSessionId(null);
    mergeStateRef({ isRunning: false, sessionId: null, sessionType: null });
    setSessionType(null);

    const totalSeconds = (effectiveSessionType === 'focus' ? currentFocusLen : currentBreakLen) * 60;
    if (currentSessionId) {
      try {
        const elapsedMinutes = Math.max(0, Math.round(((totalSeconds - currentRemainingSec) / 60) * 10) / 10);
        await api.patch(`${API_URL}/timer-sessions/${currentSessionId}`, {
          durationMinutes: elapsedMinutes,
          type: effectiveSessionType,
        });

        if (currentCard && elapsedMinutes > 0 && effectiveSessionType === 'focus') {
          await api.patch(`${API_URL}/cards/${currentCard.id}`, { incrementActualTime: elapsedMinutes });
        }
      } catch (error) {
        console.error('Failed to end timer session', error);
      } finally {
        setSessionId(null);
      }
    }

    setRemainingSec(totalSeconds);
    mergeStateRef({ remainingSec: totalSeconds });
  };

  const setPreset = (nextFocusLen: number, nextBreakLen: number) => {
    const {
      phase: currentPhase,
      focusLen: currentFocusLen,
      breakLen: currentBreakLen,
      sessionId: currentSessionId,
      sessionType: currentSessionType,
      activeCard: currentCard,
      remainingSec: currentRemainingSec,
      userId: currentUserId,
    } = stateRef.current;

    const effectiveSessionType: Phase = currentSessionType ?? currentPhase;
    const currentTotal = (effectiveSessionType === 'focus' ? currentFocusLen : currentBreakLen) * 60;
    const elapsedMinutes = Math.max(0, Math.round(((currentTotal - currentRemainingSec) / 60) * 10) / 10);

    if (currentSessionId && elapsedMinutes > 0) {
      (async () => {
        try {
          await api.patch(`${API_URL}/timer-sessions/${currentSessionId}`, {
            durationMinutes: elapsedMinutes,
            type: effectiveSessionType,
          });
          if (currentCard && effectiveSessionType === 'focus') {
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
    setSessionType(null);
    setFocusLen(nextFocusLen);
    setBreakLen(nextBreakLen);
    setPhase('focus');
    setRemainingSec(nextFocusLen * 60);
    mergeStateRef({
      isRunning: false,
      sessionId: null,
      sessionType: null,
      focusLen: nextFocusLen,
      breakLen: nextBreakLen,
      phase: 'focus',
      remainingSec: nextFocusLen * 60,
    });

    saveState({
      activeCard: currentCard,
      userId: currentUserId,
      phase: 'focus',
      sessionId: null,
      sessionType: null,
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
