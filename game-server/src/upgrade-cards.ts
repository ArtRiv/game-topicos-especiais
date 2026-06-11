// TDM death-card upgrade catalog + pure helpers (rarity sequence, modifier snapshot math).
// Server-authoritative: the client never sees this file — offers carry full display data and
// upgrade:applied carries the computed PlayerModifiers snapshot.
//
// BALANCING LIVES HERE. Every card is one row in UPGRADE_CARDS; every rarity odd is one row in
// RARITY_WEIGHT_BRACKETS. Tweak values/maxLevel/weights freely — nothing else needs to change.

import type { CardRarity, PlayerModifiers, UpgradeCardCategory } from './types.js';

export type UpgradeCardDef = {
  id: string;
  name: string;            // short — fits a ~140px card face in press_start_2p
  description: string;
  rarity: CardRarity;
  category: UpgradeCardCategory;
  stat: keyof PlayerModifiers;
  /** Per-level magnitude. Meaning depends on the stat kind (see computeModifiers):
   *  - plain mult stats:    mult = 1 + value × level        (0.20 = +20% per stack)
   *  - cooldown mult stats: mult = (1 − value)^level        (0.20 = −20% per stack, compounding)
   *  - maxHealthBonus:      bonus = value × level           (flat half-heart units; 2 = 1 heart) */
  value: number;
  maxLevel: number;
};

export const UPGRADE_CARDS: readonly UpgradeCardDef[] = [
  // ── BRONZE ──────────────────────────────────────────────────────────────────
  // FireBolt
  { id: 'fb_speed_b',   name: 'Swift Bolt',    description: 'Fireball 20% faster',           rarity: 'BRONZE',    category: 'FIREBALL',    stat: 'fireballSpeedMult',        value: 0.20, maxLevel: 3 },
  { id: 'fb_cd_b',      name: 'Quick Hands',   description: 'Fireball cooldown -15%',        rarity: 'BRONZE',    category: 'FIREBALL',    stat: 'fireballCooldownMult',     value: 0.15, maxLevel: 3 },
  // FireArea
  { id: 'fa_cd_b',      name: 'Kindle',        description: 'Fire area cooldown -15%',       rarity: 'BRONZE',    category: 'FIRE_AREA',   stat: 'fireAreaCooldownMult',     value: 0.15, maxLevel: 3 },
  // Lightning
  { id: 'ln_charge_b',  name: 'Fast Charge',   description: 'Lightning charges 25% faster',  rarity: 'BRONZE',    category: 'LIGHTNING',   stat: 'lightningChargeSpeedMult', value: 0.25, maxLevel: 3 },
  // Water Tornado
  { id: 'trn_cd_b',     name: 'Whirlpool',     description: 'Tornado cooldown -15%',         rarity: 'BRONZE',    category: 'WATER_TORNADO', stat: 'tornadoCooldownMult',    value: 0.15, maxLevel: 3 },
  // Water Spike
  { id: 'ws_cd_b',      name: 'Rapid Spike',   description: 'Water spike cooldown -15%',     rarity: 'BRONZE',    category: 'WATER_SPIKE', stat: 'waterSpikeCooldownMult',   value: 0.15, maxLevel: 3 },
  // Earth Bump
  { id: 'eb_cd_b',      name: 'Quake Ready',   description: 'Earth bump cooldown -20%',      rarity: 'BRONZE',    category: 'EARTH_BUMP',  stat: 'earthBumpCooldownMult',    value: 0.20, maxLevel: 3 },
  // Wind Bolt
  { id: 'wb_cd_b',      name: 'Gust Ready',    description: 'Wind slash cooldown -15%',      rarity: 'BRONZE',    category: 'WIND',        stat: 'windBoltCooldownMult',     value: 0.15, maxLevel: 3 },
  { id: 'wb_push_b',    name: 'Gale Force',    description: 'Wind slash pushes 50% further', rarity: 'BRONZE',    category: 'WIND',        stat: 'windBoltPushMult',         value: 0.50, maxLevel: 3 },
  // Dash & Player
  { id: 'dash_cd_b',    name: 'Light Feet',    description: 'Dash cooldown -20%',            rarity: 'BRONZE',    category: 'DASH',        stat: 'dashCooldownMult',         value: 0.20, maxLevel: 3 },
  { id: 'move_b',       name: 'Sprint',        description: 'Move 8% faster',                rarity: 'BRONZE',    category: 'PLAYER',      stat: 'moveSpeedMult',            value: 0.08, maxLevel: 3 },

  // ── SILVER ──────────────────────────────────────────────────────────────────
  // FireBolt
  { id: 'fb_size_s',    name: 'Big Bolt',      description: 'Fireball 25% bigger',           rarity: 'SILVER',    category: 'FIREBALL',    stat: 'fireballSizeMult',         value: 0.25, maxLevel: 3 },
  { id: 'fb_dmg_s',     name: 'Hot Bolt',      description: 'Fireball damage +50%',          rarity: 'SILVER',    category: 'FIREBALL',    stat: 'fireballDamageMult',       value: 0.50, maxLevel: 2 },
  // FireArea
  { id: 'fa_dmg_s',     name: 'Scorched Earth', description: 'Fire area damage +50%',        rarity: 'SILVER',    category: 'FIRE_AREA',   stat: 'fireAreaDamageMult',       value: 0.50, maxLevel: 2 },
  { id: 'fa_size_s',    name: 'Inferno Ring',  description: 'Fire area 30% bigger',          rarity: 'SILVER',    category: 'FIRE_AREA',   stat: 'fireAreaSizeMult',         value: 0.30, maxLevel: 2 },
  { id: 'fa_dur_s',     name: 'Lasting Flame', description: 'Fire area lasts 40% longer',    rarity: 'SILVER',    category: 'FIRE_AREA',   stat: 'fireAreaDurationMult',     value: 0.40, maxLevel: 2 },
  // Lightning
  { id: 'ln_range_s',   name: 'Long Arc',      description: 'Lightning 20% longer',          rarity: 'SILVER',    category: 'LIGHTNING',   stat: 'lightningRangeMult',       value: 0.20, maxLevel: 3 },
  { id: 'ln_cd_s',      name: 'Storm Cycle',   description: 'Lightning cooldown -20%',       rarity: 'SILVER',    category: 'LIGHTNING',   stat: 'lightningCooldownMult',    value: 0.20, maxLevel: 2 },
  // Water Tornado
  { id: 'trn_pull_s',   name: 'Undertow',      description: 'Tornado pulls 30% harder',      rarity: 'SILVER',    category: 'WATER_TORNADO', stat: 'tornadoPullMult',        value: 0.30, maxLevel: 3 },
  { id: 'trn_dur_s',    name: 'Eye of Storm',  description: 'Tornado lasts 40% longer',      rarity: 'SILVER',    category: 'WATER_TORNADO', stat: 'tornadoDurationMult',    value: 0.40, maxLevel: 2 },
  // Water Spike
  { id: 'ws_dmg_s',     name: 'Hydro Lance',   description: 'Water spike damage +50%',       rarity: 'SILVER',    category: 'WATER_SPIKE', stat: 'waterSpikeDamageMult',     value: 0.50, maxLevel: 2 },
  // Earth Wall
  { id: 'ew_dur_s',     name: 'Stone Patience', description: 'Earth wall lasts 50% longer',  rarity: 'SILVER',    category: 'EARTH_WALL',  stat: 'earthWallDurationMult',    value: 0.50, maxLevel: 2 },
  { id: 'ew_hp_s',      name: 'Reinforced',    description: '+2 HP per wall pillar',         rarity: 'SILVER',    category: 'EARTH_WALL',  stat: 'earthWallPillarHpBonus',   value: 2,    maxLevel: 3 },
  // Earth Bump
  { id: 'eb_kb_s',      name: 'Tremor',        description: 'Earth bump knockback +40%',     rarity: 'SILVER',    category: 'EARTH_BUMP',  stat: 'earthBumpKnockbackMult',   value: 0.40, maxLevel: 3 },
  { id: 'eb_dmg_s',     name: 'Magnitude',     description: 'Earth bump damage +50%',        rarity: 'SILVER',    category: 'EARTH_BUMP',  stat: 'earthBumpDamageMult',      value: 0.50, maxLevel: 2 },
  // Wind Bolt
  { id: 'wb_dmg_s',     name: 'Razor Wind',    description: 'Wind slash damage +50%',        rarity: 'SILVER',    category: 'WIND',        stat: 'windBoltDamageMult',       value: 0.50, maxLevel: 2 },
  { id: 'wb_size_s',    name: 'Wide Slash',    description: 'Wind slash 30% bigger',         rarity: 'SILVER',    category: 'WIND',        stat: 'windBoltSizeMult',         value: 0.30, maxLevel: 2 },
  // Player
  { id: 'hp_s',         name: 'Tough Skin',    description: '+1 max heart',                  rarity: 'SILVER',    category: 'PLAYER',      stat: 'maxHealthBonus',           value: 2,    maxLevel: 2 },

  // ── GOLD ────────────────────────────────────────────────────────────────────
  // FireBolt
  { id: 'fb_dmg_g',     name: 'Inferno Bolt',  description: 'Fireball damage +100%',         rarity: 'GOLD',      category: 'FIREBALL',    stat: 'fireballDamageMult',       value: 1.00, maxLevel: 2 },
  // FireArea
  { id: 'fa_dmg_g',     name: 'Wildfire',      description: 'Fire area damage +100%',        rarity: 'GOLD',      category: 'FIRE_AREA',   stat: 'fireAreaDamageMult',       value: 1.00, maxLevel: 1 },
  // Lightning
  { id: 'ln_dmg_g',     name: 'Overcharge',    description: 'Lightning damage +50%',         rarity: 'GOLD',      category: 'LIGHTNING',   stat: 'lightningDamageMult',      value: 0.50, maxLevel: 2 },
  // Water Tornado
  { id: 'trn_pull_g',   name: 'Black Tide',    description: 'Tornado pulls 60% harder',      rarity: 'GOLD',      category: 'WATER_TORNADO', stat: 'tornadoPullMult',        value: 0.60, maxLevel: 2 },
  { id: 'trn_size_g',   name: 'Maelstrom',     description: 'Tornado 50% bigger',            rarity: 'GOLD',      category: 'WATER_TORNADO', stat: 'tornadoSizeMult',        value: 0.50, maxLevel: 1 },
  // Earth Bump
  { id: 'eb_kb_g',      name: 'Shockwave',     description: 'Earth bump knockback +80%',     rarity: 'GOLD',      category: 'EARTH_BUMP',  stat: 'earthBumpKnockbackMult',   value: 0.80, maxLevel: 1 },
  // Wind Bolt
  { id: 'wb_spd_g',     name: 'Supersonic',    description: 'Wind slash 40% faster',         rarity: 'GOLD',      category: 'WIND',        stat: 'windBoltSpeedMult',        value: 0.40, maxLevel: 2 },
  { id: 'wb_push_g',    name: 'Hurricane',     description: 'Wind slash pushes 100% further',rarity: 'GOLD',      category: 'WIND',        stat: 'windBoltPushMult',         value: 1.00, maxLevel: 1 },
  // Player
  { id: 'move_g',       name: 'Gale Stride',   description: 'Move 18% faster',               rarity: 'GOLD',      category: 'PLAYER',      stat: 'moveSpeedMult',            value: 0.18, maxLevel: 2 },
  { id: 'dash_cd_g',    name: 'Blink',         description: 'Dash cooldown -35%',            rarity: 'GOLD',      category: 'DASH',        stat: 'dashCooldownMult',         value: 0.35, maxLevel: 2 },

  // ── PRISMATIC ───────────────────────────────────────────────────────────────
  { id: 'hp_p',         name: 'Titan Heart',   description: '+2 max hearts',                 rarity: 'PRISMATIC', category: 'PLAYER',      stat: 'maxHealthBonus',           value: 4,    maxLevel: 1 },
  { id: 'fb_dmg_p',     name: 'Sunfire',       description: 'Fireball damage +200%',         rarity: 'PRISMATIC', category: 'FIREBALL',    stat: 'fireballDamageMult',       value: 2.00, maxLevel: 1 },
  { id: 'trn_pull_p',   name: 'Event Horizon', description: 'Tornado pulls 120% harder',     rarity: 'PRISMATIC', category: 'WATER_TORNADO', stat: 'tornadoPullMult',        value: 1.20, maxLevel: 1 },
  { id: 'eb_kb_p',      name: 'Cataclysm',     description: 'Earth bump knockback +150%',    rarity: 'PRISMATIC', category: 'EARTH_BUMP',  stat: 'earthBumpKnockbackMult',   value: 1.50, maxLevel: 1 },
  { id: 'wb_push_p',    name: 'Tempest',       description: 'Wind slash pushes 200% further',rarity: 'PRISMATIC', category: 'WIND',        stat: 'windBoltPushMult',         value: 2.00, maxLevel: 1 },
] as const;

/** Cooldown-style stats compound DOWNWARD per stack: (1 − value)^level. Everything else in
 *  PlayerModifiers (except maxHealthBonus) accumulates UPWARD: 1 + value × level. */
const COOLDOWN_STATS: ReadonlySet<keyof PlayerModifiers> = new Set([
  'fireballCooldownMult',
  'fireAreaCooldownMult',
  'lightningCooldownMult',
  'tornadoCooldownMult',
  'waterSpikeCooldownMult',
  'earthBumpCooldownMult',
  'windBoltCooldownMult',
  'dashCooldownMult',
]);

export const DEFAULT_PLAYER_MODIFIERS: Readonly<PlayerModifiers> = {
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

const CARDS_BY_ID = new Map(UPGRADE_CARDS.map((c) => [c.id, c]));

export function getCardById(cardId: string): UpgradeCardDef | undefined {
  return CARDS_BY_ID.get(cardId);
}

/** Fold a player's card stacks (cardId → level) into a complete modifier snapshot.
 *  Pure — the single place upgrade stat math lives (GameRoom + tests both call it). */
export function computeModifiers(stacks: ReadonlyMap<string, number>): PlayerModifiers {
  const mods: PlayerModifiers = { ...DEFAULT_PLAYER_MODIFIERS };
  for (const [cardId, level] of stacks) {
    const card = CARDS_BY_ID.get(cardId);
    if (!card || level <= 0) continue;
    if (card.stat === 'maxHealthBonus') {
      mods.maxHealthBonus += card.value * level;
    } else if (COOLDOWN_STATS.has(card.stat)) {
      mods[card.stat] *= Math.pow(1 - card.value, level);
    } else {
      mods[card.stat] += card.value * level;
    }
  }
  return mods;
}

// ── Rarity sequence ──────────────────────────────────────────────────────────
// Rolled ONCE per match (shared by all players, score-independent). A player's Nth death reads
// sequence[min(N, length) − 1]. Odds escalate with death number via these hand-tunable brackets.

/** Weights are [BRONZE, SILVER, GOLD, PRISMATIC] and apply to deaths ≤ upToDeath (first match wins). */
export const RARITY_WEIGHT_BRACKETS: readonly { upToDeath: number; weights: [number, number, number, number] }[] = [
  { upToDeath: 2,        weights: [70, 25,  5,  0] },
  { upToDeath: 4,        weights: [45, 35, 15,  5] },
  { upToDeath: 6,        weights: [25, 40, 25, 10] },
  { upToDeath: 8,        weights: [10, 35, 35, 20] },
  { upToDeath: Infinity, weights: [ 0, 25, 45, 30] },
] as const;

export const RARITY_SEQUENCE_LENGTH = 30;

const RARITY_ORDER: readonly CardRarity[] = ['BRONZE', 'SILVER', 'GOLD', 'PRISMATIC'];

/** One weighted roll per death index 1..RARITY_SEQUENCE_LENGTH. `rand` is injectable for tests. */
export function generateRaritySequence(rand: () => number = Math.random): CardRarity[] {
  const sequence: CardRarity[] = [];
  for (let death = 1; death <= RARITY_SEQUENCE_LENGTH; death++) {
    const bracket = RARITY_WEIGHT_BRACKETS.find((b) => death <= b.upToDeath) ?? RARITY_WEIGHT_BRACKETS[RARITY_WEIGHT_BRACKETS.length - 1];
    const total = bracket.weights.reduce((a, b) => a + b, 0);
    let roll = rand() * total;
    let picked: CardRarity = RARITY_ORDER[0];
    for (let i = 0; i < RARITY_ORDER.length; i++) {
      roll -= bracket.weights[i];
      if (roll < 0) { picked = RARITY_ORDER[i]; break; }
    }
    sequence.push(picked);
  }
  return sequence;
}
