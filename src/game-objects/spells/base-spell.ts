import * as Phaser from 'phaser';
import { Element, SpellId, SpellType } from '../../common/types';

export interface SpellConfig {
  element: Element;
  spellId: SpellId;
  spellType: SpellType;
  baseDamage: number;
  manaCost: number;
  cooldown: number;
}

export interface ActiveSpell {
  readonly element: Element;
  readonly spellId: SpellId;
  readonly spellType: SpellType;
  readonly baseDamage: number;
  readonly manaCost: number;
  readonly cooldown: number;
  readonly gameObject: Phaser.GameObjects.GameObject;
  destroy(): void;
}

/**
 * Marker interface for persistent, tick-based area spells (FireArea, VoidOrb,
 * LavaPool, WaterTornado, …). These deal damage on a repeating timer to anything
 * overlapping their Arcade body.
 *
 * Historically each one's tick only damaged enemies (bots) via a private
 * `#enemiesInArea` Set — they had NO cross-player (PvP) path, AND the generic
 * cross-player overlap can't help them because the server dedupes spell:hit by
 * spellId and these spells keep a FIXED spellId, so a persistent overlap only
 * ever lands ONE hit (the "só dá dano uma vez" bug).
 *
 * The fix: each spell increments `pvpTickSeq` from inside its existing tick
 * callback, and GameScene's #updateAoePvpDamage() watches that counter. When it
 * advances, GameScene tests body-overlap against players and emits a
 * caster-authoritative spell:hit with a PER-TICK id (`${spellId}:t${seq}`) so the
 * server treats every tick as a distinct hit. The spell's real spellId is left
 * untouched (it's still used for spell:destroyed correlation).
 */
export interface TickAoeSpell {
  /** Monotonic counter bumped once per damage tick by the spell's own timer. */
  readonly pvpTickSeq: number;
  /** Damage applied per tick (already in half-heart units). */
  readonly baseDamage: number;
  /** Whether the spell is currently dealing damage (false while ending/extinguished). */
  readonly isPvpDamageActive: boolean;
  readonly gameObject: Phaser.GameObjects.GameObject;
}
