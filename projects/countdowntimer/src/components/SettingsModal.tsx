'use client';

import { useEffect, useRef, useCallback } from 'react';
import { TimerSettings } from '@/engine/types';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  isOpen: boolean;
  settings: TimerSettings;
  onClose: () => void;
  onUpdate: (partial: Partial<TimerSettings>) => void;
}

export function SettingsModal({ isOpen, settings, onClose, onUpdate }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      onClose();
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  }, [onClose]);

  const handleNumberChange = (key: keyof TimerSettings, min: number, max: number) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    onUpdate({ [key]: Math.min(max, Math.max(min, val)) });
  };

  const handleToggle = (key: keyof TimerSettings) => () => {
    const current = settings[key];
    if (key === 'notificationsEnabled' && !current) {
      if (typeof Notification !== 'undefined') {
        Notification.requestPermission().then(perm => {
          if (perm === 'granted') {
            onUpdate({ [key]: true });
          }
        });
      }
      return;
    }
    onUpdate({ [key]: !current });
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-label="Settings"
      data-testid="settings-modal"
      onClick={handleBackdropClick}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>Settings</h2>
        <button className={styles.closeButton} onClick={onClose} aria-label="Close settings" data-testid="settings-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className={styles.body}>
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Timing</h3>
          <NumberField label="Focus duration" value={settings.focusDuration} min={1} max={99} unit="min" onChange={handleNumberChange('focusDuration', 1, 99)} />
          <NumberField label="Short break" value={settings.shortBreakDuration} min={1} max={99} unit="min" onChange={handleNumberChange('shortBreakDuration', 1, 99)} />
          <NumberField label="Long break" value={settings.longBreakDuration} min={1} max={99} unit="min" onChange={handleNumberChange('longBreakDuration', 1, 99)} />
          <NumberField label="Long break interval" value={settings.longBreakInterval} min={1} max={10} unit="sessions" onChange={handleNumberChange('longBreakInterval', 1, 10)} />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Behavior</h3>
          <ToggleField label="Auto-start breaks" checked={settings.autoStartBreaks} onToggle={handleToggle('autoStartBreaks')} />
          <ToggleField label="Auto-start focus" checked={settings.autoStartFocus} onToggle={handleToggle('autoStartFocus')} />
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Sound</h3>
          <ToggleField label="Sound" checked={settings.soundEnabled} onToggle={handleToggle('soundEnabled')} />
          {settings.soundEnabled && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Volume</label>
              <input
                type="range"
                className={styles.slider}
                min={0}
                max={100}
                value={settings.soundVolume}
                onChange={e => onUpdate({ soundVolume: parseInt(e.target.value, 10) })}
                aria-label="Volume"
                data-testid="volume-slider"
              />
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Notifications</h3>
          <ToggleField label="Browser notifications" checked={settings.notificationsEnabled} onToggle={handleToggle('notificationsEnabled')} />
        </section>
      </div>

      <footer className={styles.footer}>
        <p className={styles.disclosure}>
          Epoch runs entirely in your browser. No data is collected or transmitted.
        </p>
        <p className={styles.trademark}>
          The Pomodoro Technique is a registered trademark of Francesco Cirillo.
        </p>
      </footer>
    </dialog>
  );
}

function NumberField({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.numberGroup}>
        <input
          type="number"
          className={styles.numberInput}
          value={value}
          min={min}
          max={max}
          onChange={onChange}
          aria-label={label}
        />
        <span className={styles.unit}>{unit}</span>
      </div>
    </div>
  );
}

function ToggleField({ label, checked, onToggle }: {
  label: string; checked: boolean; onToggle: () => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.fieldLabel}>{label}</label>
      <button
        className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
        onClick={onToggle}
        role="switch"
        aria-checked={checked}
        aria-label={label}
      >
        <span className={styles.toggleThumb} />
      </button>
    </div>
  );
}
