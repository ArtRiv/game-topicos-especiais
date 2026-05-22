import * as Phaser from 'phaser';
import { ASSET_KEYS } from './assets';

// ---------------------------------------------------------------------------
// MusicManager
// ---------------------------------------------------------------------------
// Singleton that owns the two global background tracks:
//   MENU_MUSIC     -- plays in all non-gameplay screens (menu, lobby, stubs, game-over)
//   GAMEPLAY_MUSIC -- plays during the active GameScene session
//
// KNOWN PITFALL AND FIX:
//
//   Browsers block AudioContext.resume() before the first user gesture
//   (autoplay policy). Calling sound.play() from create() silently no-ops.
//   We fix this by listening to the SoundManager's 'unlocked' event and
//   retrying playback on the first interaction.
// ---------------------------------------------------------------------------

const MENU_VOLUME = 0.05;
// LOBBY_VOLUME is the ducked level used while LobbyScene is active (D-13).
// Plan 03 will call setMenuVolume(LOBBY_VOLUME) on lobby entry; this constant
// is declared here so the value lives next to MENU_VOLUME for easy tuning.
const LOBBY_VOLUME = 0.03;
const GAMEPLAY_VOLUME = 0.05;

// GAMEPLAY_MUSIC_DROP_MS = offset (ms) from gameplay track start to the
// climax/drop. LoadingScene computes its play-start delay as
//   delay = LOADING_TOTAL + COUNTDOWN_TOTAL - GAMEPLAY_MUSIC_DROP_MS
// so the drop lands at COUNTDOWN-end. Tune by ear (D-14).
export const GAMEPLAY_MUSIC_DROP_MS = 4000;

// Re-export LOBBY_VOLUME so Plan 03 can reference the canonical value without
// duplicating it inside lobby-scene.ts.
export { LOBBY_VOLUME };

export class MusicManager {
  static #instance: MusicManager | null = null;

  #menuMusic: Phaser.Sound.BaseSound | null = null;
  #gameplayMusic: Phaser.Sound.BaseSound | null = null;
  #currentTrack: 'menu' | 'gameplay' | null = null;

  private constructor() {}

  static get instance(): MusicManager {
    if (!MusicManager.#instance) {
      MusicManager.#instance = new MusicManager();
    }
    return MusicManager.#instance;
  }

  // ---------------------------------------------------------------------------
  // loadTracks -- call from a scene's preload() to queue both audio files.
  // Idempotent: subsequent calls skip already-cached files.
  // ---------------------------------------------------------------------------
  loadTracks(scene: Phaser.Scene): void {
    if (!scene.cache.audio.has(ASSET_KEYS.MENU_MUSIC)) {
      scene.load.audio(ASSET_KEYS.MENU_MUSIC, 'assets/audio/menu_music.ogg');
    }
    if (!scene.cache.audio.has(ASSET_KEYS.GAMEPLAY_MUSIC)) {
      scene.load.audio(ASSET_KEYS.GAMEPLAY_MUSIC, 'assets/audio/gameplay_music.ogg');
    }
  }

  // ---------------------------------------------------------------------------
  // playMenu -- switch to (or keep) the menu track.
  // No-op if the menu track is already the active one.
  // ---------------------------------------------------------------------------
  playMenu(scene: Phaser.Scene): void {
    if (this.#currentTrack === 'menu') return;
    this.#stopAll();
    if (!scene.cache.audio.has(ASSET_KEYS.MENU_MUSIC)) return;

    if (!this.#menuMusic) {
      this.#menuMusic = scene.sound.add(ASSET_KEYS.MENU_MUSIC, { loop: true, volume: MENU_VOLUME });
    }
    this.#currentTrack = 'menu';
    this.#playOrDefer(scene, this.#menuMusic, 'menu');
  }

  // ---------------------------------------------------------------------------
  // playGameplay -- switch to the gameplay track.
  // Called from GameScene.create().
  // ---------------------------------------------------------------------------
  playGameplay(scene: Phaser.Scene): void {
    // If we already think gameplay is the active track AND it's still actually playing,
    // skip — this is the room-transition hot path. Without the isPlaying re-check, a
    // previously-destroyed Sound instance (Phaser kills scene-bound sounds on shutdown)
    // would leave us in a "thinks it's playing but silent" state on the next room.
    if (this.#currentTrack === 'gameplay' && this.#gameplayMusic?.isPlaying) return;
    if (!scene.cache.audio.has(ASSET_KEYS.GAMEPLAY_MUSIC)) return;

    // Only stop the menu track; do NOT stop a gameplay sound that's already playing
    // through a room transition (prevents the "music restarts on room change" bug).
    if (this.#menuMusic?.isPlaying) this.#menuMusic.stop();

    // If the cached Sound was destroyed by the prior scene shutdown, drop the dead ref
    // and re-add against the new scene's sound manager.
    if (this.#gameplayMusic && (this.#gameplayMusic as unknown as { pendingRemove?: boolean }).pendingRemove) {
      this.#gameplayMusic = null;
    }
    if (!this.#gameplayMusic) {
      this.#gameplayMusic = scene.sound.add(ASSET_KEYS.GAMEPLAY_MUSIC, { loop: true, volume: GAMEPLAY_VOLUME });
    }
    this.#currentTrack = 'gameplay';
    if (!this.#gameplayMusic.isPlaying) {
      this.#playOrDefer(scene, this.#gameplayMusic, 'gameplay');
    }
  }

  // ---------------------------------------------------------------------------
  // setMenuVolume -- adjust the menu track's volume in place (D-13).
  // Used by LobbyScene to duck menu music to LOBBY_VOLUME (0.03), and by
  // MainMenuScene to restore MENU_VOLUME (0.05) on back-nav from Lobby.
  // No-op if the menu track has not been initialised yet.
  // ---------------------------------------------------------------------------
  setMenuVolume(vol: number): void {
    if (this.#menuMusic) {
      (this.#menuMusic as unknown as { setVolume(v: number): void }).setVolume(vol);
    }
  }

  // ---------------------------------------------------------------------------
  // stopMenu -- hard-stop the menu track (no fade). Used by the Lobby->LOADING
  // transition after the 400ms camera fade completes (D-09).
  // ---------------------------------------------------------------------------
  stopMenu(): void {
    if (this.#menuMusic?.isPlaying) this.#menuMusic.stop();
    if (this.#currentTrack === 'menu') this.#currentTrack = null;
  }

  // ---------------------------------------------------------------------------
  // tweenMenuVolume -- tween the menu track's volume property over durationMs.
  // Returns the created tween (or null if menu music isn't initialised) so the
  // caller can chain an onComplete (e.g. Plan 03's 400ms duck then stopMenu).
  // ---------------------------------------------------------------------------
  tweenMenuVolume(scene: Phaser.Scene, toVol: number, durationMs: number): Phaser.Tweens.Tween | null {
    if (!this.#menuMusic) return null;
    const target = this.#menuMusic as unknown as { volume: number };
    return scene.tweens.add({ targets: target, volume: toVol, duration: durationMs, ease: 'Linear' });
  }

  // ---------------------------------------------------------------------------
  // #playOrDefer -- FIX 2: handles the browser autoplay policy.
  //
  // sound.play() is a no-op when the WebAudio context is still suspended
  // (before the first user gesture). We call play() immediately; if the sound
  // is still not playing afterwards, we register a one-time 'unlocked' listener
  // on the SoundManager so playback begins the moment the user first interacts.
  //
  // The `track` guard in the callback prevents a stale listener from starting
  // the wrong track when the current track has already changed.
  // ---------------------------------------------------------------------------
  #playOrDefer(scene: Phaser.Scene, sound: Phaser.Sound.BaseSound, track: 'menu' | 'gameplay'): void {
    sound.play();

    if (!sound.isPlaying) {
      // AudioContext was locked -- defer to first user gesture.
      scene.sound.once('unlocked', () => {
        if (this.#currentTrack === track && !sound.isPlaying) {
          sound.play();
        }
      });
    }
  }

  #stopAll(): void {
    if (this.#menuMusic?.isPlaying) this.#menuMusic.stop();
    if (this.#gameplayMusic?.isPlaying) this.#gameplayMusic.stop();
    this.#currentTrack = null;
  }
}
