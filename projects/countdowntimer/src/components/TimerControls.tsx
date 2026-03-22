'use client';

import { TimerStatus } from '@/engine/types';
import styles from './TimerControls.module.css';

interface TimerControlsProps {
  status: TimerStatus;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSkip: () => void;
}

export function TimerControls({ status, onStart, onPause, onReset, onSkip }: TimerControlsProps) {
  const isRunning = status === 'running';

  return (
    <div className={styles.controls} role="group" aria-label="Timer controls">
      <button
        className={styles.button}
        onClick={onReset}
        aria-label="Reset timer"
        title="Reset (R)"
        data-testid="reset-button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 1 9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M3 22v-6h6" />
        </svg>
      </button>

      <button
        className={`${styles.button} ${styles.primary}`}
        onClick={isRunning ? onPause : onStart}
        aria-label={isRunning ? 'Pause timer' : 'Start timer'}
        title={isRunning ? 'Pause (Space)' : 'Start (Space)'}
        data-testid="start-pause-button"
      >
        {isRunning ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,3 20,12 6,21" />
          </svg>
        )}
      </button>

      <button
        className={styles.button}
        onClick={onSkip}
        aria-label="Skip to next phase"
        title="Skip (S)"
        data-testid="skip-button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5,3 15,12 5,21" />
          <rect x="17" y="3" width="2" height="18" rx="1" />
        </svg>
      </button>
    </div>
  );
}
