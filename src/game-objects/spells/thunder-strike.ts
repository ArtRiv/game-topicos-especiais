import * as Phaser from 'phaser';
import { ActiveSpell } from './base-spell';
import { Element, SpellId, SpellType } from '../../common/types';
import { ASSET_KEYS } from '../../common/assets';
import { ELEMENT, SPELL_ID, SPELL_TYPE } from '../../common/common';
import {
  THUNDER_STRIKE_BODY_RADIUS,
  THUNDER_STRIKE_LOOP_DURATION,
  THUNDER_STRIKE_MANA_COST,
  THUNDER_STRIKE_COOLDOWN,
} from '../../common/config';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import type { CharacterGameObject } from '../common/character-game-object';
import { registerSpell } from './spell-registry';

// Vertical fudge for the void-empowered variant. Positive = push the sprite + hitbox
// DOWN (the actual strike point inside lightning_strike_001's 128×128 frame isn't quite
// at the bottom edge, so anchoring origin (0.5, 1) at the cast point puts everything a
// few pixels too high). Tune to taste — sprite and body shift together, so the hitbox
// stays aligned with the visible bolt.
const VOID_EMPOWERED_Y_OFFSET_PX = 20;

export class ThunderStrike extends Phaser.Physics.Arcade.Sprite implements ActiveSpell {
  readonly element: Element = ELEMENT.THUNDER;
  readonly spellId: SpellId = SPELL_ID.THUNDER_STRIKE;
  readonly spellType: SpellType = SPELL_TYPE.AREA;
  readonly manaCost: number = THUNDER_STRIKE_MANA_COST;
  readonly cooldown: number = THUNDER_STRIKE_COOLDOWN;

  #loopTimer: Phaser.Time.TimerEvent | undefined;
  #hitEnemies: Set<CharacterGameObject> = new Set();
  #damageActive: boolean = false;

  get baseDamage(): number {
    return RUNTIME_CONFIG.THUNDER_STRIKE_DAMAGE;
  }

  get isDamageActive(): boolean {
    return this.#damageActive;
  }

  get gameObject(): Phaser.GameObjects.GameObject {
    return this;
  }

  #damageMultiplier: number;
  #reactionBufferMs: number;

  constructor(scene: Phaser.Scene, x: number, y: number, options?: { voidEmpowered?: boolean }) {
    const voidEmpowered = options?.voidEmpowered === true;

    // Void-empowered variant: cast onto an active VoidOrb orb → use the violet
    // lightning_strike_001 frames (per-frame PNGs, see preload-scene.ts) and play that
    // single-frame anim instead of the normal Thunder sheet.
    const useAlt = !voidEmpowered && RUNTIME_CONFIG.LIGHTNING_SPRITE_VARIANT === 'MAGIC_PACK_9';
    const initialTextureKey = voidEmpowered
      ? `${ASSET_KEYS.LIGHTNING_STRIKE_001}_0`
      : useAlt
        ? `${ASSET_KEYS.THUNDER_STRIKE_ALT}_0`
        : ASSET_KEYS.THUNDER_STRIKE;
    // Vanilla strike gets a runtime-tunable Y offset (config). Void-empowered keeps its
    // dedicated VOID_EMPOWERED_Y_OFFSET_PX constant — they're independent knobs.
    const vanillaSpriteYOffset = RUNTIME_CONFIG.THUNDER_STRIKE_SPRITE_Y_OFFSET_PX;
    super(scene, x, y + (voidEmpowered ? VOID_EMPOWERED_Y_OFFSET_PX : vanillaSpriteYOffset), initialTextureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(3);

    // Position the origin at the bottom of the 64x64 frame so (x, y) lines up with the
    // point the lightning actually strikes (the bolt visual sits in the upper half).
    // The hitbox is a circle centred on that strike point.
    // For the void-empowered (lightning_strike_001) sprite — 96x96 frames centred on the
    // strike point — keep the default centred origin so the bigger flash radiates around
    // the impact instead of dangling above it.
    if (voidEmpowered) {
      // 128x128 frames are already 2× the normal Thunder sheet — no extra scale needed.
      // Origin matches the vanilla strike convention: bolt is drawn coming from above
      // with the strike point near the bottom of the frame, so anchor the bottom at
      // the cast point (was 0.5, 0.5 which centered the frame and pushed the visible
      // strike ~64px below the hitbox).
      this.setOrigin(0.5, 1);
    } else {
      this.setOrigin(0.5, 1);
    }

    // Empowered cast deals more damage per the user's spec.
    this.#damageMultiplier = voidEmpowered ? 1.75 : 1;
    // Reaction buffer is now a single tunable (RUNTIME_CONFIG.THUNDER_STRIKE_REACTION_BUFFER_MS).
    // The void-empowered variant used to bake in a separate 50ms (its anim was shorter),
    // but we now share one knob — tune via debug panel.
    this.#reactionBufferMs = RUNTIME_CONFIG.THUNDER_STRIKE_REACTION_BUFFER_MS;

    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = voidEmpowered ? 26 : THUNDER_STRIKE_BODY_RADIUS;
    // Tunable hitbox Y offset (vanilla only). Positive value shifts the body DOWN
    // relative to the strike point — useful when the visible bolt looks correct but
    // damage registers above where the lightning lands.
    const vanillaHitboxYOffset = RUNTIME_CONFIG.THUNDER_STRIKE_HITBOX_Y_OFFSET_PX;
    if (voidEmpowered) {
      // lightning_strike_001 is 128x128 with the strike point near the bottom of the
      // frame. With origin (0.5, 1) the sprite's bottom-center anchors at the cast
      // point, so put the body at the same place: horizontally centered, vertically
      // flush with the bottom of the texture. setCircle offsets ignore origin —
      // body center world Y = sprite.y - displayOriginY + offsetY + r = cast.y when
      // offsetY = 128 - 2r, which is what the formula below produces.
      body.setCircle(r, 64 - r, 128 - 2 * r);
    } else {
      // setCircle offset is from the texture's top-left (it ignores origin). With the bolt's
      // strike point at frame coordinate (32, 64), the circle's top-left for centring is
      // (32 - r, 64 - 2r). Diameter cap = 32 keeps the body inside the frame on Y.
      body.setCircle(r, 32 - r, 64 - 2 * r + vanillaHitboxYOffset);
    }
    body.setImmovable(true);
    body.setAllowGravity(false);
    body.enable = false;
    // Hide the disabled body from the Arcade debug overlay during the bolt's strike-down
    // animation. Previously the debug circle was visible while the bolt was animating
    // (looking like a phantom "first hitbox" that was offset from the visible strike
    // point), then again as a "second hitbox" once it was enabled — same body either way,
    // but visually confusing. Keep it hidden until #activateBody enables it.
    body.debugShowBody = false;

    // Phase 1: play strike-down animation; on complete → activate body.
    const animKey = voidEmpowered
      ? ASSET_KEYS.LIGHTNING_STRIKE_001
      : useAlt
        ? ASSET_KEYS.THUNDER_STRIKE_ALT
        : ASSET_KEYS.THUNDER_STRIKE;
    this.play(animKey);
    // Animation playback speed multiplier. 1 = native frame rate; 2 halves the descent.
    this.anims.timeScale = RUNTIME_CONFIG.THUNDER_STRIKE_ANIM_TIMESCALE;
    // Hitbox activates at the START of the animation, not on completion. The damage
    // window (RUNTIME_CONFIG.THUNDER_STRIKE_LOOP_DURATION) runs concurrently with the
    // visual descent, so the strike feels responsive even at ANIM_TIMESCALE = 1.
    this.#activateBody();
  }

  /** Called in the overlap callback for each enemy. Damages each enemy only once per activation. */
  public hitEnemy(enemy: CharacterGameObject): void {
    if (!this.#damageActive || this.#hitEnemies.has(enemy)) return;
    this.#hitEnemies.add(enemy);
    const dmg = Math.max(1, Math.round(this.baseDamage * this.#damageMultiplier));
    enemy.hit('DOWN', dmg);
  }

  public destroy(fromScene?: boolean): void {
    this.#loopTimer?.destroy();
    this.#hitEnemies.clear();
    super.destroy(fromScene);
  }

  #activateBody(): void {
    if (!this.active) return;

    // Reaction buffer between the bolt animation ending and the damage window opening,
    // tunable via RUNTIME_CONFIG.THUNDER_STRIKE_REACTION_BUFFER_MS. Set to 0 for instant
    // damage on strike (the animation duration itself is the bigger delay — adjust
    // RUNTIME_CONFIG.THUNDER_STRIKE_ANIM_TIMESCALE for that).
    this.#loopTimer = this.scene.time.delayedCall(this.#reactionBufferMs, () => {
      if (!this.active) return;
      this.#damageActive = true;
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.enable = true;
      body.debugShowBody = true;

      // Damage window — destroy when it closes.
      this.#loopTimer = this.scene.time.delayedCall(RUNTIME_CONFIG.THUNDER_STRIKE_LOOP_DURATION, () => {
        if (!this.active) return;
        this.#damageActive = false;
        body.enable = false;
        this.destroy();
      });
    });
  }
}

// Side-effect: register factory (casterX/Y ignored — spell lands at target position).
// Cast-onto-VoidOrb detection: if an active VoidOrb orb sits within EMPOWER_RANGE of
// the requested target, swap to the violet lightning_strike_001 variant.
import { VoidOrb } from './void-orb';
const VOID_EMPOWER_RANGE = 40; // px — roughly the orb body radius

registerSpell(SPELL_ID.THUNDER_STRIKE, (scene, _cx, _cy, tx, ty) => {
  const empowered = scene.children.list.some(
    (c) => c instanceof VoidOrb && c.active && Math.hypot(c.x - tx, c.y - ty) <= VOID_EMPOWER_RANGE,
  );
  return new ThunderStrike(scene, tx, ty, empowered ? { voidEmpowered: true } : undefined);
});
