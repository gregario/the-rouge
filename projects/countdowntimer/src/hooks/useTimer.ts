'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { TimerState, TimerSettings, PhaseType, DEFAULT_SETTINGS } from '@/engine/types';
import { initialCycleState, nextPhase, phaseDurationMs, shouldAutoStart } from '@/engine/cycle';
import { loadSettings, saveSettings, loadDailyCount, saveDailyCount } from '@/engine/storage';
import { playChime, sendNotification } from '@/engine/audio';
import { phaseLabel } from '@/engine/cycle';

export interface UseTimerReturn {
  timer: TimerState;
  settings: TimerSettings;
  dailyCount: number;
  displayTime: string;
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  updateSettings: (partial: Partial<TimerSettings>) => void;
}

export function useTimer(): UseTimerReturn {
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [timer, setTimer] = useState<TimerState>(() => {
    const cycle = initialCycleState();
    const totalMs = phaseDurationMs(cycle.phase, DEFAULT_SETTINGS);
    return { status: 'idle', remainingMs: totalMs, totalMs, cycle };
  });
  const [dailyCount, setDailyCount] = useState(0);

  const startTimeRef = useRef<number>(0);
  const remainingAtStartRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Load persisted state on mount
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    const cycle = initialCycleState();
    const totalMs = phaseDurationMs(cycle.phase, loaded);
    setTimer({ status: 'idle', remainingMs: totalMs, totalMs, cycle });
    setDailyCount(loadDailyCount());
  }, []);

  const handlePhaseComplete = useCallback((wasSkipped: boolean) => {
    setTimer(prev => {
      const s = settingsRef.current;
      const completedPhase = prev.cycle.phase;

      // Increment daily count if focus completed naturally
      if (completedPhase === 'focus' && !wasSkipped) {
        const newCount = Math.min(loadDailyCount() + 1, 99);
        saveDailyCount(newCount);
        setDailyCount(newCount);
      }

      // Play chime and send notification
      if (s.soundEnabled) {
        playChime(s.soundVolume);
      }
      const next = nextPhase(prev.cycle, s, wasSkipped);
      if (s.notificationsEnabled) {
        sendNotification(
          `${phaseLabel(completedPhase)} complete`,
          `${phaseLabel(next.phase)} starting${shouldAutoStart(next.phase, s) ? '' : ' — press start'}.`
        );
      }

      const totalMs = phaseDurationMs(next.phase, s);
      const autoStart = shouldAutoStart(next.phase, s);

      return {
        status: autoStart ? 'running' : 'idle',
        remainingMs: totalMs,
        totalMs,
        cycle: next,
      };
    });
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    const remaining = Math.max(0, remainingAtStartRef.current - elapsed);

    if (remaining <= 0) {
      handlePhaseComplete(false);
      return;
    }

    setTimer(prev => ({ ...prev, remainingMs: remaining }));
    rafRef.current = requestAnimationFrame(tick);
  }, [handlePhaseComplete]);

  // Start/stop the animation frame loop based on timer status
  useEffect(() => {
    if (timer.status === 'running') {
      startTimeRef.current = Date.now();
      remainingAtStartRef.current = timer.remainingMs;
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // Only re-run when status changes, not on every remainingMs update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.status, timer.cycle.phase, tick]);

  const start = useCallback(() => {
    setTimer(prev => {
      if (prev.status === 'running') return prev;
      return { ...prev, status: 'running' };
    });
  }, []);

  const pause = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setTimer(prev => {
      if (prev.status !== 'running') return prev;
      return { ...prev, status: 'paused' };
    });
  }, []);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setTimer(prev => {
      const totalMs = phaseDurationMs(prev.cycle.phase, settingsRef.current);
      return { ...prev, status: 'idle', remainingMs: totalMs, totalMs };
    });
  }, []);

  const skip = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    handlePhaseComplete(true);
  }, [handlePhaseComplete]);

  const updateSettings = useCallback((partial: Partial<TimerSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      saveSettings(next);
      return next;
    });
  }, []);

  const displayTime = formatTime(timer.remainingMs);

  return { timer, settings, dailyCount, displayTime, start, pause, reset, skip, updateSettings };
}

function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
