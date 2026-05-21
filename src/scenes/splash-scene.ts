import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { MusicManager } from '../common/music-manager';

// BitmapText atlas key (Phase 9.1-04 standard). Press_Start_2P is loaded from
// assets/fonts/Press_Start_2P/press_start_white-2.{png,xml}.
const BMFONT_KEY = 'press_start_2p';

export class SplashScene extends Phaser.Scene {
  #transitioning = false;

  constructor() {
    super({ key: SCENE_KEYS.SPLASH_SCENE });
  }

  public preload(): void {
    // BitmapText atlas is loaded by PreloadScene in the canonical flow, but
    // SplashScene boots FIRST (main.ts) so we must self-load it here. The
    // cache guard makes this idempotent — PreloadScene's later load is a no-op.
    if (!this.cache.bitmapFont.has(BMFONT_KEY)) {
      this.load.bitmapFont(
        BMFONT_KEY,
        'assets/fonts/Press_Start_2P/press_start_white-2.png',
        'assets/fonts/Press_Start_2P/press_start_white-2.xml',
      );
    }
    MusicManager.instance.loadTracks(this);
  }

  public create(): void {
    const { width, height } = this.scale;
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);

    // Pure black background.
    this.add.rectangle(0, 0, width, height, 0x000000, 1).setOrigin(0);

    // BitmapText replaces `this.add.text(...).setResolution(2)` from UI branch
    // (D-02 CONVERT). Copy is locked verbatim from UI-SPEC §Splash Scene.
    const prompt = this.add
      .bitmapText(cx, cy, BMFONT_KEY, 'PRESS ANYTHING TO\nGET HIGH IN THE\nFANTASY', 8)
      .setOrigin(0.5)
      .setTint(0xffffff)
      .setCenterAlign();

    // Blink α 0.3 ↔ 1.0 over 800ms per cycle, Sine.InOut (UI-SPEC §Splash Idle).
    // yoyo:true means the 400ms tween out + 400ms tween back = 800ms cycle.
    this.tweens.add({
      targets: prompt,
      alpha: { from: 1.0, to: 0.3 },
      duration: 400,
      ease: 'Sine.InOut',
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard!.on('keydown', this.#goToMenu, this);
    this.input.on('pointerdown', this.#goToMenu, this);

    // Start menu music — MusicManager handles browser autoplay unlock.
    MusicManager.instance.playMenu(this);
  }

  #goToMenu = (): void => {
    if (this.#transitioning) return;
    this.#transitioning = true;

    // Remove listeners to prevent double-fire during fade.
    this.input.keyboard!.off('keydown', this.#goToMenu, this);
    this.input.off('pointerdown', this.#goToMenu, this);

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.MAIN_MENU_SCENE);
    });
  };
}
