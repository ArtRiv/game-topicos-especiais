import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { SPELL_ID } from '../../common/common';
import { DARK_BOLT_PICKUP_CHARGES } from '../../common/config';
import { SpecialSpellInventory } from '../../common/special-spell-inventory';

/**
 * DarkBoltPickup — a small floating sprite the player walks over to equip the
 * DarkBolt special. Uses the first frame of the Blood Mage VFX3 sheet as its
 * icon (matches the in-flight projectile so the pickup reads as the spell).
 *
 * Collection: GameScene registers a physics overlap between this and the player.
 * When triggered, the pickup REPLACES whatever was in the special slot with
 * DarkBolt + DARK_BOLT_PICKUP_CHARGES charges and self-destructs. This is the
 * "only one collectable at a time" rule — picking this up wipes a VoidOrb you
 * were holding and vice versa.
 */
export class DarkBoltPickup extends Phaser.Physics.Arcade.Sprite {
  static readonly all: Set<DarkBoltPickup> = new Set();

  #bobTween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.DARK_BOLT_BM_VFX3, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(2.5);
    this.setOrigin(0.5, 0.5);
    // Visually smaller than a live bolt so it reads as "an item" not "a spell".
    // Roughly matches the VoidOrb pickup's relative size for HUD consistency.
    this.setScale(0.4);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Tight pickup body — player has to actually touch the icon.
    body.setCircle(12, 64 - 12, 64 - 12);
    body.setImmovable(true);
    body.setAllowGravity(false);

    // Same bob + alpha pulse as VoidOrbPickup so both special pickups read as
    // the same category of collectible in the world.
    this.#bobTween = scene.tweens.add({
      targets: this,
      y: y - 3,
      duration: 700,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
    scene.tweens.add({
      targets: this,
      alpha: 0.75,
      duration: 900,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    DarkBoltPickup.all.add(this);
  }

  /** Triggered by the overlap callback in GameScene. Replaces the current special
   *  spell with DarkBolt at full charges and self-destructs. */
  public collect(): void {
    SpecialSpellInventory.instance.setActive(SPELL_ID.DARK_BOLT, DARK_BOLT_PICKUP_CHARGES);
    this.destroy();
  }

  destroy(fromScene?: boolean): void {
    this.#bobTween?.stop();
    DarkBoltPickup.all.delete(this);
    super.destroy(fromScene);
  }
}
