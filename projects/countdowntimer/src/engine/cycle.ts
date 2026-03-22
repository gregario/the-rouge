import { CycleState, PhaseType, TimerSettings } from './types';

export function initialCycleState(): CycleState {
  return {
    phase: 'focus',
    focusCount: 0,
    cyclePosition: 1,
  };
}

export function phaseDurationMs(phase: PhaseType, settings: TimerSettings): number {
  switch (phase) {
    case 'focus':
      return settings.focusDuration * 60 * 1000;
    case 'short-break':
      return settings.shortBreakDuration * 60 * 1000;
    case 'long-break':
      return settings.longBreakDuration * 60 * 1000;
  }
}

export function nextPhase(cycle: CycleState, settings: TimerSettings, wasSkipped: boolean): CycleState {
  const { phase, focusCount, cyclePosition } = cycle;
  const interval = settings.longBreakInterval;

  if (phase === 'focus') {
    const newFocusCount = wasSkipped ? focusCount : focusCount + 1;

    if (newFocusCount >= interval) {
      return { phase: 'long-break', focusCount: newFocusCount, cyclePosition: cyclePosition + 1 };
    }
    return { phase: 'short-break', focusCount: newFocusCount, cyclePosition: cyclePosition + 1 };
  }

  if (phase === 'long-break') {
    return { phase: 'focus', focusCount: 0, cyclePosition: 1 };
  }

  // short-break -> focus
  return { phase: 'focus', focusCount, cyclePosition: cyclePosition + 1 };
}

export function shouldAutoStart(nextPhaseType: PhaseType, settings: TimerSettings): boolean {
  if (nextPhaseType === 'focus') return settings.autoStartFocus;
  return settings.autoStartBreaks;
}

export function phaseLabel(phase: PhaseType): string {
  switch (phase) {
    case 'focus': return 'FOCUS';
    case 'short-break': return 'SHORT BREAK';
    case 'long-break': return 'LONG BREAK';
  }
}
