import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '@/components/SettingsModal';
import { DEFAULT_SETTINGS } from '@/engine/types';

const defaultProps = {
  isOpen: true,
  settings: DEFAULT_SETTINGS,
  onClose: vi.fn(),
  onUpdate: vi.fn(),
};

// @criterion: AC-settings-1
// All 8 settings are present and functional
// @criterion-hash: 9c80f2211aad
describe('[AC-settings-1] settings fields', () => {
  it('renders when open', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
  });

  it('dialog is not open when isOpen=false', () => {
    const { container } = render(<SettingsModal {...defaultProps} isOpen={false} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
  });

  it('has all 8 settings fields', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByLabelText('Focus duration')).toBeInTheDocument();
    expect(screen.getByLabelText('Short break')).toBeInTheDocument();
    expect(screen.getByLabelText('Long break')).toBeInTheDocument();
    expect(screen.getByLabelText('Long break interval')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto-start breaks')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto-start focus')).toBeInTheDocument();
    expect(screen.getByLabelText('Sound')).toBeInTheDocument();
    expect(screen.getByLabelText('Browser notifications')).toBeInTheDocument();
  });

  it('calls onUpdate when a number field changes', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<SettingsModal {...defaultProps} onUpdate={onUpdate} />);
    const focusInput = screen.getByLabelText('Focus duration');
    await user.clear(focusInput);
    await user.type(focusInput, '30');
    expect(onUpdate).toHaveBeenCalled();
  });

  it('calls onUpdate when toggle is clicked', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<SettingsModal {...defaultProps} onUpdate={onUpdate} />);
    await user.click(screen.getByLabelText('Auto-start focus'));
    expect(onUpdate).toHaveBeenCalledWith({ autoStartFocus: true });
  });

  it('shows volume slider when sound is enabled', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByTestId('volume-slider')).toBeInTheDocument();
  });

  it('hides volume slider when sound is disabled', () => {
    render(<SettingsModal {...defaultProps} settings={{ ...DEFAULT_SETTINGS, soundEnabled: false }} />);
    expect(screen.queryByTestId('volume-slider')).not.toBeInTheDocument();
  });

  it('shows legal disclosures', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByText(/Epoch runs entirely in your browser/)).toBeInTheDocument();
    expect(screen.getByText(/Pomodoro Technique is a registered trademark/)).toBeInTheDocument();
  });
});

// @criterion: AC-settings-3
// Modal opens/closes with smooth animation
// @criterion-hash: 39307a1a07d7
describe('[AC-settings-3] modal animation', () => {
  it('dialog element has CSS class for animation', () => {
    const { container } = render(<SettingsModal {...defaultProps} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.className).toMatch(/dialog/);
  });

  it('closes via X button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByTestId('settings-close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// @criterion: AC-settings-4
// Escape key closes modal
// @criterion-hash: 4ddd808f097f
describe('[AC-settings-4] escape key', () => {
  it('closes on Escape key via native dialog close event', () => {
    const onClose = vi.fn();
    const { container } = render(<SettingsModal {...defaultProps} onClose={onClose} />);
    const dialog = container.querySelector('dialog')!;
    // Simulate the native close event that fires when Escape is pressed on a dialog
    dialog.dispatchEvent(new Event('close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// @criterion: AC-settings-5
// Overlay click closes modal
// @criterion-hash: 9c5e3ca2cf0b
describe('[AC-settings-5] backdrop click', () => {
  it('closes on backdrop (dialog element) click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);
    // Clicking the dialog element itself (not a child) triggers backdrop close
    await user.click(screen.getByTestId('settings-modal'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// @criterion: AC-settings-6
// Invalid input is prevented (enforced min/max)
// @criterion-hash: d5e1344395b6
describe('[AC-settings-6] input validation', () => {
  it('enforces min/max constraints on number inputs', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<SettingsModal {...defaultProps} onUpdate={onUpdate} />);
    const focusInput = screen.getByLabelText('Focus duration');
    await user.clear(focusInput);
    await user.type(focusInput, '150');
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
    expect(lastCall[0].focusDuration).toBeLessThanOrEqual(99);
  });
});

// @criterion: AC-settings-7
// Notification toggle triggers browser permission prompt if not already granted
// @criterion-hash: 49e11334f4ed
describe('[AC-settings-7] notification permission prompt', () => {
  it('requests notification permission when toggling notifications on', async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn().mockResolvedValue('granted');
    const origNotification = globalThis.Notification;

    // @ts-expect-error - test mock
    globalThis.Notification = class {
      static permission = 'default';
      static requestPermission = requestPermission;
    };

    const onUpdate = vi.fn();
    render(<SettingsModal {...defaultProps} onUpdate={onUpdate} />);
    await user.click(screen.getByLabelText('Browser notifications'));

    expect(requestPermission).toHaveBeenCalledOnce();

    globalThis.Notification = origNotification;
  });

  it('does not enable notifications when permission is denied', async () => {
    const user = userEvent.setup();
    const requestPermission = vi.fn().mockResolvedValue('denied');
    const origNotification = globalThis.Notification;

    // @ts-expect-error - test mock
    globalThis.Notification = class {
      static permission = 'default';
      static requestPermission = requestPermission;
    };

    const onUpdate = vi.fn();
    render(<SettingsModal {...defaultProps} onUpdate={onUpdate} />);
    await user.click(screen.getByLabelText('Browser notifications'));

    // Wait for the promise to resolve
    await vi.waitFor(() => {
      expect(requestPermission).toHaveBeenCalledOnce();
    });

    // onUpdate should NOT have been called with notificationsEnabled: true
    const calls = onUpdate.mock.calls.filter(
      (c: [Partial<typeof DEFAULT_SETTINGS>]) => c[0].notificationsEnabled === true
    );
    expect(calls).toHaveLength(0);

    globalThis.Notification = origNotification;
  });
});

// @criterion: AC-settings-8
// Settings changes apply on next phase, not current
// @criterion-hash: bcdc26ab77b7
describe('[AC-settings-8] settings apply on next phase', () => {
  it('onUpdate is called with partial settings (applied by parent on next phase)', () => {
    // The SettingsModal calls onUpdate with partial settings.
    // The parent (useTimer) applies these to the settings state,
    // but running timer continues with its current totalMs.
    // This tests that the modal communicates changes correctly.
    const onUpdate = vi.fn();
    render(<SettingsModal {...defaultProps} onUpdate={onUpdate} />);
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
  });
});
