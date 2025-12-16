import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Card } from '../types/data';
import { API_URL } from '../config/api';
import { api } from '../config/http';

type Phase = 'focus' | 'break';

interface PomodoroContextValue {
  activeCard: Card | null;
  isRunning: boolean;
  remainingSec: number;
  phase: Phase;
  focusLen: number;
  breakLen: number;
  mmss: string;
  // actions
  setActiveCard: (card: Card | null) => void;
  setUserId: (userId: string) => void;
  start: () => Promise<void>;
  pause: () => void;
  stop: () => Promise<void>;
  setPreset: (focus: number, brk: number) => void;
}

const PomodoroContext = createContext<PomodoroContextValue | undefined>(undefined);

export const PomodoroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const defaultFocus = 25;
  const defaultBreak = 5;

  // Refs & State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const STORAGE_KEY = 'pomodoro_state';

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(defaultFocus * 60);
  const [phase, setPhase] = useState<Phase>('focus');
  const [focusLen, setFocusLen] = useState<number>(defaultFocus);
  const [breakLen, setBreakLen] = useState<number>(defaultBreak);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>('user-1');

  // Persistence Helpers
  const saveState = useCallback((state: any) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        savedAt: Date.now()
      }));
    } catch { }
  }, []);

  const clearState = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { }
  }, []);

  // Refs to hold current state for useCallback without dependencies
  const stateRef = useRef({ isRunning, phase, sessionId, focusLen, breakLen, activeCard, userId });
  stateRef.current = { isRunning, phase, sessionId, focusLen, breakLen, activeCard, userId };

  // Rehydrate state on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.targetEndTime) {
          const now = Date.now();
          const diff = Math.ceil((saved.targetEndTime - now) / 1000);

          if (saved.isRunning && diff > 0) {
            // Resume running
            setActiveCard(saved.activeCard);
            setUserId(saved.userId);
            setPhase(saved.phase);
            setSessionId(saved.sessionId);
            setFocusLen(saved.focusLen);
            setBreakLen(saved.breakLen);
            setRemainingSec(diff);
            setIsRunning(true);

            // Sync worker and audio
            setTimeout(() => {
              workerRef.current?.postMessage({
                command: 'start',
                seconds: diff,
                endTime: saved.targetEndTime
              });
              audioRef.current?.play().catch(() => { });
            }, 500);
          }
        }
      }
    } catch (e) {
      console.error('Failed to rehydrate', e);
    }
  }, []);

  const mmss = useMemo(() => {
    const m = Math.floor(remainingSec / 60).toString().padStart(2, '0');
    const s = Math.floor(remainingSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, [remainingSec]);

  const ensureNotifyPermission = async () => {
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
    } catch { }
  };

  const playBeep = () => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      o.start();
      o.stop(ctx.currentTime + 0.65);
    } catch { }
  };

  const notify = useCallback(async (title: string, body: string) => {
    await ensureNotifyPermission();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch { }
    playBeep();
  }, []);

  const handlePhaseComplete = useCallback(async () => {
    const { phase, sessionId, focusLen, breakLen, activeCard } = stateRef.current;
    setIsRunning(false);

    if (phase === 'focus') {
      if (sessionId) {
        try {
          await api.patch(`${API_URL}/timer-sessions/${sessionId}`, { durationMinutes: focusLen });
          if (activeCard) {
            await api.patch(`${API_URL}/cards/${activeCard.id}`, { incrementActualTime: focusLen });
          }
        } catch (e) {
          console.error('Failed to complete timer session', e);
        } finally {
          setSessionId(null);
        }
      }
      await notify('Focus terminado', 'Buen trabajo. Toma un descanso.');
      setPhase('break');
      setRemainingSec(breakLen * 60);
    } else { // phase === 'break'
      if (sessionId) {
        try {
          await api.patch(`${API_URL}/timer-sessions/${sessionId}`, { durationMinutes: breakLen });
        } catch (e) {
          console.error('Failed to complete break session', e);
        } finally {
          setSessionId(null);
        }
      }
      await notify('Descanso terminado', 'Volvamos al enfoque.');
      setPhase('focus');
      setRemainingSec(focusLen * 60);
    }
  }, [notify, clearState]);

  useEffect(() => {
    const worker = new Worker('/pomodoro-worker.js');
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { type, remainingSeconds } = e.data;
      if (type === 'tick') {
        setRemainingSec(remainingSeconds);
      } else if (type === 'done') {
        handlePhaseComplete();
      }
    };

    worker.onerror = (e: ErrorEvent) => {
      console.error('[CONTEXT] Error in Pomodoro worker:', e);
    };

    return () => {
      worker.terminate();
    };
  }, [handlePhaseComplete]);

  useEffect(() => {
    if (!isRunning) {
      const next = (phase === 'focus' ? focusLen : breakLen) * 60;
      setRemainingSec(next);
    }
  }, [phase, focusLen, breakLen, isRunning]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Re-check storage to sync drift
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved.isRunning && saved.targetEndTime) {
              const now = Date.now();
              const diff = Math.ceil((saved.targetEndTime - now) / 1000);
              if (diff > 0) {
                setRemainingSec(diff);
                // Ensure worker is in sync
                workerRef.current?.postMessage({
                  command: 'start',
                  seconds: diff,
                  endTime: saved.targetEndTime
                });
              } else if (saved.isRunning) {
                // It finished while backgrounded
                handlePhaseComplete();
              }
            }
          }
        } catch { }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handlePhaseComplete]);

  const start = async () => {
    // 1. Play audio IMMEDIATELY to secure "user gesture" before async/await
    audioRef.current?.play().catch(() => console.log('Audio play failed'));

    const { activeCard, isRunning, userId, phase } = stateRef.current;
    if (!activeCard || isRunning) return;

    // Request permission explicitly on user interaction (start)
    await ensureNotifyPermission();

    setIsRunning(true);

    // Calculate Absolute End Time to prevent drift
    const now = Date.now();
    const targetEndTime = now + (remainingSec * 1000);

    // Save Initial State
    saveState({
      activeCard,
      userId,
      phase,
      sessionId: null, // Will update when API returns
      isRunning: true,
      targetEndTime,
      focusLen,
      breakLen
    });

    workerRef.current?.postMessage({
      command: 'start',
      seconds: remainingSec,
      endTime: targetEndTime
    });

    if (!sessionId) {
      try {
        const res = await api.post(`${API_URL}/timer-sessions`, {
          cardId: activeCard.id,
          userId: userId,
          type: phase,
        });
        const id = (res.data?.id) || res.data?.sessionId || null;
        if (id) {
          setSessionId(id);
          // Update saved state with session ID
          saveState({
            activeCard,
            userId,
            phase,
            sessionId: id,
            isRunning: true,
            targetEndTime,
            focusLen,
            breakLen
          });
        }
      } catch (e) {
        console.error('Failed to create timer session', e);
      }
    }
  };

  const pause = () => {
    setIsRunning(false);
    clearState();
    workerRef.current?.postMessage({ command: 'pause' });
    audioRef.current?.pause();
  };

  const stop = async () => {
    const { phase, focusLen, breakLen, sessionId, activeCard } = stateRef.current;
    setIsRunning(false);
    clearState();
    workerRef.current?.postMessage({ command: 'stop' });
    audioRef.current?.pause();

    const total = (phase === 'focus' ? focusLen : breakLen) * 60;
    if (sessionId) {
      try {
        const elapsedMinutes = Math.round(((total - remainingSec) / 60) * 10) / 10;
        await api.patch(`${API_URL}/timer-sessions/${sessionId}`, { durationMinutes: elapsedMinutes });
        if (activeCard && elapsedMinutes > 0 && phase === 'focus') {
          await api.patch(`${API_URL}/cards/${activeCard.id}`, { incrementActualTime: elapsedMinutes });
        }
      } catch (e) {
        console.error('Failed to end timer session', e);
      } finally {
        setSessionId(null);
      }
    }
    setRemainingSec((phase === 'focus' ? focusLen : breakLen) * 60);
  };

  const setPreset = (f: number, b: number) => {
    setIsRunning(false);
    clearState();
    workerRef.current?.postMessage({ command: 'stop' });
    audioRef.current?.pause();
    setFocusLen(f);
    setBreakLen(b);
    setPhase('focus');
  };

  const value: PomodoroContextValue = {
    activeCard,
    isRunning,
    remainingSec,
    phase,
    focusLen,
    breakLen,
    mmss,
    setActiveCard,
    setUserId,
    start,
    pause,
    stop,
    setPreset,
  };

  return <PomodoroContext.Provider value={value}>{children}</PomodoroContext.Provider>;
};

export const usePomodoro = () => {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoro must be used within PomodoroProvider');
  return ctx;
};
