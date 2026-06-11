// ---------------------------------------------------------------------------
// sound-settings
// ---------------------------------------------------------------------------
// Persists the player's master volume (Phaser SoundManager.volume, 0..1) in
// localStorage. Applied once at boot (main.ts) and updated by the in-game
// pause menu (PauseMenuScene). The manager volume multiplies every per-sound
// volume, so MusicManager's per-track levels keep their relative balance.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'sound-volume';
const DEFAULT_VOLUME = 1;

// localStorage can be unavailable (node test env) or throw (private browsing,
// storage disabled) — always go through this guard.
function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSoundVolume(): number {
  const raw = safeStorage()?.getItem(STORAGE_KEY);
  if (raw === null || raw === undefined) return DEFAULT_VOLUME;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, value));
}

export function saveSoundVolume(volume: number): void {
  try {
    safeStorage()?.setItem(STORAGE_KEY, String(volume));
  } catch {
    // Quota exceeded / storage disabled — losing persistence is acceptable.
  }
}
