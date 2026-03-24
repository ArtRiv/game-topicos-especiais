import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { EARTH_WALL_PILLAR_HP, EARTH_WALL_HIT_FLASH_DURATION } from '../../common/config';

/**
 * A static earth-element barrier pillar placed by the EarthWall spell.
 * Blocks enemy movement, absorbs damage (HP pool), plays a crumble animation on death.
 */
export class EarthWallPillar extends Phaser.Physics.Arcade.Sprite {
  #currentHp: number;
  #isBeingDestroyed: boolean = false;
  #hitFlashTimer?: Phaser.Time.TimerEvent;

  get isBeingDestroyed(): boolean {
    return this.#isBeingDestroyed;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.EARTH_WALL, 1);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.#currentHp = EARTH_WALL_PILLAR_HP;
    this.setDepth(4);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(24, 24, true);
    body.setImmovable(true);
    body.setAllowGravity(false);

    // Y-based depth so lower pillars render in front of higher ones
    this.setDepth(y);

    // Play emerge animation, then transition to looping idle
    this.play(`${ASSET_KEYS.EARTH_WALL}_EMERGE`);
    this.once(`animationcomplete-${ASSET_KEYS.EARTH_WALL}_EMERGE`, () => {
      if (this.active && !this.#isBeingDestroyed) {
        this.play(`${ASSET_KEYS.EARTH_WALL}_IDLE`);
      }
    });
  }

  /** Apply damage to this pillar. Flashes white on hit; plays death anim when HP reaches 0. */
  public takeDamage(damage: number): void {
    if (this.#isBeingDestroyed || !this.active) return;

    this.#currentHp -= damage;

    // Brief white flash to indicate damage
    this.#hitFlashTimer?.remove(false);
    this.setTintFill(0xffffff);
    this.#hitFlashTimer = this.scene.time.delayedCall(EARTH_WALL_HIT_FLASH_DURATION, () => {
      if (this.active && !this.#isBeingDestroyed) {
        this.clearTint();
      }
      this.#hitFlashTimer = undefined;
    });

    if (this.#currentHp <= 0) {
      this.#crumble();
    }
  }

  #crumble(): void {
    if (this.#isBeingDestroyed) return;
    this.#isBeingDestroyed = true;
    this.#hitFlashTimer?.remove(false);
    this.#hitFlashTimer = undefined;
    this.clearTint();

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.enable = false;
    }

    // Play the sink-back-into-earth animation then destroy
    this.play(`${ASSET_KEYS.EARTH_WALL}_CRUMBLE`);
    this.once(`animationcomplete-${ASSET_KEYS.EARTH_WALL}_CRUMBLE`, () => {
      this.destroy();
    });
  }
}
