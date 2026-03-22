'use client';

import { PhaseType } from '@/engine/types';
import { phaseLabel } from '@/engine/cycle';
import styles from './TimerDisplay.module.css';

interface TimerDisplayProps {
  phase: PhaseType;
  displayTime: string;
  isRunning: boolean;
}

export function TimerDisplay({ phase, displayTime, isRunning }: TimerDisplayProps) {
  return (
    <div className={styles.container}>
      <div className={`${styles.glow} ${isRunning ? styles.glowPulsing : ''}`} />
      <div className={styles.card}>
        <span className={styles.phaseLabel} data-testid="phase-label">
          {phaseLabel(phase)}
        </span>
        <time className={styles.time} data-testid="timer-display" aria-label={`Timer: ${displayTime}`}>
          {displayTime}
        </time>
      </div>
    </div>
  );
}
