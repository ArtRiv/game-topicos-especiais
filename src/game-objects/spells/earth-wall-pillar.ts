import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { EARTH_WALL_DURATION, EARTH_WALL_HIT_FLASH_DURATION, EARTH_WALL_PILLAR_HP } from '../../common/config';

// Frames inside Earth Wall.png (48Ã—48, 4Ã—4 grid, 0-indexed)
// Frame 0 = empty
// Frames 1â€“4 = pillar emerging (4 frames)
// Frames 5â€“13 = pillar disappearing (9 frames)
// Frames 14â€“15 = empty

export const EARTH_WALL_ANIM = {
  EMERGE: `${ASSET_KEYS.EARTH_WALL}_EMERGE`,
  DISAPPEAR: `${ASSET_KEYS.EARTH_WALL}_DISAPPEAR`,
} as const;

export class EarthWallPillar extends Phaser.Physics.Arcade.Sprite {
  #hp: number;
  #durationTimer: Phaser.Time.TimerEvent | undefined;
  #isBeingDestroyed: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.EARTH_WALL);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 40, true);
    body.setImmovable(true);
    body.setAllowGravity(false);

    this.#hp = EARTH_WALL_PILLAR_HP;

    // Play emerge animation; Phaser stays on the last frame when it finishes (repeat: 0)
    this.play(EARTH_WALL_ANIM.EMERGE);

    // Schedule auto-destruction after duration
    this.#durationTimer = scene.time.delayedCall(EARTH_WALL_DURATION, () => {
      this.#triggerDisappear();
    });
  }

  get isBeingDestroyed(): boolean {
    return this.#isBeingDestroyed;
  }

  /** Called from collision handlers when this pillar takes a hit. */
  public takeDamage(amount: number): void {
    if (this.#isBeingDestroyed || !this.active) return;
    this.#hp -= amount;
    this.#flashWhite();
    if (this.#hp <= 0) {
      this.#triggerDisappear();
    }
  }

  #flashWhite(): void {
    this.setTint(0xffffff);
    this.scene.time.delayedCall(EARTH_WALL_HIT_FLASH_DURATION, () => {
      if (this.active && !this.#isBeingDestroyed) {
        this.clearTint();
      }
    });
  }

  #triggerDisappear(): void {
    if (this.#isBeingDestroyed) return;
    this.#isBeingDestroyed = true;
    this.#durationTimer?.destroy();

    // Disable physics body so it stops blocking while playing the death animation
    (this.body as Phaser.Physics.Arcade.Body).enable = false;

    this.play(EARTH_WALL_ANIM.DISAPPEAR);
    this.once(`animationcomplete-${EARTH_WALL_ANIM.DISAPPEAR}`, () => {
      this.destroy();
    });
  }
}
