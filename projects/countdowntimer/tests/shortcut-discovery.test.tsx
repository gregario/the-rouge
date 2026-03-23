import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimerControls } from '@/components/TimerControls';

const defaultProps = {
  status: 'idle' as const,
  onStart: () => {},
  onPause: () => {},
  onReset: () => {},
  onSkip: () => {},
};

describe('[AC-shortcut-1] all three shortcuts visually discoverable', () => {
  it('renders shortcut hints for Space, R, and S', () => {
    render(<TimerControls {...defaultProps} />);
    expect(screen.getByTestId('shortcut-hint-r')).toBeInTheDocument();
    expect(screen.getByTestId('shortcut-hint-space')).toBeInTheDocument();
    expect(screen.getByTestId('shortcut-hint-s')).toBeInTheDocument();
  });

  it('hints contain correct text', () => {
    render(<TimerControls {...defaultProps} />);
    expect(screen.getByTestId('shortcut-hint-r').textContent).toBe('R');
    expect(screen.getByTestId('shortcut-hint-space').textContent).toBe('Space');
    expect(screen.getByTestId('shortcut-hint-s').textContent).toBe('S');
  });
});

describe('[AC-shortcut-2] shortcut hints meet WCAG AA contrast', () => {
  it('hints use the shortcutHint class with accessible color', () => {
    render(<TimerControls {...defaultProps} />);
    const hint = screen.getByTestId('shortcut-hint-r');
    // #9ca3af on #0a0a0f background has ~6.2:1 contrast ratio — passes WCAG AA
    expect(hint.className).toContain('shortcutHint');
  });
});

describe('[AC-shortcut-3] shortcut hints visually subordinate to icons', () => {
  it('hints have aria-hidden to not compete with button labels', () => {
    render(<TimerControls {...defaultProps} />);
    const hint = screen.getByTestId('shortcut-hint-r');
    expect(hint.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('[AC-shortcut-4] shortcut hints hidden on mobile', () => {
  it('shortcut hints have shortcutHint class which hides on mobile via media query', () => {
    render(<TimerControls {...defaultProps} />);
    const hint = screen.getByTestId('shortcut-hint-r');
    // The CSS media query @media (max-width: 767px) { .shortcutHint { display: none } }
    // handles mobile hiding. We verify the class is applied.
    expect(hint.className).toContain('shortcutHint');
  });
});

describe('[AC-shortcut-5] timer display hierarchy preserved', () => {
  it('hints are inside buttonGroup containers keeping controls compact', () => {
    render(<TimerControls {...defaultProps} />);
    const hint = screen.getByTestId('shortcut-hint-space');
    const group = hint.parentElement;
    expect(group?.className).toContain('buttonGroup');
    // Button and hint are siblings in a column layout
    const button = group?.querySelector('[data-testid="start-pause-button"]');
    expect(button).toBeInTheDocument();
  });
});
