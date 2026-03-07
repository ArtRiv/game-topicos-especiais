import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  FIRE_BOLT_DAMAGE,
  FIRE_BOLT_LIFETIME,
  FIRE_BOLT_MANA_COST,
  FIRE_BOLT_COOLDOWN,
  FIRE_BOLT_SPEED,
} from '../../common/config';

export class FireBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.FIRE;
  readonly spellId: SpellId = SPELL_ID.FIRE_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly baseDamage: number = FIRE_BOLT_DAMAGE;
  readonly manaCost: number = FIRE_BOLT_MANA_COST;
  readonly cooldown: number = FIRE_BOLT_COOLDOWN;
  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    super(scene, x, y, ASSET_KEYS.FIRE_BOLT);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(3);

    // set physics body size
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(8, 8);

    // calculate velocity towards target
    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    body.setVelocity(
      Math.cos(angle) * FIRE_BOLT_SPEED,
      Math.sin(angle) * FIRE_BOLT_SPEED,
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
    super.destroy(fromScene);
  }

  public explode(): void {
    // stop movement and destroy
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }
    // could add explosion animation here later
    this.destroy();
  }
}
