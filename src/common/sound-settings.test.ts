import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadSoundVolume, saveSoundVolume } from './sound-settings';

// Node has no localStorage — stub it per test; the no-stub case doubles as the
// "storage unavailable" path.
function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as Storage);
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadSoundVolume', () => {
  it('returns the default (1) when localStorage is unavailable', () => {
    expect(loadSoundVolume()).toBe(1);
  });

  it('returns the default (1) when nothing was saved', () => {
    stubStorage();
    expect(loadSoundVolume()).toBe(1);
  });

  it('returns the persisted value', () => {
    stubStorage({ 'sound-volume': '0.4' });
    expect(loadSoundVolume()).toBe(0.4);
  });

  it('clamps persisted values into [0, 1]', () => {
    stubStorage({ 'sound-volume': '3.5' });
    expect(loadSoundVolume()).toBe(1);
    stubStorage({ 'sound-volume': '-2' });
    expect(loadSoundVolume()).toBe(0);
  });

  it('falls back to the default on non-numeric garbage', () => {
    stubStorage({ 'sound-volume': 'banana' });
    expect(loadSoundVolume()).toBe(1);
  });
});

describe('saveSoundVolume', () => {
  it('round-trips through localStorage', () => {
    stubStorage();
    saveSoundVolume(0.7);
    expect(loadSoundVolume()).toBe(0.7);
  });

  it('does not throw when localStorage is unavailable', () => {
    expect(() => saveSoundVolume(0.5)).not.toThrow();
  });

  it('does not throw when setItem throws (quota / private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage);
    expect(() => saveSoundVolume(0.5)).not.toThrow();
  });
});
