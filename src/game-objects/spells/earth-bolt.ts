import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  EARTH_BOLT_IMPACT_FORWARD_OFFSET,
  EARTH_BOLT_IMPACT_ROTATION_OFFSET,
  EARTH_BOLT_LIFETIME,
  EARTH_BOLT_MANA_COST,
  EARTH_BOLT_COOLDOWN,
  MOLTEN_BOLT_DAMAGE_MULTIPLIER,
  MOLTEN_BOLT_TINT,
  MOLTEN_BOLT_LAVA_PUDDLE_AMOUNT,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { Puddle } from './puddle';

export class EarthBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.EARTH;
  readonly spellId: SpellId = SPELL_ID.EARTH_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = EARTH_BOLT_MANA_COST;
  readonly cooldown: number = EARTH_BOLT_COOLDOWN;
  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #isConsumed: boolean = false;
  #damage: number = RUNTIME_CONFIG.EARTH_BOLT_DAMAGE;
  // Set to true by `makeMolten()` (EarthBolt + FireArea combo). When true, the
  // bolt deals MOLTEN_BOLT_DAMAGE_MULTIPLIER× damage, renders orange, and
  // drops a lava puddle at the impact point when it finally destroys.
  #isMolten: boolean = false;
  // Suppress the lava-puddle drop on destroy when the bolt was consumed by a
  // DIFFERENT combo (e.g. FireBolt collision → EarthFireExplosion). Without
  // this, those combos would double-up with a stray lava puddle.
  #suppressLavaOnDestroy: boolean = false;

  get baseDamage(): number {
    return this.#damage;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    super(scene, x, y, ASSET_KEYS.EARTH_BOLT);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(8, 8, true);

    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    body.setVelocity(
      Math.cos(angle) * RUNTIME_CONFIG.EARTH_BOLT_SPEED,
      Math.sin(angle) * RUNTIME_CONFIG.EARTH_BOLT_SPEED,
    );

    this.setRotation(angle);
    this.play(ASSET_KEYS.EARTH_BOLT);

    this.#lifetimeTimer = scene.time.delayedCall(EARTH_BOLT_LIFETIME, () => {
      this.destroy();
    });
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  get isMolten(): boolean {
    return this.#isMolten;
  }

  /** EarthBolt + FireArea combo: heat the bolt into a molten projectile. The
   *  bolt KEEPS TRAVELLING (no longer consumed by the fire) — it just becomes
   *  hotter, deals more damage, and will spawn a lava puddle at its eventual
   *  impact point. Idempotent — passing through multiple fire areas doesn't
   *  re-heat it. */
  public makeMolten(): void {
    if (this.#isMolten || this.#isConsumed || !this.active) return;
    this.#isMolten = true;
    this.#damage = RUNTIME_CONFIG.EARTH_BOLT_DAMAGE * MOLTEN_BOLT_DAMAGE_MULTIPLIER;
    this.setTint(MOLTEN_BOLT_TINT);
  }

  public destroy(fromScene?: boolean): void {
    this.#lifetimeTimer?.destroy();
    // Molten bolts drop a lava puddle at their final position — works for ALL
    // destroy paths (lifetime expiry, wall impact via explode, enemy impact).
    // Suppressed only when another combo consumed the bolt (e.g. FireBolt
    // collision → EarthFireExplosion takes the spotlight).
    if (this.#isMolten && !this.#suppressLavaOnDestroy && this.scene) {
      Puddle.spawnOrMerge(
        this.scene,
        this.x,
        this.y,
        MOLTEN_BOLT_LAVA_PUDDLE_AMOUNT,
        undefined,
        'lava',
      );
    }
    super.destroy(fromScene);
  }

  /** Called when this bolt hits a wall or enemy — plays impact animation then destroys. */
  public explode(): void {
    if (this.#isConsumed || !this.active) {
      return;
    }

    this.#isConsumed = true;
    this.#lifetimeTimer?.destroy();

    const impactAngle = this.rotation;

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    this.setPosition(
      this.x + Math.cos(impactAngle) * EARTH_BOLT_IMPACT_FORWARD_OFFSET,
      this.y + Math.sin(impactAngle) * EARTH_BOLT_IMPACT_FORWARD_OFFSET,
    );
    // Impact spritesheet is drawn horizontally while the bolt rotates along travel.
    // Apply the +90° offset so the splat aligns parallel to the impacted surface
    // (matches FireBolt impact orientation behaviour — bug-9 fix).
    this.setRotation(impactAngle + EARTH_BOLT_IMPACT_ROTATION_OFFSET);
    this.setVisible(true);
    this.play(ASSET_KEYS.EARTH_BOLT_IMPACT);
    this.once(`animationcomplete-${ASSET_KEYS.EARTH_BOLT_IMPACT}`, () => {
      this.destroy();
    });
  }

  /**
   * Called when this bolt collides with a FireBolt (combo trigger).
   * The bolt is silently destroyed so the combo explosion takes the spotlight.
   * If the bolt was already molten, suppress its on-destroy lava puddle — the
   * EarthFireExplosion is the dominant visual, no need to drop lava too.
   */
  public triggerFireCombo(): void {
    if (this.#isConsumed || !this.active) {
      return;
    }

    this.#isConsumed = true;
    this.#suppressLavaOnDestroy = true;
    this.#lifetimeTimer?.destroy();

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    this.destroy();
  }

}

import { registerSpell } from './spell-registry';
registerSpell(SPELL_ID.EARTH_BOLT, (scene, x, y, tx, ty) => new EarthBolt(scene, x, y, tx, ty));
