import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '@/components/SettingsModal';
import { DEFAULT_SETTINGS } from '@/engine/types';

describe('SettingsModal', () => {
  const defaultProps = {
    isOpen: true,
    settings: DEFAULT_SETTINGS,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
  };

  it('renders when open', () => {
    render(<SettingsModal {...defaultProps} />);
    expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<SettingsModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('has all 8 settings fields', () => {
    render(<SettingsModal {...defaultProps} />);
    // Timing: 4 number inputs
    expect(screen.getByLabelText('Focus duration')).toBeInTheDocument();
    expect(screen.getByLabelText('Short break')).toBeInTheDocument();
    expect(screen.getByLabelText('Long break')).toBeInTheDocument();
    expect(screen.getByLabelText('Long break interval')).toBeInTheDocument();
    // Behavior: 2 toggles
    expect(screen.getByLabelText('Auto-start breaks')).toBeInTheDocument();
    expect(screen.getByLabelText('Auto-start focus')).toBeInTheDocument();
    // Sound: 1 toggle
    expect(screen.getByLabelText('Sound')).toBeInTheDocument();
    // Notifications: 1 toggle
    expect(screen.getByLabelText('Browser notifications')).toBeInTheDocument();
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on overlay click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByTestId('settings-modal'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes on X button click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByTestId('settings-close'));
    expect(onClose).toHaveBeenCalledOnce();
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

  it('enforces min/max constraints on number inputs', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<SettingsModal {...defaultProps} onUpdate={onUpdate} />);
    const focusInput = screen.getByLabelText('Focus duration');
    await user.clear(focusInput);
    await user.type(focusInput, '150');
    // The last call should have clamped to 99
    const lastCall = onUpdate.mock.calls[onUpdate.mock.calls.length - 1];
    expect(lastCall[0].focusDuration).toBeLessThanOrEqual(99);
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
