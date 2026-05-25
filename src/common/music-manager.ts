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
// Default crossfade duration (ms) for switching tracks. Sub-menus, game-over,
// and gameplay-entry all use this so transitions never hard-cut.
const TRACK_FADE_MS = 400;
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
  #introMusic: Phaser.Sound.BaseSound | null = null;
  #currentTrack: 'menu' | 'gameplay' | 'intro' | null = null;

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
    // Intro track — played by IntroScene and continues into MainMenuScene.
    if (!scene.cache.audio.has(ASSET_KEYS.INTRO_MUSIC)) {
      scene.load.audio(ASSET_KEYS.INTRO_MUSIC, 'assets/audio/teste.mp3');
    }
  }

  // ---------------------------------------------------------------------------
  // playIntro — start (or restart) the intro track. Used by IntroScene; the
  // returned Sound lets the caller tween its volume independently. Sound is
  // owned by MusicManager so it survives the IntroScene → MainMenuScene
  // transition without being destroyed on scene shutdown.
  //
  // The opts.seek lets IntroScene jump past the long lead-in; opts.rate is
  // used during calibration (PLAYBACK_RATE < 1). opts.loop = true by default
  // so the song continues looping on the main menu after the intro finishes.
  // ---------------------------------------------------------------------------
  playIntro(
    scene: Phaser.Scene,
    opts: { seek?: number; rate?: number; volume?: number; loop?: boolean } = {},
  ): Phaser.Sound.BaseSound | null {
    if (!scene.cache.audio.has(ASSET_KEYS.INTRO_MUSIC)) return null;
    this.#stopAll();
    if (this.#introMusic && (this.#introMusic as unknown as { pendingRemove?: boolean }).pendingRemove) {
      this.#introMusic = null;
    }
    if (!this.#introMusic) {
      this.#introMusic = scene.sound.add(ASSET_KEYS.INTRO_MUSIC, {
        loop: opts.loop ?? true,
        volume: opts.volume ?? 0,
      });
    }
    this.#currentTrack = 'intro';
    const playCfg: Phaser.Types.Sound.SoundConfig = {};
    if (typeof opts.seek === 'number') playCfg.seek = opts.seek;
    if (typeof opts.rate === 'number') playCfg.rate = opts.rate;
    this.#introMusic.play(playCfg);
    if (!this.#introMusic.isPlaying) {
      scene.sound.once('unlocked', () => {
        if (this.#currentTrack === 'intro' && this.#introMusic && !this.#introMusic.isPlaying) {
          this.#introMusic.play(playCfg);
        }
      });
    }
    return this.#introMusic;
  }

  // currentTrack — read-only accessor used by MainMenuScene to decide whether
  // to switch to menu music or let the intro track keep playing.
  currentTrack(): 'menu' | 'gameplay' | 'intro' | null {
    return this.#currentTrack;
  }

  // stopIntro — used by IntroScene when the player skips early. Does NOT
  // touch the menu/gameplay tracks.
  stopIntro(): void {
    if (this.#introMusic?.isPlaying) this.#introMusic.stop();
    if (this.#currentTrack === 'intro') this.#currentTrack = null;
  }

  // ---------------------------------------------------------------------------
  // playMenu -- crossfade to the menu track. No-op if already active.
  // opts.volume lets callers (e.g. LobbyScene) target the ducked level
  // directly during the fade-in, avoiding a hard-set-vs-tween conflict.
  // ---------------------------------------------------------------------------
  playMenu(scene: Phaser.Scene, opts: { volume?: number } = {}): void {
    if (this.#currentTrack === 'menu' && this.#menuMusic?.isPlaying) return;
    this.#crossfadeTo('menu', scene, opts.volume ?? MENU_VOLUME);
  }

  // ---------------------------------------------------------------------------
  // playGameplay -- crossfade to the gameplay track.
  // ---------------------------------------------------------------------------
  playGameplay(scene: Phaser.Scene): void {
    if (this.#currentTrack === 'gameplay' && this.#gameplayMusic?.isPlaying) return;
    this.#crossfadeTo('gameplay', scene, GAMEPLAY_VOLUME);
  }

  // ---------------------------------------------------------------------------
  // #crossfadeTo -- shared track-switch path. Fades the currently-playing
  // sound out, fades the target sound in, both over TRACK_FADE_MS. Handles
  // the Phaser quirk where scene-shutdown destroys a sound and leaves a
  // `pendingRemove` corpse in our slot (recreates the sound when detected).
  // ---------------------------------------------------------------------------
  #crossfadeTo(track: 'menu' | 'gameplay', scene: Phaser.Scene, targetVol: number): void {
    const assetKey = track === 'menu' ? ASSET_KEYS.MENU_MUSIC : ASSET_KEYS.GAMEPLAY_MUSIC;
    if (!scene.cache.audio.has(assetKey)) {
      console.warn('[MusicManager] crossfadeTo: audio not in cache', assetKey);
      return;
    }

    // Fade out + stop whichever track is currently audible.
    const prev = this.#activeSound();
    console.log('[MusicManager] crossfadeTo', track, 'prev=', this.#currentTrack, 'prevPlaying=', prev?.isPlaying);
    if (prev) {
      // Kill any in-flight volume tween on this sound so it can't fight us.
      scene.tweens.killTweensOf(prev);
      if (prev.isPlaying) {
        scene.tweens.add({
          targets: prev as unknown as { volume: number },
          volume: 0,
          duration: TRACK_FADE_MS,
          ease: 'Linear',
          onComplete: () => {
            if (prev.isPlaying) prev.stop();
          },
        });
      }
      // Hard-stop fallback — uses window.setTimeout (not scene.time) because
      // scene timers die when the scene shuts down, which would orphan the
      // previous track at low volume. The #activeSound() !== prev guard
      // prevents stopping if the same track was re-entered meanwhile.
      window.setTimeout(() => {
        if (this.#activeSound() !== prev && prev.isPlaying) {
          console.log('[MusicManager] hard-stop fallback firing for previous track');
          prev.stop();
        }
      }, TRACK_FADE_MS + 100);
    }

    // Refresh the target slot — drop dead refs from prior scene shutdowns.
    if (track === 'menu') {
      if (this.#menuMusic && (this.#menuMusic as unknown as { pendingRemove?: boolean }).pendingRemove) {
        this.#menuMusic = null;
      }
      if (!this.#menuMusic) {
        this.#menuMusic = scene.sound.add(ASSET_KEYS.MENU_MUSIC, { loop: true, volume: 0 });
      }
    } else {
      if (this.#gameplayMusic && (this.#gameplayMusic as unknown as { pendingRemove?: boolean }).pendingRemove) {
        this.#gameplayMusic = null;
      }
      if (!this.#gameplayMusic) {
        this.#gameplayMusic = scene.sound.add(ASSET_KEYS.GAMEPLAY_MUSIC, { loop: true, volume: 0 });
      }
    }
    const next = track === 'menu' ? this.#menuMusic! : this.#gameplayMusic!;

    this.#currentTrack = track;

    // Start the new track at volume 0 (so the fade-in has somewhere to come
    // from), then tween up to its target volume.
    (next as unknown as { volume: number }).volume = 0;
    this.#playOrDefer(scene, next, track);
    scene.tweens.killTweensOf(next);
    scene.tweens.add({
      targets: next as unknown as { volume: number },
      volume: targetVol,
      duration: TRACK_FADE_MS,
      ease: 'Linear',
    });
  }

  // Returns the sound matching the currently-tracked active slot, if any.
  #activeSound(): Phaser.Sound.BaseSound | null {
    if (this.#currentTrack === 'menu') return this.#menuMusic;
    if (this.#currentTrack === 'gameplay') return this.#gameplayMusic;
    if (this.#currentTrack === 'intro') return this.#introMusic;
    return null;
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
  #playOrDefer(scene: Phaser.Scene, sound: Phaser.Sound.BaseSound, track: 'menu' | 'gameplay' | 'intro'): void {
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
    if (this.#introMusic?.isPlaying) this.#introMusic.stop();
    this.#currentTrack = null;
  }
}
