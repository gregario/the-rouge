import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimerDisplay } from '@/components/TimerDisplay';

describe('TimerDisplay', () => {
  it('renders the time in MM:SS format', () => {
    render(<TimerDisplay phase="focus" displayTime="25:00" isRunning={false} />);
    expect(screen.getByTestId('timer-display')).toHaveTextContent('25:00');
  });

  it('renders the phase label for focus', () => {
    render(<TimerDisplay phase="focus" displayTime="25:00" isRunning={false} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('FOCUS');
  });

  it('renders the phase label for short break', () => {
    render(<TimerDisplay phase="short-break" displayTime="05:00" isRunning={false} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('SHORT BREAK');
  });

  it('renders the phase label for long break', () => {
    render(<TimerDisplay phase="long-break" displayTime="15:00" isRunning={false} />);
    expect(screen.getByTestId('phase-label')).toHaveTextContent('LONG BREAK');
  });

  it('has an accessible aria-label on the time element', () => {
    render(<TimerDisplay phase="focus" displayTime="12:34" isRunning={false} />);
    expect(screen.getByTestId('timer-display')).toHaveAttribute('aria-label', 'Timer: 12:34');
  });
});
