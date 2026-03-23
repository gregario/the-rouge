'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTimer } from '@/hooks/useTimer';
import { TimerDisplay } from '@/components/TimerDisplay';
import { TimerControls } from '@/components/TimerControls';
import { CycleIndicator } from '@/components/CycleIndicator';
import { SessionCounter } from '@/components/SessionCounter';
import { SettingsModal } from '@/components/SettingsModal';
import styles from './page.module.css';

export default function Home() {
  const { timer, settings, dailyCount, displayTime, start, pause, reset, skip, updateSettings } = useTimer();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Disable shortcuts when settings modal is open or when in an input
    if (settingsOpen) return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        timer.status === 'running' ? pause() : start();
        break;
      case 'KeyR':
        e.preventDefault();
        reset();
        break;
      case 'KeyS':
        e.preventDefault();
        skip();
        break;
    }
  }, [settingsOpen, timer.status, start, pause, reset, skip]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className={styles.main}
      data-phase={timer.cycle.phase}
    >
      <header className={styles.settingsHeader}>
        <button
          className={styles.settingsButton}
          onClick={() => setSettingsOpen(true)}
          aria-label="Open settings"
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          data-testid="settings-trigger"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </header>

      <main className={styles.content}>
        <h1 className={styles.srOnly}>Epoch</h1>
        <TimerDisplay
          phase={timer.cycle.phase}
          displayTime={displayTime}
          isRunning={timer.status === 'running'}
        />

        <div className={styles.controlsArea}>
          <TimerControls
            status={timer.status}
            onStart={start}
            onPause={pause}
            onReset={reset}
            onSkip={skip}
          />
        </div>

        <CycleIndicator cycle={timer.cycle} settings={settings} />

        <footer>
          <SessionCounter count={dailyCount} />
        </footer>
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onUpdate={updateSettings}
      />
    </div>
  );
}
