import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  THUNDER_SPLASH_BODY_RADIUS,
  THUNDER_SPLASH_CHARGE_MS,
  THUNDER_SPLASH_COOLDOWN,
  THUNDER_SPLASH_DAMAGE,
  THUNDER_SPLASH_LAND_MS,
  THUNDER_SPLASH_MANA_COST,
  THUNDER_SPLASH_TRAVEL_MS,
} from '../../common/config';
import type { CharacterGameObject } from '../common/character-game-object';
import { registerSpell } from './spell-registry';

/**
 * ThunderSplash — slow lightning projectile drawn with the THUNDER_SPLASH spritesheet
 * (14 frames @ 48x48). Three phases keyed to slices of the sheet (see preload-scene.ts):
 *   CHARGE  — frames 0..1, stationary at the caster
 *   TRAVEL  — frames 2..6, drifts to the requested target over THUNDER_SPLASH_TRAVEL_MS
 *   LAND    — frames 7..13, stays at the landing point; hitbox is active only here.
 *
 * Damage activates the moment the spell lands and stays active for the LAND duration.
 * That keeps the splash from chip-hitting anything along its flight path — visually it's
 * the "lightning lands and arcs" beat, not a flying bolt.
 */
export class ThunderSplash extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.THUNDER;
  readonly spellId: SpellId = SPELL_ID.THUNDER_SPLASH;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = THUNDER_SPLASH_MANA_COST;
  readonly cooldown: number = THUNDER_SPLASH_COOLDOWN;

  #hitEnemies: Set<CharacterGameObject> = new Set();
  #damageActive: boolean = false;
  #timers: Phaser.Time.TimerEvent[] = [];
  #travelTween: Phaser.Tweens.Tween | undefined;

  get baseDamage(): number {
    return THUNDER_SPLASH_DAMAGE;
  }

  get isDamageActive(): boolean {
    return this.#damageActive;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(
    scene: Phaser.Scene,
    casterX: number,
    casterY: number,
    targetX: number,
    targetY: number,
  ) {
    super(scene, casterX, casterY, ASSET_KEYS.THUNDER_SPLASH, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);
    this.setOrigin(0.5, 0.5);

    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = THUNDER_SPLASH_BODY_RADIUS;
    body.setCircle(r, 24 - r, 24 - r);
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = false;

    // Phase 1 — CHARGE: stationary windup at the caster.
    this.play(`${ASSET_KEYS.THUNDER_SPLASH}_CHARGE`);
    this.#timers.push(
      scene.time.delayedCall(THUNDER_SPLASH_CHARGE_MS, () => {
        if (!this.active) return;
        this.#startTravel(targetX, targetY);
      }),
    );
  }

  #startTravel(targetX: number, targetY: number): void {
    if (!this.active) return;
    this.play(`${ASSET_KEYS.THUNDER_SPLASH}_TRAVEL`);

    // Use a tween rather than physics velocity — distance is fixed by (caster → target)
    // and we want the projectile to come to rest exactly at the target regardless of
    // distance. Linear easing matches the constant frame cadence.
    this.#travelTween = this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: THUNDER_SPLASH_TRAVEL_MS,
      ease: 'Linear',
      onComplete: () => {
        if (this.active) this.#startLand();
      },
    });
  }

  #startLand(): void {
    if (!this.active) return;
    this.play(`${ASSET_KEYS.THUNDER_SPLASH}_LAND`);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = true;
    this.#damageActive = true;

    this.#timers.push(
      this.scene.time.delayedCall(THUNDER_SPLASH_LAND_MS, () => {
        if (!this.active) return;
        this.#damageActive = false;
        body.enable = false;
        this.destroy();
      }),
    );
  }

  /** Called from GameScene overlap callbacks; damages each enemy only once per cast. */
  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.#damageActive || this.#hitEnemies.has(enemy)) return;
    this.#hitEnemies.add(enemy);
    enemy.hit('DOWN', this.baseDamage);
  }

  public destroy(fromScene?: boolean): void {
    this.#timers.forEach((t) => t.destroy());
    this.#timers.length = 0;
    this.#travelTween?.stop();
    this.#travelTween = undefined;
    this.#hitEnemies.clear();
    super.destroy(fromScene);
  }
}

registerSpell(SPELL_ID.THUNDER_SPLASH, (scene, cx, cy, tx, ty) => new ThunderSplash(scene, cx, cy, tx, ty));
