import * as Phaser from 'phaser';
import { Element } from './types';

export const EVENT_BUS = new Phaser.Events.EventEmitter();

export const CUSTOM_EVENTS = {
  OPENED_CHEST: 'OPENED_CHEST',
  ENEMY_DESTROYED: 'ENEMY_DESTROYED',
  PLAYER_DEFEATED: 'PLAYER_DEFEATED',
  PLAYER_HEALTH_UPDATED: 'PLAYER_HEALTH_UPDATED',
  SHOW_DIALOG: 'SHOW_DIALOG',
  DIALOG_CLOSED: 'DIALOG_CLOSED',
  BOSS_DEFEATED: 'BOSS_DEFEATED',
  SPELL_CAST: 'SPELL_CAST',
  MANA_UPDATED: 'MANA_UPDATED',
  ELEMENT_CHANGED: 'ELEMENT_CHANGED',
  ELEMENT_CAROUSEL_STEP: 'ELEMENT_CAROUSEL_STEP',
  // Special-spell charges (pickup-granted casts of VoidOrb etc.)
  SPECIAL_SPELL_CHARGES_CHANGED: 'SPECIAL_SPELL_CHARGES_CHANGED',
  DEBUG_SPAWN_FLYING_OBELISK: 'DEBUG_SPAWN_FLYING_OBELISK',
  DEBUG_SPAWN_LAVA_PUDDLE: 'DEBUG_SPAWN_LAVA_PUDDLE',
  // Network events (Phase 1: LAN Foundation)
  NETWORK_PLAYER_UPDATE: 'NETWORK_PLAYER_UPDATE',
  NETWORK_SPELL_CAST: 'NETWORK_SPELL_CAST',
  NETWORK_BREATH_START: 'NETWORK_BREATH_START',
  NETWORK_BREATH_UPDATE: 'NETWORK_BREATH_UPDATE',
  NETWORK_BREATH_END: 'NETWORK_BREATH_END',
  NETWORK_EARTH_WALL_PILLAR: 'NETWORK_EARTH_WALL_PILLAR',
  NETWORK_EARTH_WALL_PILLAR_DESTROY: 'NETWORK_EARTH_WALL_PILLAR_DESTROY',
  NETWORK_ROOM_TRANSITION: 'NETWORK_ROOM_TRANSITION',
  NETWORK_PLAYER_DISCONNECTED: 'NETWORK_PLAYER_DISCONNECTED',
  NETWORK_PLAYER_RECONNECTED: 'NETWORK_PLAYER_RECONNECTED',
  NETWORK_LOBBY_UPDATED: 'NETWORK_LOBBY_UPDATED',
  NETWORK_LOBBY_STARTED: 'NETWORK_LOBBY_STARTED',
  NETWORK_LOBBY_ERROR: 'NETWORK_LOBBY_ERROR',
  NETWORK_CONNECTED: 'NETWORK_CONNECTED',
  NETWORK_DISCONNECTED: 'NETWORK_DISCONNECTED',
  NETWORK_HOST_CHANGED: 'NETWORK_HOST_CHANGED',
  NETWORK_MATCH_STATE_CHANGED: 'NETWORK_MATCH_STATE_CHANGED',
  NETWORK_MATCH_COUNTDOWN_TICK: 'NETWORK_MATCH_COUNTDOWN_TICK',
  // Phase 9.3 — host-authoritative damage broadcasts (D-01..D-04)
  NETWORK_DAMAGE_CONFIRMED: 'NETWORK_DAMAGE_CONFIRMED',
  NETWORK_ELIMINATION: 'NETWORK_ELIMINATION',
  NETWORK_RESPAWN: 'NETWORK_RESPAWN',
  NETWORK_SPELL_DESTROYED: 'NETWORK_SPELL_DESTROYED',
} as const;

/**
 * Phase 9.3 (Plan 03): payload shape for CUSTOM_EVENTS.SPELL_CAST.
 *
 * Phaser's EventEmitter is structurally untyped (`...args: any[]`), so this type
 * is documentary — receivers must locally cast (e.g. `payload as SpellCastEventPayload`).
 * Adding new fields here does NOT produce a TypeScript error at emit/listen sites.
 *
 * - `spellInstanceId`: per-cast UUID for cross-client correlation (NEW in 9.3-03).
 * - `spellId`: the SPELL_ID type constant (e.g. 'FIRE_BOLT'). Kept for backwards
 *   compatibility with existing listeners that look up spell metadata by type.
 */
export type SpellCastEventPayload = {
  spellInstanceId: string;
  spellId: string;
  slotIndex: number;
  casterX: number;
  casterY: number;
  targetX: number;
  targetY: number;
};

export const PLAYER_HEALTH_UPDATE_TYPE = {
  INCREASE: 'INCREASE',
  DECREASE: 'DECREASE',
} as const;

export type PlayerHealthUpdateType = keyof typeof PLAYER_HEALTH_UPDATE_TYPE;

export type PlayerHealthUpdated = {
  currentHealth: number;
  previousHealth: number;
  type: PlayerHealthUpdateType;
};

export type ElementChangedData = {
  element: Element;
};

export type ElementCarouselStepData = {
  direction: -1 | 1; // -1 = previous (Q), +1 = next (E)
};

// Fired whenever the player's single special-spell slot changes — either a new
// pickup replaced the active spell, a cast consumed a charge, or the last
// charge was spent (in which case spellId === null + charges === 0).
export type SpecialSpellChargesChangedData = {
  spellId: string | null;
  charges: number;
};