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
const GAMEPLAY_VOLUME = 0.05;

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
    if (this.#currentTrack === 'gameplay') return;
    this.#stopAll();
    if (!scene.cache.audio.has(ASSET_KEYS.GAMEPLAY_MUSIC)) return;

    if (!this.#gameplayMusic) {
      this.#gameplayMusic = scene.sound.add(ASSET_KEYS.GAMEPLAY_MUSIC, { loop: true, volume: GAMEPLAY_VOLUME });
    }
    this.#currentTrack = 'gameplay';
    this.#playOrDefer(scene, this.#gameplayMusic, 'gameplay');
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
