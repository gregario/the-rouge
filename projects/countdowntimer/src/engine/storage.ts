import { TimerSettings, DEFAULT_SETTINGS } from './types';

const SETTINGS_KEY = 'epoch_settings';
const DAILY_COUNT_KEY = 'epoch_daily_count';
const DAILY_DATE_KEY = 'epoch_daily_date';

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function validateBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function validateSettings(parsed: Record<string, unknown>): TimerSettings {
  return {
    focusDuration: clampNumber(parsed.focusDuration, 1, 99, DEFAULT_SETTINGS.focusDuration),
    shortBreakDuration: clampNumber(parsed.shortBreakDuration, 1, 99, DEFAULT_SETTINGS.shortBreakDuration),
    longBreakDuration: clampNumber(parsed.longBreakDuration, 1, 99, DEFAULT_SETTINGS.longBreakDuration),
    longBreakInterval: clampNumber(parsed.longBreakInterval, 1, 10, DEFAULT_SETTINGS.longBreakInterval),
    autoStartBreaks: validateBoolean(parsed.autoStartBreaks, DEFAULT_SETTINGS.autoStartBreaks),
    autoStartFocus: validateBoolean(parsed.autoStartFocus, DEFAULT_SETTINGS.autoStartFocus),
    soundEnabled: validateBoolean(parsed.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    soundVolume: clampNumber(parsed.soundVolume, 0, 100, DEFAULT_SETTINGS.soundVolume),
    notificationsEnabled: validateBoolean(parsed.notificationsEnabled, DEFAULT_SETTINGS.notificationsEnabled),
  };
}

function isStorageAvailable(): boolean {
  try {
    const test = '__epoch_test__';
    localStorage.setItem(test, '1');
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): TimerSettings {
  if (!isStorageAvailable()) return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return validateSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: TimerSettings): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Silently fail if storage is full
  }
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadDailyCount(): number {
  if (!isStorageAvailable()) return 0;
  try {
    const storedDate = localStorage.getItem(DAILY_DATE_KEY);
    if (storedDate !== todayString()) {
      // Different day or no date stored — reset
      saveDailyCount(0);
      return 0;
    }
    const count = parseInt(localStorage.getItem(DAILY_COUNT_KEY) ?? '0', 10);
    return isNaN(count) ? 0 : Math.min(count, 99);
  } catch {
    return 0;
  }
}

export function saveDailyCount(count: number): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.setItem(DAILY_COUNT_KEY, String(Math.min(count, 99)));
    localStorage.setItem(DAILY_DATE_KEY, todayString());
  } catch {
    // Silently fail
  }
}
