'use client';

import { CycleState, TimerSettings } from '@/engine/types';
import styles from './CycleIndicator.module.css';

interface CycleIndicatorProps {
  cycle: CycleState;
  settings: TimerSettings;
}

export function CycleIndicator({ cycle, settings }: CycleIndicatorProps) {
  const dots = Array.from({ length: settings.longBreakInterval }, (_, i) => {
    const filled = i < cycle.focusCount;
    return (
      <span
        key={i}
        className={`${styles.dot} ${filled ? styles.filled : ''}`}
        role="img"
        aria-label={filled ? `Session ${i + 1}: completed` : `Session ${i + 1}: remaining`}
      />
    );
  });

  return (
    <div className={styles.indicator} role="group" aria-label="Cycle progress" data-testid="cycle-indicator">
      {dots}
    </div>
  );
}
