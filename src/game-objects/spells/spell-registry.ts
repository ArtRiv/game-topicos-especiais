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
} from '../../common/config';

export type SpellFactory = (
  scene: Phaser.Scene,
  casterX: number,
  casterY: number,
  targetX: number,
  targetY: number,
  direction: Direction,
) => ActiveSpell;

/** Maps element → [primarySpellId (slot 0), secondarySpellId (slot 1) | null] */
export const SPELL_SLOT_REGISTRY: Record<Element, readonly [SpellId | null, SpellId | null]> = {
  [ELEMENT.FIRE]:    [SPELL_ID.FIRE_BOLT,      SPELL_ID.FIRE_AREA],
  [ELEMENT.EARTH]:   [SPELL_ID.EARTH_BOLT,     SPELL_ID.EARTH_BUMP],
  [ELEMENT.WATER]:   [SPELL_ID.WATER_SPIKE,    SPELL_ID.WATER_TORNADO],
  [ELEMENT.ICE]:     [SPELL_ID.ICE_SHARD,      null],
  [ELEMENT.WIND]:    [SPELL_ID.WIND_BOLT,      null],
  [ELEMENT.THUNDER]: [SPELL_ID.THUNDER_STRIKE, null],
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
};

/**
 * Populated at module-load time by each spell module calling `registerSpell()`.
 * The executing scene imports spell modules as side effects to trigger registration.
 */
export const SPELL_FACTORY_REGISTRY: Partial<Record<SpellId, SpellFactory>> = {};

export function registerSpell(spellId: SpellId, factory: SpellFactory): void {
  SPELL_FACTORY_REGISTRY[spellId] = factory;
}
