import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { RUNTIME_CONFIG } from '../../common/runtime-config';

/**
 * Earth + Fire combo explosion effect.
 *
 * Both animations play simultaneously:
 *  - Rock burst (under) — Irregular rock spritesheet
 *  - Big explosion (over) — Explosion spritesheet
 * The damage body is active for the full duration; everything is destroyed
 * once the longer explosion animation completes.
 */
export class EarthFireExplosion extends Phaser.Physics.Arcade.Sprite {
  #isDamageActive: boolean = false;
  #explosionSprite: Phaser.GameObjects.Sprite | undefined;
  readonly baseDamage: number = RUNTIME_CONFIG.EARTH_FIRE_EXPLOSION_DAMAGE;

  get isDamageActive(): boolean {
    return this.#isDamageActive;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.EARTH_FIRE_ROCK_BURST);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(5);
    this.setScale(RUNTIME_CONFIG.EARTH_FIRE_EXPLOSION_SCALE);

    // AoE body active immediately (both animations play together)
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(RUNTIME_CONFIG.EARTH_FIRE_EXPLOSION_BODY_RADIUS);
    body.enable = true;
    body.setImmovable(true);
    body.setAllowGravity(false);
    this.#isDamageActive = true;

    // Layer 1 (bottom): rock burst
    this.play(ASSET_KEYS.EARTH_FIRE_ROCK_BURST);

    // Layer 2 (top): big explosion — starts at the same time
    this.#explosionSprite = scene.add
      .sprite(x, y, ASSET_KEYS.EARTH_FIRE_EXPLOSION)
      .setDepth(6)
      .setScale(RUNTIME_CONFIG.EARTH_FIRE_EXPLOSION_SCALE);

    this.#explosionSprite.play(ASSET_KEYS.EARTH_FIRE_EXPLOSION);

    // Tear everything down when the top explosion finishes (it's the longer one)
    this.#explosionSprite.once(`animationcomplete-${ASSET_KEYS.EARTH_FIRE_EXPLOSION}`, () => {
      this.#isDamageActive = false;
      this.#explosionSprite?.destroy();
      this.#explosionSprite = undefined;
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#isDamageActive = false;
    this.#explosionSprite?.destroy();
    this.#explosionSprite = undefined;
    super.destroy(fromScene);
  }
}
