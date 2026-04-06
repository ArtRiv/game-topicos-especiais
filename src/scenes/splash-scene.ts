import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { MusicManager } from '../common/music-manager';

const FONT_FAMILY = 'FONT_PRESS_START_2P';
const FONT_RESOLUTION = 2;

export class SplashScene extends Phaser.Scene {
  #transitioning = false;

  constructor() {
    super({ key: SCENE_KEYS.SPLASH_SCENE });
  }

  public preload(): void {
    // Load both audio tracks here so they are cached before MainMenuScene needs them.
    MusicManager.instance.loadTracks(this);
  }

  public create(): void {
    const { width, height } = this.scale;
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);

    // Pure black background
    this.add.rectangle(0, 0, width, height, 0x000000, 1).setOrigin(0);

    // Centered prompt text — matches font resolution strategy used in MainMenuScene
    const prompt = this.add
      .text(cx, cy, 'PRESS ANYTHING TO\nGET HIGH IN THE\nFANTASY', {
        fontFamily: FONT_FAMILY,
        fontSize: '8px',
        color: '#e0e0e0',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5)
      .setResolution(FONT_RESOLUTION);

    // Blink animation — yoyo alpha loop
    this.tweens.add({
      targets: prompt,
      alpha: 0.1,
      duration: 600,
      ease: 'Linear',
      yoyo: true,
      repeat: -1,
    });

    // Any keyboard or pointer input → transition to main menu
    this.input.keyboard!.on('keydown', this.#goToMenu, this);
    this.input.on('pointerdown', this.#goToMenu, this);

    // Start menu music — MusicManager handles browser autoplay unlock internally
    MusicManager.instance.playMenu(this);
  }

  #goToMenu = (): void => {
    if (this.#transitioning) return;
    this.#transitioning = true;

    // Remove listeners to prevent double-fire during fade
    this.input.keyboard!.off('keydown', this.#goToMenu, this);
    this.input.off('pointerdown', this.#goToMenu, this);

    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(SCENE_KEYS.MAIN_MENU_SCENE);
    });
  };
}
