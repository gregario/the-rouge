import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import { loadSettings } from '@/engine/storage';
import { playChime } from '@/engine/audio';

// -- ErrorBoundary tests --

function ThrowingChild(): React.JSX.Element {
  throw new Error('Test render error');
}

describe('[AC-robust-1] error boundary catches render errors', () => {
  it('shows fallback with data-testid when child throws', () => {
    // Suppress React error boundary console.error noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('[AC-robust-2] error boundary fallback has reload button', () => {
  it('renders a Reload button in the fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe('[AC-robust-3] error boundary renders children when no error', () => {
  it('renders children normally', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Hello</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.queryByTestId('error-boundary-fallback')).not.toBeInTheDocument();
  });
});

// -- localStorage validation tests --

describe('[AC-robust-4] loadSettings with corrupted string returns default', () => {
  beforeEach(() => localStorage.clear());

  it('returns default focusDuration when stored value is a string', () => {
    localStorage.setItem('epoch_settings', JSON.stringify({ focusDuration: 'abc' }));
    const settings = loadSettings();
    expect(settings.focusDuration).toBe(25);
  });
});

describe('[AC-robust-5] loadSettings clamps out-of-range numbers', () => {
  beforeEach(() => localStorage.clear());

  it('clamps focusDuration 999 to 99', () => {
    localStorage.setItem('epoch_settings', JSON.stringify({ focusDuration: 999 }));
    const settings = loadSettings();
    expect(settings.focusDuration).toBe(99);
  });
});

describe('[AC-robust-6] loadSettings fills defaults for missing fields', () => {
  beforeEach(() => localStorage.clear());

  it('fills defaults when only soundVolume is provided', () => {
    localStorage.setItem('epoch_settings', JSON.stringify({ soundVolume: 50 }));
    const settings = loadSettings();
    expect(settings.soundVolume).toBe(50);
    expect(settings.focusDuration).toBe(25);
    expect(settings.shortBreakDuration).toBe(5);
    expect(settings.longBreakDuration).toBe(15);
    expect(settings.autoStartBreaks).toBe(true);
  });

  it('returns default for invalid boolean field', () => {
    localStorage.setItem('epoch_settings', JSON.stringify({ autoStartBreaks: 'yes' }));
    const settings = loadSettings();
    expect(settings.autoStartBreaks).toBe(true);
  });
});

// -- AudioContext resume tests --

describe('[AC-robust-7] playChime resumes AudioContext', () => {
  it('calls resume() on the AudioContext before scheduling', async () => {
    const resumeSpy = vi.fn().mockResolvedValue(undefined);

    // Replace AudioContext with a spy-enabled version
    const OriginalAudioContext = globalThis.AudioContext;
    globalThis.AudioContext = class SpyAudioContext extends OriginalAudioContext {
      resume = resumeSpy;
    } as unknown as typeof AudioContext;

    // Reset the cached audioCtx by re-importing fresh module
    vi.resetModules();
    const { playChime: freshPlayChime } = await import('@/engine/audio');

    await freshPlayChime(70);
    expect(resumeSpy).toHaveBeenCalled();

    globalThis.AudioContext = OriginalAudioContext;
  });
});

describe('[AC-robust-8] playChime is async and returns a Promise', () => {
  it('returns a promise', () => {
    const result = playChime(70);
    expect(result).toBeInstanceOf(Promise);
  });
});
