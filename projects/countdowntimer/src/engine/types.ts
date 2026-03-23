export type PhaseType = 'focus' | 'short-break' | 'long-break';

export type TimerStatus = 'idle' | 'running' | 'paused';

export interface TimerSettings {
  focusDuration: number;       // minutes
  shortBreakDuration: number;  // minutes
  longBreakDuration: number;   // minutes
  longBreakInterval: number;   // number of focus sessions before long break
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  soundVolume: number;         // 0-100
  notificationsEnabled: boolean;
}

export const DEFAULT_SETTINGS: TimerSettings = {
  focusDuration: 25,
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  soundEnabled: true,
  soundVolume: 70,
  notificationsEnabled: false,
};

export interface CycleState {
  phase: PhaseType;
  focusCount: number;          // completed focus sessions in current cycle (0 to longBreakInterval)
  cyclePosition: number;       // 1-based position in the cycle
}

export interface TimerState {
  status: TimerStatus;
  remainingMs: number;
  totalMs: number;
  cycle: CycleState;
}
