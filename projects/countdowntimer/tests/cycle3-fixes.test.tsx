import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsModal } from '@/components/SettingsModal';
import { TimerDisplay } from '@/components/TimerDisplay';
import { DEFAULT_SETTINGS } from '@/engine/types';
import type { TimerStatus } from '@/engine/types';

// ---------------------------------------------------------------------------
// @criterion AC-c3-footer-contrast
// Settings modal footer text (.disclosure, .trademark) uses color #9ca3af
// ---------------------------------------------------------------------------
describe('[AC-c3-footer-contrast] footer text color', () => {
  const defaultProps = {
    isOpen: true,
    settings: DEFAULT_SETTINGS,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
  };

  it('footer disclosure element has data-testid for styling verification', () => {
    // The footer text elements should have data-testid attributes so
    // visual regression / computed-style tests can target them.
    // Current code does NOT add data-testid to .disclosure / .trademark.
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByTestId('footer-disclosure')).toBeInTheDocument();
  });

  it('footer trademark element has data-testid for styling verification', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByTestId('footer-trademark')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// @criterion AC-c3-notification-gating
// sendNotification is only called when notificationsEnabled is true
// ---------------------------------------------------------------------------
describe('[AC-c3-notification-gating] notification gating on phase complete', () => {
  it('does not call sendNotification when notificationsEnabled is false', async () => {
    // We need to test that handlePhaseComplete in useTimer gates on
    // notificationsEnabled. Currently it calls sendNotification unconditionally.
    const audioModule = await import('@/engine/audio');
    const sendSpy = vi.spyOn(audioModule, 'sendNotification');

    // Import useTimer after spy is in place
    const { useTimer } = await import('@/hooks/useTimer');
    const { renderHook, act } = await import('@testing-library/react');

    const { result } = renderHook(() => useTimer());

    // Ensure notifications are disabled (default is false)
    expect(result.current.settings.notificationsEnabled).toBe(false);

    // Skip the current phase — this triggers handlePhaseComplete
    act(() => {
      result.current.skip();
    });

    // sendNotification should NOT have been called because notificationsEnabled is false
    expect(sendSpy).not.toHaveBeenCalled();

    sendSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// @criterion AC-c3-favicon
// layout.tsx metadata includes icon configuration
// ---------------------------------------------------------------------------
describe('[AC-c3-favicon] layout metadata includes icons', () => {
  it('metadata object has icons property', async () => {
    // Import the metadata export from layout.tsx
    const layout = await import('@/app/layout');
    const metadata = (layout as Record<string, unknown>).metadata as Record<string, unknown>;
    expect(metadata).toBeDefined();
    expect(metadata.icons).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// @criterion AC-c3-datetime
// TimerDisplay <time> element has a datetime attribute
// ---------------------------------------------------------------------------
describe('[AC-c3-datetime] time element datetime attribute', () => {
  it('renders a <time> element with datetime attribute', () => {
    render(<TimerDisplay phase="focus" displayTime="25:00" isRunning={false} />);
    const timeEl = screen.getByTestId('timer-display');
    expect(timeEl.tagName).toBe('TIME');
    // The <time> element must have a machine-readable datetime attribute
    expect(timeEl).toHaveAttribute('datetime');
  });

  it('datetime attribute contains a valid duration for 25:00', () => {
    render(<TimerDisplay phase="focus" displayTime="25:00" isRunning={false} />);
    const timeEl = screen.getByTestId('timer-display');
    const dt = timeEl.getAttribute('datetime');
    // Must be present and in ISO 8601 duration format: PT25M00S or similar
    expect(dt).not.toBeNull();
    expect(dt!).toMatch(/PT\d+M\d+S/);
  });
});

// ---------------------------------------------------------------------------
// @criterion AC-c3-dead-code-cleanup
// 'completed' status should NOT exist in TimerStatus type
// ---------------------------------------------------------------------------
describe('[AC-c3-dead-code-cleanup] no completed status', () => {
  it('TimerStatus type does not include completed', () => {
    // We verify at runtime that assigning 'completed' to a variable of
    // TimerStatus-like usage is not supported by checking the engine's
    // actual type definition file content.
    // Since TypeScript types are erased at runtime, we read the source directly.
    const fs = require('fs');
    const path = require('path');
    const typesSource: string = fs.readFileSync(
      path.resolve(__dirname, '../src/engine/types.ts'),
      'utf-8'
    );

    // The TimerStatus type line should NOT contain 'completed'
    const timerStatusLine = typesSource
      .split('\n')
      .find((line: string) => line.includes('TimerStatus'));
    expect(timerStatusLine).toBeDefined();
    expect(timerStatusLine).not.toContain('completed');
  });
});

// ---------------------------------------------------------------------------
// @criterion AC-c3-settings-spacing
// Settings modal sections have adequate spacing (section padding > 12px)
// ---------------------------------------------------------------------------
describe('[AC-c3-settings-spacing] settings section spacing', () => {
  const defaultProps = {
    isOpen: true,
    settings: DEFAULT_SETTINGS,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
  };

  it('section elements have data-testid for spacing verification', () => {
    // Sections should have data-testid attributes so padding can be tested.
    // Current code does NOT add data-testid to <section> elements.
    const { container } = render(<SettingsModal {...defaultProps} />);
    const sections = container.querySelectorAll('[data-testid^="settings-section"]');
    expect(sections.length).toBeGreaterThanOrEqual(4);
  });
});
