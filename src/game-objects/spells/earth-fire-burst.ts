import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import type { EarthFireBurstVariant } from '../../common/config';
import { CharacterGameObject } from '../common/character-game-object';
import { DIRECTION } from '../../common/common';

/**
 * EarthBolt + FireArea combo (replaces the old lava pool).
 *
 * A one-shot explosion sprite. Active enemies overlapping the body during the
 * animation get damaged once. The art variant comes from
 * `RUNTIME_CONFIG.EARTH_FIRE_BURST_VARIANT` so VFX1/VFX2/VFX3 can be A/B'd
 * without recompiling.
 */
export class EarthFireBurst extends Phaser.Physics.Arcade.Sprite {
  #isDamageActive: boolean = false;
  #hitEnemies: Set<CharacterGameObject> = new Set();
  readonly baseDamage: number = RUNTIME_CONFIG.EARTH_FIRE_BURST_DAMAGE;

  get isDamageActive(): boolean {
    return this.#isDamageActive;
  }

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const variant = RUNTIME_CONFIG.EARTH_FIRE_BURST_VARIANT as EarthFireBurstVariant;
    const key = variantKey(variant);
    super(scene, x, y, key);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Y-based depth so the burst layers correctly with characters whose depth
    // tracks their Y. The 128px frames are big — use the burst's own Y plus a
    // small offset so anyone standing inside is hidden behind the flames.
    this.setDepth(y + 16);
    this.setScale(RUNTIME_CONFIG.EARTH_FIRE_BURST_SCALE);

    // Circular damage body, sized in texture px (Phaser scales the body with
    // the sprite via setSize but setCircle's offsets stay in texture px).
    const r = RUNTIME_CONFIG.EARTH_FIRE_BURST_BODY_RADIUS;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(r, 64 - r, 64 - r);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = true;
    this.#isDamageActive = true;

    this.play(key);
    this.once(`animationcomplete-${key}`, () => {
      this.#isDamageActive = false;
      this.destroy();
    });
  }

  /** One-shot damage per enemy — the explosion is brief, so a hit deduplication
   *  set keeps tick-frequency overlap from stacking damage. */
  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.#isDamageActive || this.#hitEnemies.has(enemy)) return;
    this.#hitEnemies.add(enemy);
    enemy.hit(DIRECTION.DOWN, this.baseDamage);
  }

  public destroy(fromScene?: boolean): void {
    this.#isDamageActive = false;
    this.#hitEnemies.clear();
    super.destroy(fromScene);
  }
}

function variantKey(v: EarthFireBurstVariant): string {
  switch (v) {
    case 'VFX2': return ASSET_KEYS.EARTH_FIRE_BURST_VFX2;
    case 'VFX3': return ASSET_KEYS.EARTH_FIRE_BURST_VFX3;
    case 'VFX1':
    default: return ASSET_KEYS.EARTH_FIRE_BURST_VFX1;
  }
}
