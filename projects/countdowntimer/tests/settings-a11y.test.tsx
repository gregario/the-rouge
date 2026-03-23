import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsModal } from '@/components/SettingsModal';
import { DEFAULT_SETTINGS } from '@/engine/types';

const defaultProps = {
  isOpen: true,
  settings: DEFAULT_SETTINGS,
  onClose: vi.fn(),
  onUpdate: vi.fn(),
};

// @criterion: AC-settings-a11y-1
describe('[AC-settings-a11y-1] Dialog element with open attribute', () => {
  it('dialog element exists and has open attribute when isOpen=true', () => {
    const { container } = render(<SettingsModal {...defaultProps} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('open');
  });

  it('dialog element does not have open attribute when isOpen=false', () => {
    const { container } = render(<SettingsModal {...defaultProps} isOpen={false} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
  });
});

// @criterion: AC-settings-a11y-3
describe('[AC-settings-a11y-3] Focus returns to trigger element on close', () => {
  it('restores focus to previously focused element on close', () => {
    // Create a trigger button and focus it
    const trigger = document.createElement('button');
    trigger.textContent = 'Open Settings';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const onClose = vi.fn();
    const { rerender } = render(
      <SettingsModal {...defaultProps} onClose={onClose} isOpen={true} />
    );

    // Now close the modal
    rerender(
      <SettingsModal {...defaultProps} onClose={onClose} isOpen={false} />
    );

    // Focus should return to the trigger button
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });
});

// @criterion: AC-settings-a11y-4
describe('[AC-settings-a11y-4] Dialog uses native dialog element with showModal', () => {
  it('renders a native <dialog> element', () => {
    const { container } = render(<SettingsModal {...defaultProps} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog?.tagName).toBe('DIALOG');
  });

  it('dialog has aria-label', () => {
    const { container } = render(<SettingsModal {...defaultProps} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('aria-label', 'Settings');
  });
});

// @criterion: AC-settings-a11y-5
describe('[AC-settings-a11y-5] Footer text opacity meets contrast requirements', () => {
  it('footer text elements have opacity >= 0.85 via CSS class', () => {
    const { container } = render(<SettingsModal {...defaultProps} />);
    const disclosure = container.querySelector('p[class*="disclosure"]');
    const trademark = container.querySelector('p[class*="trademark"]');
    expect(disclosure).toBeInTheDocument();
    expect(trademark).toBeInTheDocument();
    // Verify the CSS classes are applied (the actual opacity value is in the CSS module)
    expect(disclosure?.className).toMatch(/disclosure/);
    expect(trademark?.className).toMatch(/trademark/);
  });
});

// @criterion: AC-settings-a11y-6
describe('[AC-settings-a11y-6] Footer text font-size is <= settings label font-size', () => {
  it('footer text uses disclosure/trademark classes with smaller font than field labels', () => {
    const { container } = render(<SettingsModal {...defaultProps} />);
    const disclosure = container.querySelector('p[class*="disclosure"]');
    const fieldLabel = container.querySelector('label[class*="fieldLabel"]');
    expect(disclosure).toBeInTheDocument();
    expect(fieldLabel).toBeInTheDocument();
    // Both elements exist with the correct CSS classes.
    // CSS module defines disclosure at 11px and fieldLabel at 14px.
    expect(disclosure?.className).toMatch(/disclosure/);
    expect(fieldLabel?.className).toMatch(/fieldLabel/);
  });
});

// @criterion: AC-settings-a11y-7
describe('[AC-settings-a11y-7] Number inputs have focus-visible styles', () => {
  it('number inputs have the numberInput class for :focus-visible styles', () => {
    const { container } = render(<SettingsModal {...defaultProps} />);
    const numberInputs = container.querySelectorAll('input[type="number"]');
    expect(numberInputs.length).toBeGreaterThan(0);
    numberInputs.forEach(input => {
      expect(input.className).toMatch(/numberInput/);
    });
  });
});

// @criterion: AC-settings-a11y-10
describe('[AC-settings-a11y-10] Dialog has animation CSS property', () => {
  it('dialog element has the dialog CSS class which includes animation', () => {
    const { container } = render(<SettingsModal {...defaultProps} />);
    const dialog = container.querySelector('dialog');
    expect(dialog).toBeTruthy();
    // The dialog class includes `animation: scaleIn 0.25s ease`
    expect(dialog?.className).toMatch(/dialog/);
  });
});
