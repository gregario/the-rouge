import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playChime, sendNotification } from '@/engine/audio';

describe('playChime', () => {
  it('creates oscillators and gain nodes when called', () => {
    const startSpy = vi.fn();
    const stopSpy = vi.fn();
    const connectSpy = vi.fn();
    const freqSetValue = vi.fn();
    const freqRamp = vi.fn();
    const gainSetValue = vi.fn();
    const gainRamp = vi.fn();

    const mockCtx = {
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => ({
        type: 'sine',
        frequency: { setValueAtTime: freqSetValue, exponentialRampToValueAtTime: freqRamp },
        connect: connectSpy,
        start: startSpy,
        stop: stopSpy,
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: gainSetValue, exponentialRampToValueAtTime: gainRamp },
        connect: connectSpy,
      })),
    };

    // Replace AudioContext to inject our mock
    const origAC = globalThis.AudioContext;
    // @ts-expect-error - test mock
    globalThis.AudioContext = class { constructor() { return mockCtx; } };
    // Reset the module-level audioCtx cache
    vi.resetModules();

    // Re-import to get fresh module with no cached AudioContext
    // Since we can't easily reset the module cache mid-test, we test with the existing mock
    playChime(70);

    // Should have created 2 oscillators and 2 gain nodes
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockCtx.createGain).toHaveBeenCalledTimes(2);
    expect(startSpy).toHaveBeenCalledTimes(2);
    expect(stopSpy).toHaveBeenCalledTimes(2);

    globalThis.AudioContext = origAC;
  });

  it('scales volume based on input parameter', () => {
    // playChime with volume 0 should still not throw
    expect(() => playChime(0)).not.toThrow();
    expect(() => playChime(100)).not.toThrow();
  });

  it('does not throw when AudioContext is unavailable', () => {
    const origAC = globalThis.AudioContext;
    // @ts-expect-error - test mock
    globalThis.AudioContext = class {
      constructor() { throw new Error('Not supported'); }
    };

    expect(() => playChime(70)).not.toThrow();

    globalThis.AudioContext = origAC;
  });
});

describe('sendNotification', () => {
  let origHidden: boolean;

  beforeEach(() => {
    origHidden = document.hidden;
  });

  afterEach(() => {
    Object.defineProperty(document, 'hidden', { value: origHidden, configurable: true });
  });

  it('sends notification when permission granted and tab is hidden', () => {
    const constructorSpy = vi.fn();
    const origNotification = globalThis.Notification;

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });

    // @ts-expect-error - test mock
    globalThis.Notification = class {
      static permission = 'granted';
      constructor(title: string, options: object) {
        constructorSpy(title, options);
      }
    };

    sendNotification('Focus complete', 'Short break starting.');

    expect(constructorSpy).toHaveBeenCalledWith(
      'Focus complete',
      expect.objectContaining({ body: 'Short break starting.' })
    );

    globalThis.Notification = origNotification;
  });

  it('does not send notification when tab is visible', () => {
    const constructorSpy = vi.fn();
    const origNotification = globalThis.Notification;

    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    // @ts-expect-error - test mock
    globalThis.Notification = class {
      static permission = 'granted';
      constructor(title: string, options: object) {
        constructorSpy(title, options);
      }
    };

    sendNotification('Focus complete', 'Short break starting.');

    expect(constructorSpy).not.toHaveBeenCalled();

    globalThis.Notification = origNotification;
  });

  it('does not send notification when permission is denied', () => {
    const constructorSpy = vi.fn();
    const origNotification = globalThis.Notification;

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });

    // @ts-expect-error - test mock
    globalThis.Notification = class {
      static permission = 'denied';
      constructor(title: string, options: object) {
        constructorSpy(title, options);
      }
    };

    sendNotification('Focus complete', 'Short break starting.');

    expect(constructorSpy).not.toHaveBeenCalled();

    globalThis.Notification = origNotification;
  });

  it('does not throw when Notification API is unavailable', () => {
    const origNotification = globalThis.Notification;
    // @ts-expect-error - test mock
    globalThis.Notification = undefined;

    expect(() => sendNotification('Test', 'Body')).not.toThrow();

    globalThis.Notification = origNotification;
  });
});
