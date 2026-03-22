import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CycleIndicator } from '@/components/CycleIndicator';
import { DEFAULT_SETTINGS } from '@/engine/types';

describe('CycleIndicator', () => {
  it('renders correct number of dots based on longBreakInterval', () => {
    const cycle = { phase: 'focus' as const, focusCount: 0, cyclePosition: 1 };
    render(<CycleIndicator cycle={cycle} settings={DEFAULT_SETTINGS} />);
    const indicator = screen.getByTestId('cycle-indicator');
    expect(indicator.children).toHaveLength(4); // default longBreakInterval
  });

  it('fills dots for completed focus sessions', () => {
    const cycle = { phase: 'short-break' as const, focusCount: 2, cyclePosition: 4 };
    render(<CycleIndicator cycle={cycle} settings={DEFAULT_SETTINGS} />);
    const dots = screen.getByTestId('cycle-indicator').children;
    expect(dots[0]).toHaveAttribute('aria-label', 'Session 1: completed');
    expect(dots[1]).toHaveAttribute('aria-label', 'Session 2: completed');
    expect(dots[2]).toHaveAttribute('aria-label', 'Session 3: remaining');
    expect(dots[3]).toHaveAttribute('aria-label', 'Session 4: remaining');
  });

  it('adjusts to custom longBreakInterval', () => {
    const cycle = { phase: 'focus' as const, focusCount: 0, cyclePosition: 1 };
    const settings = { ...DEFAULT_SETTINGS, longBreakInterval: 6 };
    render(<CycleIndicator cycle={cycle} settings={settings} />);
    expect(screen.getByTestId('cycle-indicator').children).toHaveLength(6);
  });
});
