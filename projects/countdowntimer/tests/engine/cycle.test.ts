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

describe('nextPhase', () => {
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

  it('skipped focus sessions do not count toward cycle completion', () => {
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

  it('respects custom longBreakInterval', () => {
    const custom: TimerSettings = { ...settings, longBreakInterval: 2 };
    let cycle = initialCycleState();

    cycle = nextPhase(cycle, custom, false); // focus 1 -> short break
    expect(cycle.phase).toBe('short-break');

    cycle = nextPhase(cycle, custom, false); // short break -> focus 2
    cycle = nextPhase(cycle, custom, false); // focus 2 -> long break
    expect(cycle.phase).toBe('long-break');
  });
});

describe('shouldAutoStart', () => {
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

describe('phaseLabel', () => {
  it('returns correct labels', () => {
    expect(phaseLabel('focus')).toBe('FOCUS');
    expect(phaseLabel('short-break')).toBe('SHORT BREAK');
    expect(phaseLabel('long-break')).toBe('LONG BREAK');
  });
});
