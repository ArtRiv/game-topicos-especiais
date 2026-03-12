import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  EARTH_BOLT_IMPACT_FORWARD_OFFSET,
  EARTH_BOLT_LIFETIME,
  EARTH_BOLT_MANA_COST,
  EARTH_BOLT_COOLDOWN,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';

export class EarthBolt extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.EARTH;
  readonly spellId: SpellId = SPELL_ID.EARTH_BOLT;
  readonly spellType: SpellType = SPELL_TYPE.PROJECTILE;
  readonly manaCost: number = EARTH_BOLT_MANA_COST;
  readonly cooldown: number = EARTH_BOLT_COOLDOWN;
  #lifetimeTimer: Phaser.Time.TimerEvent | undefined;
  #isConsumed: boolean = false;
  #damage: number = RUNTIME_CONFIG.EARTH_BOLT_DAMAGE;

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

  public destroy(fromScene?: boolean): void {
    this.#lifetimeTimer?.destroy();
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
    this.setRotation(impactAngle);
    this.setVisible(true);
    this.play(ASSET_KEYS.EARTH_BOLT_IMPACT);
    this.once(`animationcomplete-${ASSET_KEYS.EARTH_BOLT_IMPACT}`, () => {
      this.destroy();
    });
  }

  /**
   * Called when this bolt collides with a FireBolt (combo trigger).
   * The bolt is silently destroyed so the combo explosion takes the spotlight.
   */
  public triggerFireCombo(): void {
    if (this.#isConsumed || !this.active) {
      return;
    }

    this.#isConsumed = true;
    this.#lifetimeTimer?.destroy();

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    this.destroy();
  }

  /**
   * Called when this bolt enters a FireArea (EarthBolt + FireArea combo).
   * The bolt is silently consumed so a LavaPool can be spawned in its place.
   */
  public triggerFireAreaCombo(): void {
    if (this.#isConsumed || !this.active) {
      return;
    }

    this.#isConsumed = true;
    this.#lifetimeTimer?.destroy();

    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    this.destroy();
  }
}
