import { describe, it, expect, beforeEach } from 'vitest';
import { loadSettings, saveSettings, loadDailyCount, saveDailyCount } from '@/engine/storage';
import { DEFAULT_SETTINGS } from '@/engine/types';

beforeEach(() => {
  localStorage.clear();
});

// @criterion: AC-settings-2
// Settings persist across page refresh
// @criterion-hash: 6c3b8c111e6c
describe('[AC-settings-2] settings persistence', () => {
  it('returns defaults when nothing is stored', () => {
    const settings = loadSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('returns stored settings after save', () => {
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

// @criterion: AC-counter-2
// Counter resets when the date changes
// @criterion-hash: 50277dcd16cd
// @criterion: AC-counter-3
// Counter survives page refresh
// @criterion-hash: 29e8c34b05bb
// @criterion: AC-counter-4
// Counter displays correctly from 0 to 99
// @criterion-hash: 28ea9ab2091f
describe('[AC-counter-2, AC-counter-3, AC-counter-4] daily count persistence', () => {
  it('starts at 0', () => {
    expect(loadDailyCount()).toBe(0);
  });

  it('[AC-counter-3] persists count across loads (simulates page refresh)', () => {
    saveDailyCount(5);
    expect(loadDailyCount()).toBe(5);
  });

  it('[AC-counter-4] caps at 99', () => {
    saveDailyCount(150);
    expect(loadDailyCount()).toBe(99);
  });

  it('[AC-counter-2] resets when date changes', () => {
    saveDailyCount(5);
    // Simulate different day
    localStorage.setItem('epoch_daily_date', '2020-01-01');
    expect(loadDailyCount()).toBe(0);
  });
});

// @criterion: AC-counter-5
// Graceful fallback when localStorage is unavailable
// @criterion-hash: 3557fa341265
describe('[AC-counter-5] localStorage unavailability fallback', () => {
  it('loadSettings returns defaults when localStorage throws', () => {
    const origGetItem = localStorage.getItem;
    localStorage.getItem = () => { throw new Error('Access denied'); };
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.getItem = origGetItem;
  });

  it('loadDailyCount returns 0 when localStorage throws', () => {
    const origGetItem = localStorage.getItem;
    localStorage.getItem = () => { throw new Error('Access denied'); };
    expect(loadDailyCount()).toBe(0);
    localStorage.getItem = origGetItem;
  });

  it('saveSettings does not throw when localStorage throws', () => {
    const origSetItem = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('Access denied'); };
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    localStorage.setItem = origSetItem;
  });

  it('saveDailyCount does not throw when localStorage throws', () => {
    const origSetItem = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('Access denied'); };
    expect(() => saveDailyCount(5)).not.toThrow();
    localStorage.setItem = origSetItem;
  });
});
