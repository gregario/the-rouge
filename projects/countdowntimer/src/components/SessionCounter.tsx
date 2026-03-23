'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './SessionCounter.module.css';

interface SessionCounterProps {
  count: number;
}

export function SessionCounter({ count }: SessionCounterProps) {
  const [celebrating, setCelebrating] = useState(false);
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (count > prevCountRef.current) {
      setCelebrating(true);
      const timer = setTimeout(() => setCelebrating(false), 600);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = count;
  }, [count]);

  // Update ref after celebration triggers
  useEffect(() => {
    prevCountRef.current = count;
  }, [count]);

  return (
    <div className={styles.counter} data-testid="session-counter" aria-label={`${count} sessions completed today`}>
      <span
        className={`${styles.count} ${celebrating ? styles.celebrate : ''}`}
        data-testid="session-count"
      >
        {count}
      </span>
      <span className={styles.label}>{count === 1 ? 'session' : 'sessions'} today</span>
    </div>
  );
}
