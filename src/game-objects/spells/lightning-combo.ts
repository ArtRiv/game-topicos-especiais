import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { CharacterGameObject } from '../common/character-game-object';
import { DIRECTION } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';

/**
 * Visual + hitbox carrier for the FireBolt + ThunderStrike combo. Spawned at the impact
 * site and plays a chosen lightning_burst_xxx_large_violet animation. Damages every enemy
 * that overlaps during the single-play animation.
 */
export class LightningBurstCombo extends Phaser.Physics.Arcade.Sprite {
  #hitEnemies: Set<CharacterGameObject> = new Set();
  #damageActive: boolean = true;

  get baseDamage(): number {
    return RUNTIME_CONFIG.LIGHTNING_BURST_COMBO_DAMAGE;
  }

  get isDamageActive(): boolean {
    return this.#damageActive;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, options?: { variant?: '002' | '003' }) {
    // Optional per-cast override beats the global config (used by the FireBolt+VoidOrb
    // combo which always wants the 002 sprite regardless of LIGHTNING_BURST_VARIANT).
    const variant = options?.variant ?? RUNTIME_CONFIG.LIGHTNING_BURST_VARIANT;
    const variantKey =
      variant === '003' ? ASSET_KEYS.LIGHTNING_BURST_003 : ASSET_KEYS.LIGHTNING_BURST_002;
    super(scene, x, y, `${variantKey}_0`);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5);

    const r = RUNTIME_CONFIG.LIGHTNING_BURST_COMBO_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r);
    body.setOffset((this.width - r * 2) / 2, (this.height - r * 2) / 2);
    body.setImmovable(true);
    body.setAllowGravity(false);

    this.play(variantKey);
    this.once(`animationcomplete-${variantKey}`, () => {
      this.#damageActive = false;
      this.destroy();
    });
  }

  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.#damageActive || this.#hitEnemies.has(enemy) || enemy.isDefeated) return;
    this.#hitEnemies.add(enemy);
    enemy.hit(DIRECTION.DOWN, this.baseDamage);
  }
}

/**
 * ThunderStrike + FireArea combo: lightning_strike_001_large_violet single-play VFX.
 * Smaller area / smaller damage than LightningBurstCombo (a passive collision combo
 * rather than an active player-driven one).
 */
export class LightningStrikeCombo extends Phaser.Physics.Arcade.Sprite {
  #hitEnemies: Set<CharacterGameObject> = new Set();
  #damageActive: boolean = true;

  get baseDamage(): number {
    return RUNTIME_CONFIG.LIGHTNING_STRIKE_COMBO_DAMAGE;
  }

  get isDamageActive(): boolean {
    return this.#damageActive;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, `${ASSET_KEYS.LIGHTNING_STRIKE_001}_0`);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5);

    const r = RUNTIME_CONFIG.LIGHTNING_STRIKE_COMBO_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r);
    body.setOffset((this.width - r * 2) / 2, (this.height - r * 2) / 2);
    body.setImmovable(true);
    body.setAllowGravity(false);

    this.play(ASSET_KEYS.LIGHTNING_STRIKE_001);
    this.once(`animationcomplete-${ASSET_KEYS.LIGHTNING_STRIKE_001}`, () => {
      this.#damageActive = false;
      this.destroy();
    });
  }

  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.#damageActive || this.#hitEnemies.has(enemy) || enemy.isDefeated) return;
    this.#hitEnemies.add(enemy);
    enemy.hit(DIRECTION.DOWN, this.baseDamage);
  }
}
