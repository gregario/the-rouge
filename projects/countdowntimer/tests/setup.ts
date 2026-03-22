import '@testing-library/jest-dom/vitest';

class MockAudioContext {
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    };
  }
  get destination() {
    return {};
  }
  close() {
    return Promise.resolve();
  }
}

Object.defineProperty(globalThis, 'AudioContext', {
  value: MockAudioContext,
  writable: true,
});

Object.defineProperty(globalThis, 'Notification', {
  value: class MockNotification {
    static permission = 'default';
    static requestPermission = () => Promise.resolve('granted' as NotificationPermission);
    constructor() {}
  },
  writable: true,
});

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});
