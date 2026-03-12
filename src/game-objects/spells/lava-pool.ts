import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import {
  LAVA_POOL_BODY_RADIUS,
  LAVA_POOL_DAMAGE_PER_TICK,
  LAVA_POOL_DURATION,
  LAVA_POOL_SCALE,
  LAVA_POOL_TICK_INTERVAL,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { CharacterGameObject } from '../common/character-game-object';
import { DIRECTION } from '../../common/common';

/**
 * EarthBolt + FireArea combo effect.
 *
 * When an EarthBolt projectile travels through a FireArea, the bolt is consumed
 * and a LavaPool is left at the impact point.  The pool:
 *   - Loops frames 0-3 of the Earth Impact spritesheet with a red/lava tint.
 *   - Emits small upward fire particles using the same spritesheet frames.
 *   - Deals tick damage to any enemy that stands on it.
 *   - Fades out and destroys itself after LAVA_POOL_DURATION ms.
 */
export class LavaPool extends Phaser.Physics.Arcade.Sprite {
  readonly baseDamage: number = RUNTIME_CONFIG.LAVA_POOL_DAMAGE_PER_TICK;

  #tickTimer: Phaser.Time.TimerEvent | undefined;
  #durationTimer: Phaser.Time.TimerEvent | undefined;
  #particles: Phaser.GameObjects.Particles.ParticleEmitter | undefined;
  #enemiesInArea: Set<CharacterGameObject> = new Set();
  #isDying = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.EARTH_BOLT_IMPACT);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);
    this.setScale(LAVA_POOL_SCALE);
    // Red-hot lava tint over the earth-impact frames.
    this.setTint(0xff3300);

    // Circular AoE body centred on the sprite.
    const body = this.body as Phaser.Physics.Arcade.Body;
    const offset = (48 / 2) - LAVA_POOL_BODY_RADIUS; // half frame size - radius
    body.setCircle(LAVA_POOL_BODY_RADIUS, offset, offset);
    body.setImmovable(true);
    body.setAllowGravity(false);

    // Play the looping lava animation.
    this.play(ASSET_KEYS.EARTH_BOLT_LAVA_POOL);

    // Small upward flame particles.
    this.#particles = scene.add.particles(x, y, ASSET_KEYS.EARTH_BOLT_IMPACT, {
      frame: [0, 1, 2, 3],
      lifespan: 500,
      speedX: { min: -20, max: 20 },
      speedY: { min: -45, max: -15 },
      scale: { start: 0.28, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xff2200, 0xff5500, 0xff8800],
      blendMode: Phaser.BlendModes.ADD,
      frequency: 160,
      quantity: 1,
    });
    this.#particles.setDepth(4);

    // Tick damage every LAVA_POOL_TICK_INTERVAL ms.
    this.#tickTimer = scene.time.addEvent({
      delay: LAVA_POOL_TICK_INTERVAL,
      callback: this.#applyTickDamage,
      callbackScope: this,
      loop: true,
    });

    // Schedule the end of the pool.
    this.#durationTimer = scene.time.delayedCall(LAVA_POOL_DURATION, () => {
      this.#playEndSequence();
    });
  }

  public addEnemyInArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.add(enemy);
  }

  public removeEnemyFromArea(enemy: CharacterGameObject): void {
    this.#enemiesInArea.delete(enemy);
  }

  #applyTickDamage(): void {
    for (const enemy of this.#enemiesInArea) {
      if (enemy.active && !enemy.isDefeated) {
        enemy.hit(DIRECTION.DOWN, this.baseDamage);
      }
    }
  }

  #playEndSequence(): void {
    if (this.#isDying) return;
    this.#isDying = true;
    this.#tickTimer?.destroy();
    this.#tickTimer = undefined;

    // Stop particle emission and let existing particles fade out.
    this.#particles?.stop();

    // Fade the pool sprite out, then destroy.
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 600,
      onComplete: () => {
        this.destroy();
      },
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#tickTimer?.destroy();
    this.#durationTimer?.destroy();
    this.#particles?.destroy();
    this.#enemiesInArea.clear();
    super.destroy(fromScene);
  }
}
