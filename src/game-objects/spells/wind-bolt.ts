import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  WIND_BOLT_IMPACT_FORWARD_OFFSET,
  WIND_BOLT_LIFETIME,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { registerSpell } from './spell-registry';

export class WindBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.WIND;
  readonly spellId: SpellId = SPELL_ID.WIND_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = RUNTIME_CONFIG.WIND_BOLT_MANA_COST;
  readonly cooldown: number = RUNTIME_CONFIG.WIND_BOLT_COOLDOWN;

  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #isExploding: boolean = false;

  get baseDamage(): number {
    return RUNTIME_CONFIG.WIND_BOLT_DAMAGE;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    super(scene, x, y, ASSET_KEYS.WIND_BOLT);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(4, 4, true);

    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    body.setVelocity(
      Math.cos(angle) * RUNTIME_CONFIG.WIND_BOLT_SPEED,
      Math.sin(angle) * RUNTIME_CONFIG.WIND_BOLT_SPEED,
    );
    this.setRotation(angle);
    this.play(ASSET_KEYS.WIND_BOLT);

    this.#lifetimeTimer = scene.time.delayedCall(WIND_BOLT_LIFETIME, () => {
      this.destroy();
    });
  }

  public explode(): void {
    if (this.#isExploding || !this.active) return;
    this.#isExploding = true;
    this.#lifetimeTimer?.destroy();

    const impactAngle = this.rotation;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    this.setPosition(
      this.x + Math.cos(impactAngle) * WIND_BOLT_IMPACT_FORWARD_OFFSET,
      this.y + Math.sin(impactAngle) * WIND_BOLT_IMPACT_FORWARD_OFFSET,
    );
    this.setRotation(impactAngle);
    this.setVisible(true);
    this.play(ASSET_KEYS.WIND_BOLT_HIT);
    this.once(`animationcomplete-${ASSET_KEYS.WIND_BOLT_HIT}`, () => {
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#lifetimeTimer?.destroy();
    super.destroy(fromScene);
  }
}

// Side-effect: register factory
registerSpell(SPELL_ID.WIND_BOLT, (scene, x, y, tx, ty) => new WindBolt(scene, x, y, tx, ty));
