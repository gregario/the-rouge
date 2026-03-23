'use client';

import styles from './SessionCounter.module.css';

interface SessionCounterProps {
  count: number;
}

export function SessionCounter({ count }: SessionCounterProps) {
  return (
    <div className={styles.counter} data-testid="session-counter" aria-label={`${count} sessions completed today`}>
      <span className={styles.count}>{count}</span>
      <span className={styles.label}>{count === 1 ? 'session' : 'sessions'} today</span>
    </div>
  );
}
