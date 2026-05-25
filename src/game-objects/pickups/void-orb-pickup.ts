import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { SPELL_ID } from '../../common/common';
import { VOID_ORB_PICKUP_CHARGES } from '../../common/config';
import { SpecialSpellInventory } from '../../common/special-spell-inventory';

/**
 * VoidOrbPickup — a small floating sprite the player walks over to equip the
 * VoidOrb special. Uses the first frame of the VoidOrb loop animation as its
 * icon and adds a gentle vertical bob so it reads as a collectible.
 *
 * Collection: GameScene registers a physics overlap between this and the player.
 * When triggered, the pickup REPLACES whatever was in the special slot with
 * VoidOrb + VOID_ORB_PICKUP_CHARGES charges and self-destructs.
 */
export class VoidOrbPickup extends Phaser.Physics.Arcade.Sprite {
  static readonly all: Set<VoidOrbPickup> = new Set();

  #bobTween: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.VOID_ORB_BM_LOOP, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(2.5);
    this.setOrigin(0.5, 0.5);
    // Pickup is visually smaller than a live orb so it reads as "an item" not "a spell".
    this.setScale(0.35);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // Small interaction body so the player has to actually touch the icon — not a
    // generous AOE pickup like floor loot. Tune via the radius below if you want a
    // bigger / smaller catch zone.
    body.setCircle(12, 64 - 12, 64 - 12);
    body.setImmovable(true);
    body.setAllowGravity(false);

    // Gentle bob + alpha pulse so it's visually obvious. Tween targets the sprite
    // directly; both yoyo for a clean back-and-forth.
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

    VoidOrbPickup.all.add(this);
  }

  /** Triggered by the overlap callback in GameScene. Replaces the current special
   *  spell with VoidOrb at full charges and self-destructs. */
  public collect(): void {
    SpecialSpellInventory.instance.setActive(SPELL_ID.VOID_ORB, VOID_ORB_PICKUP_CHARGES);
    this.destroy();
  }

  destroy(fromScene?: boolean): void {
    this.#bobTween?.stop();
    VoidOrbPickup.all.delete(this);
    super.destroy(fromScene);
  }
}
