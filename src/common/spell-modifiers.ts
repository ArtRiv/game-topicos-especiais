/**
 * Per-player spell/stat modifiers for the Team Deathmatch "pick 1 of 3 upgrade
 * cards on death" system. Each multiplier is applied on top of a base config
 * value AT CAST TIME (read off the caster Player in the spell constructor /
 * charge machine / cooldown gate).
 *
 * The SERVER owns these values: every `upgrade:applied` broadcast carries a
 * player's COMPLETE recomputed snapshot (PlayerModifiers in networking/types.ts
 * — structurally identical to this type), and GameScene overwrites the matching
 * Player's `spellModifiers` with it. The client never accumulates or computes
 * modifier values itself, so local + remote rendering can't drift.
 *
 * Keep this list SMALL and additive — one field per stat per spell family.
 * New upgrades = new fields here + in the server mirror + reads in the spell.
 * KEEP IN SYNC with PlayerModifiers in src/networking/types.ts AND
 * game-server/src/types.ts.
 */
export type SpellModifiers = {
  // FireBolt
  fireballDamageMult: number;
  fireballSpeedMult: number;
  fireballSizeMult: number;
  fireballCooldownMult: number;
  // FireArea
  fireAreaDamageMult: number;
  fireAreaSizeMult: number;
  fireAreaCooldownMult: number;
  fireAreaDurationMult: number;
  // Lightning
  lightningDamageMult: number;
  lightningRangeMult: number;
  lightningChargeSpeedMult: number;
  lightningCooldownMult: number;
  // Water Tornado
  tornadoPullMult: number;
  tornadoSizeMult: number;
  tornadoCooldownMult: number;
  tornadoDurationMult: number;
  // Water Spike
  waterSpikeDamageMult: number;
  waterSpikeCooldownMult: number;
  // Earth Wall
  earthWallDurationMult: number;
  earthWallPillarHpBonus: number;
  // Earth Bump
  earthBumpKnockbackMult: number;
  earthBumpDamageMult: number;
  earthBumpCooldownMult: number;
  // Wind Bolt
  windBoltDamageMult: number;
  windBoltSizeMult: number;
  windBoltSpeedMult: number;
  windBoltCooldownMult: number;
  windBoltPushMult: number;
  // Player stats
  dashCooldownMult: number;
  moveSpeedMult: number;
  maxHealthBonus: number;
};

/** All-neutral modifiers (no upgrades). Spread to create a fresh per-player copy. */
export const DEFAULT_SPELL_MODIFIERS: Readonly<SpellModifiers> = {
  fireballDamageMult: 1,
  fireballSpeedMult: 1,
  fireballSizeMult: 1,
  fireballCooldownMult: 1,
  fireAreaDamageMult: 1,
  fireAreaSizeMult: 1,
  fireAreaCooldownMult: 1,
  fireAreaDurationMult: 1,
  lightningDamageMult: 1,
  lightningRangeMult: 1,
  lightningChargeSpeedMult: 1,
  lightningCooldownMult: 1,
  tornadoPullMult: 1,
  tornadoSizeMult: 1,
  tornadoCooldownMult: 1,
  tornadoDurationMult: 1,
  waterSpikeDamageMult: 1,
  waterSpikeCooldownMult: 1,
  earthWallDurationMult: 1,
  earthWallPillarHpBonus: 0,
  earthBumpKnockbackMult: 1,
  earthBumpDamageMult: 1,
  earthBumpCooldownMult: 1,
  windBoltDamageMult: 1,
  windBoltSizeMult: 1,
  windBoltSpeedMult: 1,
  windBoltCooldownMult: 1,
  windBoltPushMult: 1,
  dashCooldownMult: 1,
  moveSpeedMult: 1,
  maxHealthBonus: 0,
};

/** Fresh mutable copy of the neutral defaults (each Player gets its own object). */
export function makeDefaultSpellModifiers(): SpellModifiers {
  return { ...DEFAULT_SPELL_MODIFIERS };
}
