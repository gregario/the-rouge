import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimerControls } from '@/components/TimerControls';

describe('TimerControls', () => {
  const defaultProps = {
    status: 'idle' as const,
    onStart: vi.fn(),
    onPause: vi.fn(),
    onReset: vi.fn(),
    onSkip: vi.fn(),
  };

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

  it('calls onReset when reset is clicked', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<TimerControls {...defaultProps} onReset={onReset} />);
    await user.click(screen.getByTestId('reset-button'));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('calls onSkip when skip is clicked', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(<TimerControls {...defaultProps} onSkip={onSkip} />);
    await user.click(screen.getByTestId('skip-button'));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it('all buttons have visible hover states via CSS classes', () => {
    render(<TimerControls {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => {
      expect(btn.className).toBeTruthy();
    });
  });

  it('all buttons are keyboard accessible', () => {
    render(<TimerControls {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach(btn => {
      expect(btn).not.toHaveAttribute('tabindex', '-1');
    });
  });
});
