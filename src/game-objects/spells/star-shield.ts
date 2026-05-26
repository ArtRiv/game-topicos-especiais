import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import { ASSET_KEYS } from '../../common/assets';
import { registerSpell } from './spell-registry';
import { CharacterGameObject } from '../common/character-game-object';
import { Player } from '../player/player';

/** Star Shield — a special pickup spell that wraps the caster in an invulnerability
 *  bubble for ~5s. While the shield is active:
 *    - All damage to the caster is ignored.
 *    - Projectiles get reflected back along the line they came in on (game-scene
 *      handles this — the shield itself just sets `caster.isStarShieldActive`).
 *    - VoidOrb / WaterTornado pulls are skipped against the caster.
 *    - Mud / lava slow + lava damage are ignored.
 *    - EarthWall pillars and WaterSpike are phased through.
 *
 *  The shield is a pure visual + flag holder — no Arcade body, no damage. The
 *  caster reference is required so we can clear the invulnerability flag on
 *  destroy and follow the player every frame.
 */
export const STAR_SHIELD_DURATION_MS = 5000;
export const STAR_SHIELD_REFLECT_SPEED_MULT = 1.25;
// Tuning knobs. Display scale shrinks the 128×128 source frame; Y offset moves
// the bubble down relative to the player center (positive = down).
export const STAR_SHIELD_DISPLAY_SCALE = 0.45;
export const STAR_SHIELD_Y_OFFSET = 2;
// Bubble alpha — lowered so the player is clearly visible through the sphere.
export const STAR_SHIELD_ALPHA = 0.72;
// Player tint while shielded — soft violet to match the bubble palette.
export const STAR_SHIELD_PLAYER_TINT = 0xaabbff;

export class StarShield extends Phaser.GameObjects.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.WIND; // arbitrary — special spells aren't element-gated
  readonly spellId: SpellId = SPELL_ID.STAR_SHIELD;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly baseDamage: number = 0;
  readonly manaCost: number = 0;
  readonly cooldown: number = 0;

  #caster: CharacterGameObject | undefined;
  #endTimer: Phaser.Time.TimerEvent | undefined;
  #followHandler: (() => void) | undefined;
  // Snapshot of the caster's tint before we overwrote it, so destroy() can
  // restore it (matters in MP where remote players carry team-color tints).
  #priorCasterTint: number | undefined;
  #priorCasterTintFill: boolean | undefined;

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  constructor(scene: Phaser.Scene, x: number, y: number, caster?: CharacterGameObject) {
    super(scene, x, y, ASSET_KEYS.STAR_SHIELD, 0);
    scene.add.existing(this);
    this.setOrigin(0.5, 0.5);
    this.setScale(STAR_SHIELD_DISPLAY_SCALE);
    this.setAlpha(STAR_SHIELD_ALPHA);
    this.#caster = caster;

    // Render above the caster so the bubble visually wraps them.
    if (caster) {
      this.setPosition(caster.x, caster.y + STAR_SHIELD_Y_OFFSET);
      this.setDepth(caster.depth + 1);
      // Set the flag IMMEDIATELY so any same-frame damage check honors it.
      if (caster instanceof Player) {
        caster.isStarShieldActive = true;
      } else {
        (caster as unknown as { isStarShieldActive?: boolean }).isStarShieldActive = true;
      }
      // Snapshot the caster's current tint then overlay the shield tint, so
      // they read as "wrapped in shield energy" rather than vanishing behind
      // the bubble. Restored in destroy().
      this.#priorCasterTint = caster.tint;
      this.#priorCasterTintFill = caster.tintFill;
      caster.setTint(STAR_SHIELD_PLAYER_TINT);
    }

    // INTRO → LOOP chain. END plays on destroy().
    this.play(`${ASSET_KEYS.STAR_SHIELD}_INTRO`);
    this.once(
      `animationcomplete-${ASSET_KEYS.STAR_SHIELD}_INTRO`,
      () => {
        if (this.active) this.play(`${ASSET_KEYS.STAR_SHIELD}_LOOP`);
      },
    );

    // Follow the caster every frame so the bubble tracks movement.
    this.#followHandler = (): void => {
      if (!this.active) return;
      if (!this.#caster?.active) return;
      this.setPosition(this.#caster.x, this.#caster.y + STAR_SHIELD_Y_OFFSET);
      this.setDepth(this.#caster.depth + 1);
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.#followHandler);

    // Auto-end after the duration. Visual: play END anim, destroy on complete.
    this.#endTimer = scene.time.delayedCall(STAR_SHIELD_DURATION_MS, () => {
      if (!this.active) return;
      this.play(`${ASSET_KEYS.STAR_SHIELD}_END`);
      this.once(`animationcomplete-${ASSET_KEYS.STAR_SHIELD}_END`, () => {
        if (this.active) this.destroy();
      });
    });
  }

  /** Cleanup — clears the caster's invulnerability flag, unregisters the
   *  follow handler, and cancels the end timer. Safe to call multiple times. */
  override destroy(fromScene?: boolean): void {
    if (this.#caster instanceof Player) {
      this.#caster.isStarShieldActive = false;
    } else if (this.#caster) {
      (this.#caster as unknown as { isStarShieldActive?: boolean }).isStarShieldActive = false;
    }
    // Restore the caster's pre-shield tint. If there wasn't one, clear so the
    // sprite returns to its default colors.
    if (this.#caster?.active) {
      if (this.#priorCasterTint !== undefined && this.#priorCasterTint !== 0xffffff) {
        this.#caster.setTint(this.#priorCasterTint);
        if (this.#priorCasterTintFill) {
          // Phaser doesn't expose a setTintFill that preserves color, but
          // re-applying via the tintFill setter mirrors the original state.
          (this.#caster as unknown as { tintFill: boolean }).tintFill = true;
        }
      } else {
        this.#caster.clearTint();
      }
    }
    if (this.#followHandler) {
      this.scene?.events?.off(Phaser.Scenes.Events.UPDATE, this.#followHandler);
      this.#followHandler = undefined;
    }
    this.#endTimer?.destroy();
    this.#endTimer = undefined;
    this.#caster = undefined;
    super.destroy(fromScene);
  }
}

// Register the factory. Caster is REQUIRED — the shield is meaningless without
// someone to wrap. When called via the remote-cast path, the caster will be the
// remote Player instance (set up by game-scene's remote-spell spawn flow).
registerSpell(SPELL_ID.STAR_SHIELD, (scene, cx, cy, _tx, _ty, _dir, caster) => {
  return new StarShield(scene, cx, cy, caster as CharacterGameObject | undefined);
});
