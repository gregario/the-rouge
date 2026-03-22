import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, loadDailyCount, saveDailyCount } from '@/engine/storage';
import { DEFAULT_SETTINGS } from '@/engine/types';

beforeEach(() => {
  localStorage.clear();
});

describe('loadSettings', () => {
  it('returns defaults when nothing is stored', () => {
    const settings = loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('returns stored settings', () => {
    const custom = { ...DEFAULT_SETTINGS, focusDuration: 50 };
    saveSettings(custom);
    expect(loadSettings().focusDuration).toBe(50);
  });

  it('fills missing fields with defaults', () => {
    localStorage.setItem('epoch_settings', JSON.stringify({ focusDuration: 30 }));
    const settings = loadSettings();
    expect(settings.focusDuration).toBe(30);
    expect(settings.shortBreakDuration).toBe(5); // default
  });

  it('handles corrupted JSON gracefully', () => {
    localStorage.setItem('epoch_settings', '{bad json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('daily count', () => {
  it('starts at 0', () => {
    expect(loadDailyCount()).toBe(0);
  });

  it('persists count', () => {
    saveDailyCount(5);
    expect(loadDailyCount()).toBe(5);
  });

  it('caps at 99', () => {
    saveDailyCount(150);
    expect(loadDailyCount()).toBe(99);
  });

  it('resets when date changes', () => {
    saveDailyCount(5);
    // Simulate different day
    localStorage.setItem('epoch_daily_date', '2020-01-01');
    expect(loadDailyCount()).toBe(0);
  });
});
