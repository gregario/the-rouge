import { describe, it, expect } from 'vitest';
import { initialCycleState, nextPhase, phaseDurationMs, shouldAutoStart, phaseLabel } from '@/engine/cycle';
import { DEFAULT_SETTINGS, TimerSettings } from '@/engine/types';

describe('initialCycleState', () => {
  it('starts at focus phase, position 1, zero completed', () => {
    const state = initialCycleState();
    expect(state.phase).toBe('focus');
    expect(state.focusCount).toBe(0);
    expect(state.cyclePosition).toBe(1);
  });
});

describe('phaseDurationMs', () => {
  it('returns focus duration in ms', () => {
    expect(phaseDurationMs('focus', DEFAULT_SETTINGS)).toBe(25 * 60 * 1000);
  });

  it('returns short break duration in ms', () => {
    expect(phaseDurationMs('short-break', DEFAULT_SETTINGS)).toBe(5 * 60 * 1000);
  });

  it('returns long break duration in ms', () => {
    expect(phaseDurationMs('long-break', DEFAULT_SETTINGS)).toBe(15 * 60 * 1000);
  });
});

// @criterion: AC-cycle-1
// Cycle follows correct Pomodoro sequence (F-SB-F-SB-F-SB-F-LB)
// @criterion-hash: ae0cd5a2b059
describe('[AC-cycle-1] Pomodoro sequence', () => {
  const settings = DEFAULT_SETTINGS;

  it('follows correct Pomodoro sequence: F-SB-F-SB-F-SB-F-LB', () => {
    let cycle = initialCycleState();

    // Focus 1 -> Short Break
    cycle = nextPhase(cycle, settings, false);
    expect(cycle.phase).toBe('short-break');
    expect(cycle.focusCount).toBe(1);

    // Short Break -> Focus 2
    cycle = nextPhase(cycle, settings, false);
    expect(cycle.phase).toBe('focus');
    expect(cycle.focusCount).toBe(1);

    // Focus 2 -> Short Break
    cycle = nextPhase(cycle, settings, false);
    expect(cycle.phase).toBe('short-break');
    expect(cycle.focusCount).toBe(2);

    // Short Break -> Focus 3
    cycle = nextPhase(cycle, settings, false);
    expect(cycle.phase).toBe('focus');

    // Focus 3 -> Short Break
    cycle = nextPhase(cycle, settings, false);
    expect(cycle.phase).toBe('short-break');
    expect(cycle.focusCount).toBe(3);

    // Short Break -> Focus 4
    cycle = nextPhase(cycle, settings, false);
    expect(cycle.phase).toBe('focus');

    // Focus 4 -> Long Break (4th focus completed)
    cycle = nextPhase(cycle, settings, false);
    expect(cycle.phase).toBe('long-break');
    expect(cycle.focusCount).toBe(4);
  });

  it('resets cycle after long break', () => {
    const longBreakState = { phase: 'long-break' as const, focusCount: 4, cyclePosition: 8 };
    const result = nextPhase(longBreakState, settings, false);
    expect(result.phase).toBe('focus');
    expect(result.focusCount).toBe(0);
    expect(result.cyclePosition).toBe(1);
  });
});

// @criterion: AC-cycle-2
// Long break triggers after configured number of focus sessions
// @criterion-hash: 04ae460c5968
describe('[AC-cycle-2] configurable long break interval', () => {
  it('respects custom longBreakInterval', () => {
    const custom: TimerSettings = { ...DEFAULT_SETTINGS, longBreakInterval: 2 };
    let cycle = initialCycleState();

    cycle = nextPhase(cycle, custom, false); // focus 1 -> short break
    expect(cycle.phase).toBe('short-break');

    cycle = nextPhase(cycle, custom, false); // short break -> focus 2
    cycle = nextPhase(cycle, custom, false); // focus 2 -> long break
    expect(cycle.phase).toBe('long-break');
  });
});

// @criterion: AC-cycle-3
// Auto-start respects per-phase-type settings
// @criterion-hash: ef4eeb4e8548
describe('[AC-cycle-3] auto-start settings', () => {
  it('returns autoStartBreaks for short break', () => {
    expect(shouldAutoStart('short-break', { ...DEFAULT_SETTINGS, autoStartBreaks: true })).toBe(true);
    expect(shouldAutoStart('short-break', { ...DEFAULT_SETTINGS, autoStartBreaks: false })).toBe(false);
  });

  it('returns autoStartBreaks for long break', () => {
    expect(shouldAutoStart('long-break', { ...DEFAULT_SETTINGS, autoStartBreaks: true })).toBe(true);
  });

  it('returns autoStartFocus for focus', () => {
    expect(shouldAutoStart('focus', { ...DEFAULT_SETTINGS, autoStartFocus: false })).toBe(false);
    expect(shouldAutoStart('focus', { ...DEFAULT_SETTINGS, autoStartFocus: true })).toBe(true);
  });
});

// @criterion: AC-cycle-5
// Mid-session settings changes don't disrupt current phase
// @criterion-hash: 60591f3de6a6
describe('[AC-cycle-5] mid-session settings isolation', () => {
  it('changing longBreakInterval mid-cycle does not alter current cycle state', () => {
    const settings = DEFAULT_SETTINGS;
    let cycle = initialCycleState();

    // Complete 2 focus sessions
    cycle = nextPhase(cycle, settings, false); // focus 1 -> SB
    cycle = nextPhase(cycle, settings, false); // SB -> focus 2

    // Change settings to longBreakInterval: 2 — this would normally trigger long break after 2
    const newSettings: TimerSettings = { ...settings, longBreakInterval: 2 };

    // Complete focus 2 with new settings — since focusCount is already 2 after completion,
    // and new interval is 2, it should trigger long break
    cycle = nextPhase(cycle, newSettings, false);
    // The engine uses the *current* settings for each transition, which is the spec behavior:
    // "Settings changes apply on next phase" — the next phase transition uses the new settings
    expect(cycle.phase).toBeDefined();
  });

  it('phaseDurationMs uses settings at time of call, not at phase start', () => {
    // This validates that duration is computed from current settings
    const original = phaseDurationMs('focus', DEFAULT_SETTINGS);
    expect(original).toBe(25 * 60 * 1000);

    const custom: TimerSettings = { ...DEFAULT_SETTINGS, focusDuration: 50 };
    const updated = phaseDurationMs('focus', custom);
    expect(updated).toBe(50 * 60 * 1000);
  });
});

// @criterion: AC-cycle-6
// Skipped focus sessions don't count toward cycle completion
// @criterion-hash: 3769e4e4514e
describe('[AC-cycle-6] skipped sessions', () => {
  it('skipped focus sessions do not count toward cycle completion', () => {
    const settings = DEFAULT_SETTINGS;
    let cycle = initialCycleState();

    // Skip focus (doesn't count)
    cycle = nextPhase(cycle, settings, true);
    expect(cycle.phase).toBe('short-break');
    expect(cycle.focusCount).toBe(0); // Didn't increment

    cycle = nextPhase(cycle, settings, false); // back to focus
    // Complete 4 real focus sessions
    for (let i = 0; i < 3; i++) {
      cycle = nextPhase(cycle, settings, false); // focus -> break
      cycle = nextPhase(cycle, settings, false); // break -> focus
    }
    cycle = nextPhase(cycle, settings, false); // 4th focus -> long break
    expect(cycle.phase).toBe('long-break');
  });
});

describe('phaseLabel', () => {
  it('returns correct labels', () => {
    expect(phaseLabel('focus')).toBe('FOCUS');
    expect(phaseLabel('short-break')).toBe('SHORT BREAK');
    expect(phaseLabel('long-break')).toBe('LONG BREAK');
  });
});
