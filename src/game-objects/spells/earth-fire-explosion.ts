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
    // The bottom "rock burst" layer was sourced from Irregular rock Spritesheet.png
    // which was removed during the asset reorg. We now use the EARTH_FIRE_EXPLOSION
    // sheet alone — this sprite serves as the physics body host, and the visual is
    // entirely on the overlaid #explosionSprite for layering parity with the old code.
    super(scene, x, y, ASSET_KEYS.EARTH_FIRE_EXPLOSION);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(5);
    this.setScale(RUNTIME_CONFIG.EARTH_FIRE_EXPLOSION_SCALE);
    this.setVisible(false); // body-host only; visible explosion is on #explosionSprite

    // AoE body active immediately
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(RUNTIME_CONFIG.EARTH_FIRE_EXPLOSION_BODY_RADIUS);
    body.enable = true;
    body.setImmovable(true);
    body.setAllowGravity(false);
    this.#isDamageActive = true;

    // Visible explosion sprite (was layer 2; now the only layer)
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
