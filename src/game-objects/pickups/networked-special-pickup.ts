import * as Phaser from 'phaser';
import { ASSET_KEYS } from '../../common/assets';
import { SPELL_ID } from '../../common/common';
import { DARK_BOLT_PICKUP_CHARGES } from '../../common/config/spells/dark-bolt';
import { VOID_ORB_PICKUP_CHARGES } from '../../common/config/spells/void-orb';
import { STAR_SHIELD_PICKUP_CHARGES } from '../spells/star-shield';
import { SpecialSpellInventory } from '../../common/special-spell-inventory';

/**
 * NetworkedSpecialPickup — a special-spell pickup spawned by a SERVER broadcast
 * (pickup:spawned) so every client renders the SAME pickup at the SAME place.
 *
 * Difference from the local-only DarkBoltPickup / VoidOrbPickup: collect() only
 * updates the LOCAL inventory (optimistically, on overlap). It does NOT self-
 * destruct — GameScene destroys it for everyone when the server's pickup:collected
 * broadcast lands (first-touch-wins arbitration). This keeps every client in sync.
 *
 * Each pickup grants exactly its spell's pickup-charge count (1-use in practice for
 * the event: the inventory holds one special at a time and a charge is spent per cast).
 */
type PickupSpec = { asset: string; scale: number; charges: number; spellId: string; frame?: number };
const SPELL_VISUALS: Record<string, PickupSpec> = {
  DARK_BOLT: { asset: ASSET_KEYS.DARK_BOLT_BM_VFX3, scale: 0.4, charges: DARK_BOLT_PICKUP_CHARGES, spellId: SPELL_ID.DARK_BOLT },
  VOID_ORB: { asset: ASSET_KEYS.VOID_ORB_BM_LOOP, scale: 0.35, charges: VOID_ORB_PICKUP_CHARGES, spellId: SPELL_ID.VOID_ORB },
  // Frame 12 of the 15-frame Star Shield sheet is the fully-formed bubble (the
  // LOOP frame), which reads best as a static pickup icon.
  STAR_SHIELD: { asset: ASSET_KEYS.STAR_SHIELD, scale: 0.3, charges: STAR_SHIELD_PICKUP_CHARGES, spellId: SPELL_ID.STAR_SHIELD, frame: 12 },
};

export class NetworkedSpecialPickup extends Phaser.Physics.Arcade.Sprite {
  readonly pickupId: string;
  #spec: PickupSpec;
  #bobTween?: Phaser.Tweens.Tween;
  #pulseTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, pickupId: string, spellType: string, x: number, y: number) {
    const spec = SPELL_VISUALS[spellType] ?? SPELL_VISUALS.DARK_BOLT;
    super(scene, x, y, spec.asset, spec.frame ?? 0);
    this.pickupId = pickupId;
    this.#spec = spec;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(2.5).setOrigin(0.5, 0.5).setScale(spec.scale);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(12, 64 - 12, 64 - 12);
    body.setImmovable(true);
    body.setAllowGravity(false);

    // Fade IN on spawn (the user asked for a fade-in), then bob + pulse like the other pickups.
    this.setAlpha(0);
    scene.tweens.add({ targets: this, alpha: 1, duration: 350, ease: 'Quad.easeOut' });
    this.#bobTween = scene.tweens.add({
      targets: this, y: y - 3, duration: 700, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    });
    this.#pulseTween = scene.tweens.add({
      targets: this, alpha: 0.75, duration: 900, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, delay: 350,
    });
  }

  /** Update the LOCAL inventory only (optimistic, on overlap). Does NOT destroy the sprite —
   *  GameScene destroys it on the server's pickup:collected broadcast so all clients agree. */
  public collect(): void {
    SpecialSpellInventory.instance.setActive(this.#spec.spellId, this.#spec.charges);
  }

  destroy(fromScene?: boolean): void {
    this.#bobTween?.stop();
    this.#pulseTween?.stop();
    super.destroy(fromScene);
  }
}
