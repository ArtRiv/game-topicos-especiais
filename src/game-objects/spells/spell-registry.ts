import type { Element, SpellId, Direction } from '../../common/types';
import type { ActiveSpell } from './base-spell';
import { ELEMENT, SPELL_ID } from '../../common/common';
import { RUNTIME_CONFIG } from '../../common/runtime-config';
import {
  FIRE_BOLT_MANA_COST, FIRE_BOLT_COOLDOWN,
  FIRE_AREA_MANA_COST, FIRE_AREA_COOLDOWN,
  EARTH_BOLT_MANA_COST, EARTH_BOLT_COOLDOWN,
  EARTH_BUMP_MANA_COST, EARTH_BUMP_COOLDOWN,
  WATER_SPIKE_MANA_COST, WATER_SPIKE_COOLDOWN,
  WATER_TORNADO_MANA_COST, WATER_TORNADO_COOLDOWN,
  VOID_ORB_MANA_COST, VOID_ORB_COOLDOWN,
  DARK_BOLT_MANA_COST, DARK_BOLT_COOLDOWN,
  WATER_BALL_MANA_COST, WATER_BALL_COOLDOWN,
  THUNDER_SPLASH_MANA_COST, THUNDER_SPLASH_COOLDOWN,
  AIR_BURST_MANA_COST, AIR_BURST_COOLDOWN,
  LIGHTNING_BEAM_MANA_PER_TICK,
  LIGHTNING_BEAM_COOLDOWN_MS,
} from '../../common/config';

export type SpellFactory = (
  scene: Phaser.Scene,
  casterX: number,
  casterY: number,
  targetX: number,
  targetY: number,
  direction: Direction,
  // Optional reference to the GameObject that's casting. Spells that affect the caster
  // (AirBurst's super-dash, future self-buffs) need this to distinguish a local cast
  // from a remote cast — the registry path is shared but the caster is not.
  caster?: Phaser.GameObjects.GameObject,
) => ActiveSpell;

/** Maps element → [slot0 (key 1), slot1 (key 2), slot2 (key 3) | null per slot]. Slot 2
 *  is reserved for "third spell" castable via key 3. Elements where key 3 is owned by a
 *  special handler (FireBreath = channeled, EarthWall = draw-mode) leave slot 2 = null —
 *  the slot-cast path then no-ops and the special handler takes over. */
export const SPELL_SLOT_REGISTRY: Record<Element, readonly [SpellId | null, SpellId | null, SpellId | null]> = {
  [ELEMENT.FIRE]:     [SPELL_ID.FIRE_BOLT,      SPELL_ID.FIRE_AREA,       null], // key 3 = FireBreath (held, channeled)
  // EARTH: slot 0 is intentionally null — left mouse click is owned by EarthWall draw-mode
  // (see GameScene.#updateEarthWallSpell). Slot 1 (right click) casts EarthBump.
  [ELEMENT.EARTH]:    [null,                    SPELL_ID.EARTH_BUMP,      null],
  [ELEMENT.WATER]:    [SPELL_ID.WATER_TORNADO,  SPELL_ID.WATER_SPIKE,     null], // WaterBall still registered but unbound
  [ELEMENT.ICE]:      [SPELL_ID.ICE_SHARD,      null,                     null],
  // WIND: slot 1 is intentionally null — Air Burst (the super-dash) is bound to
  // SHIFT when Wind is the active element instead of right-click. Avoids the
  // Chrome Shift+RMB context-menu chord that would otherwise interfere when
  // chaining a regular dash into a super-dash.
  [ELEMENT.WIND]:     [SPELL_ID.WIND_BOLT,      null,                     null],
  [ELEMENT.THUNDER]:  [SPELL_ID.THUNDER_STRIKE, SPELL_ID.LIGHTNING_BEAM,  null],
  [ELEMENT.DARKNESS]: [SPELL_ID.VOID_ORB,      null,                     null],
};

/** Mana cost and cooldown (ms) per spell — only source of truth for these values in the component. */
export const SPELL_CONFIG: Record<SpellId, { manaCost: number; cooldown: number }> = {
  [SPELL_ID.FIRE_BOLT]:      { manaCost: FIRE_BOLT_MANA_COST,      cooldown: FIRE_BOLT_COOLDOWN },
  [SPELL_ID.FIRE_AREA]:      { manaCost: FIRE_AREA_MANA_COST,      cooldown: FIRE_AREA_COOLDOWN },
  // FireBreath uses per-tick mana drain (not slot-castable). 0,0 satisfies Record exhaustiveness.
  [SPELL_ID.FIRE_BREATH]:    { manaCost: 0, cooldown: 0 },
  [SPELL_ID.EARTH_BOLT]:     { manaCost: EARTH_BOLT_MANA_COST,     cooldown: EARTH_BOLT_COOLDOWN },
  [SPELL_ID.EARTH_BUMP]:     { manaCost: EARTH_BUMP_MANA_COST,     cooldown: EARTH_BUMP_COOLDOWN },
  [SPELL_ID.WATER_SPIKE]:    { manaCost: WATER_SPIKE_MANA_COST,    cooldown: WATER_SPIKE_COOLDOWN },
  [SPELL_ID.WATER_TORNADO]:  { manaCost: WATER_TORNADO_MANA_COST,  cooldown: WATER_TORNADO_COOLDOWN },
  [SPELL_ID.ICE_SHARD]:      { manaCost: RUNTIME_CONFIG.ICE_SHARD_MANA_COST,      cooldown: RUNTIME_CONFIG.ICE_SHARD_COOLDOWN },
  [SPELL_ID.WIND_BOLT]:      { manaCost: RUNTIME_CONFIG.WIND_BOLT_MANA_COST,      cooldown: RUNTIME_CONFIG.WIND_BOLT_COOLDOWN },
  [SPELL_ID.THUNDER_STRIKE]: { manaCost: RUNTIME_CONFIG.THUNDER_STRIKE_MANA_COST, cooldown: RUNTIME_CONFIG.THUNDER_STRIKE_COOLDOWN },
  [SPELL_ID.THUNDER_SPLASH]: { manaCost: THUNDER_SPLASH_MANA_COST, cooldown: THUNDER_SPLASH_COOLDOWN },
  [SPELL_ID.VOID_ORB]:      { manaCost: VOID_ORB_MANA_COST,      cooldown: VOID_ORB_COOLDOWN },
  [SPELL_ID.DARK_BOLT]:      { manaCost: DARK_BOLT_MANA_COST,      cooldown: DARK_BOLT_COOLDOWN },
  [SPELL_ID.WATER_BALL]:     { manaCost: WATER_BALL_MANA_COST,     cooldown: WATER_BALL_COOLDOWN },
  [SPELL_ID.AIR_BURST]:      { manaCost: AIR_BURST_MANA_COST,      cooldown: AIR_BURST_COOLDOWN },
  // LightningBeam is channeled — mana drains per tick from the spell itself. Cooldown
  // is enforced post-channel (the beam calls SpellCastingComponent.refreshCooldown on
  // destroy), so this is the cooldown window AFTER the beam ends, not from cast time.
  [SPELL_ID.LIGHTNING_BEAM]: { manaCost: LIGHTNING_BEAM_MANA_PER_TICK, cooldown: LIGHTNING_BEAM_COOLDOWN_MS },
};

/**
 * Populated at module-load time by each spell module calling `registerSpell()`.
 * The executing scene imports spell modules as side effects to trigger registration.
 */
export const SPELL_FACTORY_REGISTRY: Partial<Record<SpellId, SpellFactory>> = {};

export function registerSpell(spellId: SpellId, factory: SpellFactory): void {
  SPELL_FACTORY_REGISTRY[spellId] = factory;
}
