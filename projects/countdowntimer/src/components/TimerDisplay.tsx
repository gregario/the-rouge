'use client';

import { PhaseType } from '@/engine/types';
import { phaseLabel } from '@/engine/cycle';
import styles from './TimerDisplay.module.css';

interface TimerDisplayProps {
  phase: PhaseType;
  displayTime: string;
  isRunning: boolean;
  remainingMs?: number;
}

function formatDuration(displayTime: string, ms?: number): string {
  if (ms !== undefined) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `PT${minutes}M${String(seconds).padStart(2, '0')}S`;
  }
  // Derive from displayTime "MM:SS"
  const [m, s] = displayTime.split(':').map(Number);
  return `PT${m}M${String(s).padStart(2, '0')}S`;
}

export function TimerDisplay({ phase, displayTime, isRunning, remainingMs }: TimerDisplayProps) {
  return (
    <div className={styles.container}>
      <div className={`${styles.glow} ${isRunning ? styles.glowPulsing : ''}`} />
      <div className={styles.card}>
        <span className={styles.phaseLabel} data-testid="phase-label">
          {phaseLabel(phase)}
        </span>
        <time className={styles.time} data-testid="timer-display" aria-label={`Timer: ${displayTime}`} dateTime={formatDuration(displayTime, remainingMs)}>
          {displayTime}
        </time>
      </div>
    </div>
  );
}
