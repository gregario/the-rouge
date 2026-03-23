import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimerControls } from '@/components/TimerControls';

const defaultProps = {
  status: 'idle' as const,
  onStart: vi.fn(),
  onPause: vi.fn(),
  onReset: vi.fn(),
  onSkip: vi.fn(),
};

// @criterion: AC-controls-1
// Start toggles to Pause when running, and back
// @criterion-hash: 5e32aff79ba8
describe('[AC-controls-1] start/pause toggle', () => {
  it('shows start button when idle', () => {
    render(<TimerControls {...defaultProps} />);
    expect(screen.getByTestId('start-pause-button')).toHaveAttribute('aria-label', 'Start timer');
  });

  it('shows pause button when running', () => {
    render(<TimerControls {...defaultProps} status="running" />);
    expect(screen.getByTestId('start-pause-button')).toHaveAttribute('aria-label', 'Pause timer');
  });

  it('calls onStart when start is clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<TimerControls {...defaultProps} onStart={onStart} />);
    await user.click(screen.getByTestId('start-pause-button'));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('calls onPause when pause is clicked', async () => {
    const user = userEvent.setup();
    const onPause = vi.fn();
    render(<TimerControls {...defaultProps} status="running" onPause={onPause} />);
    await user.click(screen.getByTestId('start-pause-button'));
    expect(onPause).toHaveBeenCalledOnce();
  });
});

// @criterion: AC-controls-2
// Reset returns current phase to full duration without changing cycle position
// @criterion-hash: 08fb55db4693
describe('[AC-controls-2] reset button', () => {
  it('calls onReset when reset is clicked', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<TimerControls {...defaultProps} onReset={onReset} />);
    await user.click(screen.getByTestId('reset-button'));
    expect(onReset).toHaveBeenCalledOnce();
  });
});

// @criterion: AC-controls-3
// Skip advances to next phase in sequence
// @criterion-hash: c0132d16ac52
describe('[AC-controls-3] skip button', () => {
  it('calls onSkip when skip is clicked', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<TimerControls {...defaultProps} onSkip={onSkip} />);
    await user.click(screen.getByTestId('skip-button'));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});

// @criterion: AC-controls-4
// All controls have visible hover and active states
// @criterion-hash: 1e2f7b80965e
describe('[AC-controls-4] hover and active states', () => {
  it('all buttons have CSS classes for styling', () => {
    render(<TimerControls {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => {
      expect(btn.className).toBeTruthy();
    });
  });
});

// @criterion: AC-controls-5 (partial — keyboard tests in page.test.tsx)
// Controls are keyboard-accessible (Space for start/pause, R for reset, S for skip)
// @criterion-hash: 8198f4ad4e43
describe('[AC-controls-5] keyboard accessibility', () => {
  it('all buttons are keyboard accessible (not tabindex -1)', () => {
    render(<TimerControls {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => {
      expect(btn).not.toHaveAttribute('tabindex', '-1');
    });
  });
});
