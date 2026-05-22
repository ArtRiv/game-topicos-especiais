import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  FIRE_BOLT_FIRE_AREA_DAMAGE_MULTIPLIER,
  FIRE_BOLT_FIRE_AREA_IMPACT_SCALE_MULTIPLIER,
  FIRE_BOLT_FIRE_AREA_SCALE_MULTIPLIER,
  FIRE_BOLT_FIRE_AREA_SPEED_MULTIPLIER,
  FIRE_BOLT_IMPACT_FORWARD_OFFSET,
  FIRE_BOLT_LIFETIME,
  FIRE_BOLT_MANA_COST,
  FIRE_BOLT_COOLDOWN,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import type { FireArea } from './fire-area';

export class FireBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.FIRE;
  readonly spellId: SpellId = SPELL_ID.FIRE_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = FIRE_BOLT_MANA_COST;
  readonly cooldown: number = FIRE_BOLT_COOLDOWN;
  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #isExploding: boolean = false;
  #damage: number = RUNTIME_CONFIG.FIRE_BOLT_DAMAGE;
  #isEmpowered: boolean = false;
  #overlappingAreas: Set<FireArea> = new Set();

  get baseDamage(): number {
    return this.#damage;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    super(scene, x, y, ASSET_KEYS.FIRE_BOLT);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);

    // Origin shift puts the rotation pivot on the flame's visual centre (it sits below
    // the geometric centre of the 48x48 frame), so the rotated sprite stays aligned with
    // the world-space hitbox in every aim direction. See FIRE_BOLT_SPRITE_ORIGIN_Y.
    this.setOrigin(RUNTIME_CONFIG.FIRE_BOLT_SPRITE_ORIGIN_X, RUNTIME_CONFIG.FIRE_BOLT_SPRITE_ORIGIN_Y);

    // Keep collider tight around the visible flame core, centred on (this.x, this.y).
    // Because we shifted the origin we must compute the body offset manually rather than
    // using setSize(..., true) — that helper assumes the default centred origin.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 16);
    body.setOffset(this.displayOriginX - 8, this.displayOriginY - 8);

    // calculate velocity towards target
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    body.setVelocity(
      Math.cos(angle) * RUNTIME_CONFIG.FIRE_BOLT_SPEED,
      Math.sin(angle) * RUNTIME_CONFIG.FIRE_BOLT_SPEED,
    );

    // rotate sprite to face direction
    this.setRotation(angle);

    // play animation
    this.play(ASSET_KEYS.FIRE_BOLT);

    // auto-destroy after lifetime
    this.#lifetimeTimer = scene.time.delayedCall(FIRE_BOLT_LIFETIME, () => {
      this.destroy();
    });
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  public destroy(fromScene?: boolean): void {
    this.#lifetimeTimer?.destroy();
    this.#overlappingAreas.clear();
    super.destroy(fromScene);
  }

  public onEnterFireArea(area: FireArea): void {
    if (this.#isExploding || !this.active || this.#overlappingAreas.has(area)) {
      return;
    }

    this.#overlappingAreas.add(area);
    this.setVisible(false);

    // Spawn a single-play impact VFX at the entry point so the player gets a clear
    // visual cue that the FireBolt-into-FireArea combo just fired (the bolt itself
    // goes invisible while it's inside the area, which otherwise looked like it just
    // disappeared into the puddle). Placeholder asset — easy to swap (see assets.ts).
    const impact = this.scene.add.sprite(this.x, this.y, ASSET_KEYS.FIRE_BOLT_AREA_IMPACT);
    impact.setDepth(this.depth + 1);
    impact.setRotation(this.rotation);
    impact.play(ASSET_KEYS.FIRE_BOLT_AREA_IMPACT);
    impact.once(`animationcomplete-${ASSET_KEYS.FIRE_BOLT_AREA_IMPACT}`, () => impact.destroy());

    if (!this.#isEmpowered) {
      this.#empowerFromFireArea();
    }
  }

  public onExitFireArea(area: FireArea): void {
    if (!this.#overlappingAreas.has(area)) {
      return;
    }

    this.#overlappingAreas.delete(area);
    if (this.#overlappingAreas.size === 0 && !this.#isExploding) {
      this.setVisible(true);
    }
  }

  #empowerFromFireArea(): void {
    this.#isEmpowered = true;
    this.#damage = Math.max(1, Math.round(RUNTIME_CONFIG.FIRE_BOLT_DAMAGE * FIRE_BOLT_FIRE_AREA_DAMAGE_MULTIPLIER));

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(
        body.velocity.x * FIRE_BOLT_FIRE_AREA_SPEED_MULTIPLIER,
        body.velocity.y * FIRE_BOLT_FIRE_AREA_SPEED_MULTIPLIER,
      );
    }

    this.setScale(FIRE_BOLT_FIRE_AREA_SCALE_MULTIPLIER);
  }

  public explode(): void {
    if (this.#isExploding || !this.active) {
      return;
    }

    this.#isExploding = true;
    this.#lifetimeTimer?.destroy();

    const impactAngle = this.rotation;
    const impactForwardOffset = FIRE_BOLT_IMPACT_FORWARD_OFFSET;

    // Stop movement/collision, then play impact animation.
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    // Move impact slightly forward so it appears at the actual contact point.
    this.setPosition(
      this.x + Math.cos(impactAngle) * impactForwardOffset,
      this.y + Math.sin(impactAngle) * impactForwardOffset,
    );

    // Keep rotation facing the direction the bolt was traveling
    this.setRotation(impactAngle);
    this.setVisible(true);
    this.setScale(this.#isEmpowered ? FIRE_BOLT_FIRE_AREA_IMPACT_SCALE_MULTIPLIER : 1);
    this.play(ASSET_KEYS.FIRE_BOLT_IMPACT);
    this.once(`animationcomplete-${ASSET_KEYS.FIRE_BOLT_IMPACT}`, () => {
      this.destroy();
    });
  }
}

import { registerSpell } from './spell-registry';
registerSpell(SPELL_ID.FIRE_BOLT, (scene, x, y, tx, ty) => new FireBolt(scene, x, y, tx, ty));
