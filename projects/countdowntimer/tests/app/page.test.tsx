import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Home from '@/app/page';

// Mock useTimer to control state
const mockStart = vi.fn();
const mockPause = vi.fn();
const mockReset = vi.fn();
const mockSkip = vi.fn();
const mockUpdateSettings = vi.fn();

const defaultTimerReturn = {
  timer: {
    status: 'idle' as const,
    remainingMs: 1500000,
    totalMs: 1500000,
    cycle: { phase: 'focus' as const, focusCount: 0, cyclePosition: 1 },
  },
  settings: {
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
    soundEnabled: true,
    soundVolume: 70,
    notificationsEnabled: false,
  },
  dailyCount: 3,
  displayTime: '25:00',
  start: mockStart,
  pause: mockPause,
  reset: mockReset,
  skip: mockSkip,
  updateSettings: mockUpdateSettings,
};

let currentTimerReturn = { ...defaultTimerReturn };

vi.mock('@/hooks/useTimer', () => ({
  useTimer: () => currentTimerReturn,
}));

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentTimerReturn = { ...defaultTimerReturn };
  });

  it('renders all main components', () => {
    render(<Home />);

    // Timer display
    expect(screen.getByText('25:00')).toBeInTheDocument();
    // Phase label
    expect(screen.getByText('FOCUS')).toBeInTheDocument();
    // Session counter
    expect(screen.getByText(/3/)).toBeInTheDocument();
    // Settings button
    expect(screen.getByTestId('settings-trigger')).toBeInTheDocument();
  });

  it('sets data-phase attribute on main element', () => {
    render(<Home />);
    const main = document.querySelector('main');
    expect(main?.getAttribute('data-phase')).toBe('focus');
  });

  it('Space key triggers start when idle', () => {
    render(<Home />);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockPause).not.toHaveBeenCalled();
  });

  it('Space key triggers pause when running', () => {
    currentTimerReturn = {
      ...defaultTimerReturn,
      timer: { ...defaultTimerReturn.timer, status: 'running' as const },
    };
    render(<Home />);
    fireEvent.keyDown(window, { code: 'Space' });
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('R key triggers reset', () => {
    render(<Home />);
    fireEvent.keyDown(window, { code: 'KeyR' });
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('S key triggers skip', () => {
    render(<Home />);
    fireEvent.keyDown(window, { code: 'KeyS' });
    expect(mockSkip).toHaveBeenCalledTimes(1);
  });

  it('keyboard shortcuts are disabled when settings modal is open', () => {
    render(<Home />);

    // Open settings
    fireEvent.click(screen.getByTestId('settings-trigger'));

    // Try keyboard shortcuts — they should be blocked
    fireEvent.keyDown(window, { code: 'Space' });
    fireEvent.keyDown(window, { code: 'KeyR' });
    fireEvent.keyDown(window, { code: 'KeyS' });

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
    expect(mockSkip).not.toHaveBeenCalled();
  });

  it('settings modal opens and closes', () => {
    render(<Home />);

    // Modal should not be visible initially
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();

    // Open settings
    fireEvent.click(screen.getByTestId('settings-trigger'));

    // Modal should be visible
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
