import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Card } from '../types/data';

const API_URL = 'http://localhost:3001/api';

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
  start: () => Promise<void>;
  pause: () => void;
  stop: () => Promise<void>;
  setPreset: (focus: number, brk: number) => void;
}

const PomodoroContext = createContext<PomodoroContextValue | undefined>(undefined);

export const PomodoroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const defaultFocus = 25;
  const defaultBreak = 5;

  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [remainingSec, setRemainingSec] = useState(defaultFocus * 60);
  const [phase, setPhase] = useState<Phase>('focus');
  const [focusLen, setFocusLen] = useState<number>(defaultFocus);
  const [breakLen, setBreakLen] = useState<number>(defaultBreak);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

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
    } catch {}
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
    } catch {}
  };

  const notify = async (title: string, body: string) => {
    await ensureNotifyPermission();
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch {}
    playBeep();
  };

  useEffect(() => {
    // reset countdown when lengths or phase change (not while running)
    if (!isRunning) {
      const next = (phase === 'focus' ? focusLen : breakLen) * 60;
      setRemainingSec(next);
    }
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, focusLen, breakLen]);

  const start = async () => {
    if (!activeCard || isRunning) return;
    setIsRunning(true);
    if (!sessionId) {
      try {
        const res = await axios.post(`${API_URL}/timer-sessions`, {
          cardId: activeCard.id,
          userId: 'user-1',
          type: phase,
        });
        const id = (res.data?.id) || res.data?.sessionId || null;
        if (id) setSessionId(id);
      } catch (e) {
        console.error('Failed to create timer session', e);
      }
    }
    intervalRef.current = window.setInterval(() => {
      setRemainingSec((sec) => {
        if (sec <= 1) {
          window.clearInterval(intervalRef.current!);
          handlePhaseComplete();
          return 0;
        }
        return sec - 1;
      });
    }, 1000);
  };

  const pause = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setIsRunning(false);
  };

  const stop = async () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setIsRunning(false);
    const total = (phase === 'focus' ? focusLen : breakLen) * 60;
    if (sessionId) {
      try {
        const elapsedMinutes = Math.round(((total - remainingSec) / 60) * 10) / 10;
        await axios.patch(`${API_URL}/timer-sessions/${sessionId}`, { durationMinutes: elapsedMinutes });
      } catch (e) {
        console.error('Failed to end timer session', e);
      } finally {
        setSessionId(null);
      }
    }
    setRemainingSec((phase === 'focus' ? focusLen : breakLen) * 60);
  };

  const handlePhaseComplete = async () => {
    if (phase === 'focus') {
      if (sessionId) {
        try {
          await axios.patch(`${API_URL}/timer-sessions/${sessionId}`, { durationMinutes: focusLen });
        } catch (e) {
          console.error('Failed to complete timer session', e);
        } finally {
          setSessionId(null);
        }
      }
      await notify('Focus terminado', 'Buen trabajo. Toma un descanso.');
      setPhase('break');
      setIsRunning(false);
      setRemainingSec(breakLen * 60);
    } else {
      if (sessionId) {
        try {
          await axios.patch(`${API_URL}/timer-sessions/${sessionId}`, { durationMinutes: breakLen });
        } catch (e) {
          console.error('Failed to complete break session', e);
        } finally {
          setSessionId(null);
        }
      }
      await notify('Descanso terminado', 'Volvamos al enfoque.');
      setPhase('focus');
      setIsRunning(false);
      setRemainingSec(focusLen * 60);
    }
  };

  const setPreset = (f: number, b: number) => {
    setFocusLen(f);
    setBreakLen(b);
    setPhase('focus');
    setIsRunning(false);
    setRemainingSec(f * 60);
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

