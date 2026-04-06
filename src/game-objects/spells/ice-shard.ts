import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  ICE_SHARD_IMPACT_FORWARD_OFFSET,
  ICE_SHARD_LIFETIME,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import { registerSpell } from './spell-registry';

export class IceShard extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.ICE;
  readonly spellId: SpellId = SPELL_ID.ICE_SHARD;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = RUNTIME_CONFIG.ICE_SHARD_MANA_COST;
  readonly cooldown: number = RUNTIME_CONFIG.ICE_SHARD_COOLDOWN;

  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #isExploding: boolean = false;

  get baseDamage(): number {
    return RUNTIME_CONFIG.ICE_SHARD_DAMAGE;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, targetX: number, targetY: number) {
    super(scene, x, y, ASSET_KEYS.ICE_SHARD);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(4, 4, true);

    const angle = Phaser.Math.Angle.Between(x, y, targetX, targetY);
    body.setVelocity(
      Math.cos(angle) * RUNTIME_CONFIG.ICE_SHARD_SPEED,
      Math.sin(angle) * RUNTIME_CONFIG.ICE_SHARD_SPEED,
    );
    this.setRotation(angle);
    this.play(ASSET_KEYS.ICE_SHARD);

    this.#lifetimeTimer = scene.time.delayedCall(ICE_SHARD_LIFETIME, () => {
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
      this.x + Math.cos(impactAngle) * ICE_SHARD_IMPACT_FORWARD_OFFSET,
      this.y + Math.sin(impactAngle) * ICE_SHARD_IMPACT_FORWARD_OFFSET,
    );
    this.setRotation(impactAngle);
    this.setVisible(true);
    this.play(ASSET_KEYS.ICE_SHARD_HIT);
    this.once(`animationcomplete-${ASSET_KEYS.ICE_SHARD_HIT}`, () => {
      this.destroy();
    });
  }

  public destroy(fromScene?: boolean): void {
    this.#lifetimeTimer?.destroy();
    super.destroy(fromScene);
  }
}

// Side-effect: register factory so SpellCastingComponent can instantiate without a direct import
registerSpell(SPELL_ID.ICE_SHARD, (scene, x, y, tx, ty) => new IceShard(scene, x, y, tx, ty));
