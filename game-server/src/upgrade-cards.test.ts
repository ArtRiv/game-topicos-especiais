import { describe, it, expect } from 'vitest';
import {
  UPGRADE_CARDS,
  getCardById,
  computeModifiers,
  DEFAULT_PLAYER_MODIFIERS,
  generateRaritySequence,
  RARITY_SEQUENCE_LENGTH,
  RARITY_WEIGHT_BRACKETS,
} from './upgrade-cards.js';
import type { CardRarity } from './types.js';

describe('UPGRADE_CARDS catalog', () => {
  it('has unique card ids', () => {
    const ids = UPGRADE_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every card has a positive value and maxLevel ≥ 1', () => {
    for (const card of UPGRADE_CARDS) {
      expect(card.value).toBeGreaterThan(0);
      expect(card.maxLevel).toBeGreaterThanOrEqual(1);
    }
  });

  it('cooldown-style card values stay below 1 (the (1−v)^level math requires it)', () => {
    const cooldownStats = ['fireballCooldownMult', 'lightningCooldownMult', 'dashCooldownMult'];
    for (const card of UPGRADE_CARDS.filter((c) => cooldownStats.includes(c.stat))) {
      expect(card.value).toBeLessThan(1);
    }
  });

  it('getCardById resolves every catalog entry and rejects unknowns', () => {
    for (const card of UPGRADE_CARDS) {
      expect(getCardById(card.id)).toBe(card);
    }
    expect(getCardById('nope')).toBeUndefined();
  });
});

describe('computeModifiers', () => {
  it('returns all-neutral defaults for empty stacks', () => {
    expect(computeModifiers(new Map())).toEqual(DEFAULT_PLAYER_MODIFIERS);
  });

  it('plain mult stats accumulate additively per level (1 + value × level)', () => {
    // fb_dmg_s: fireballDamageMult, value 0.50
    const mods = computeModifiers(new Map([['fb_dmg_s', 2]]));
    expect(mods.fireballDamageMult).toBeCloseTo(2.0); // 1 + 0.5×2
  });

  it('stacks of DIFFERENT cards feeding the same stat both apply', () => {
    // fb_dmg_s (0.50 × 1) + fb_dmg_g (1.00 × 1) → 1 + 0.5 + 1.0 = 2.5
    const mods = computeModifiers(new Map([['fb_dmg_s', 1], ['fb_dmg_g', 1]]));
    expect(mods.fireballDamageMult).toBeCloseTo(2.5);
  });

  it('cooldown stats compound multiplicatively ((1−value)^level) and never reach 0', () => {
    // dash_cd_b: dashCooldownMult, value 0.20 → level 3 = 0.8^3 = 0.512
    const mods = computeModifiers(new Map([['dash_cd_b', 3]]));
    expect(mods.dashCooldownMult).toBeCloseTo(0.512);
    expect(mods.dashCooldownMult).toBeGreaterThan(0);
  });

  it('maxHealthBonus is flat (value × level, in half-heart units)', () => {
    // hp_s: value 2, level 2 → +4; hp_p: value 4, level 1 → +4. Total +8.
    const mods = computeModifiers(new Map([['hp_s', 2], ['hp_p', 1]]));
    expect(mods.maxHealthBonus).toBe(8);
  });

  it('ignores unknown cardIds and non-positive levels', () => {
    const mods = computeModifiers(new Map([['ghost_card', 3], ['fb_dmg_s', 0]]));
    expect(mods).toEqual(DEFAULT_PLAYER_MODIFIERS);
  });
});

describe('generateRaritySequence', () => {
  it('produces RARITY_SEQUENCE_LENGTH entries of valid rarities', () => {
    const seq = generateRaritySequence();
    expect(seq).toHaveLength(RARITY_SEQUENCE_LENGTH);
    const valid: CardRarity[] = ['BRONZE', 'SILVER', 'GOLD', 'PRISMATIC'];
    for (const r of seq) expect(valid).toContain(r);
  });

  it('is deterministic for an injected rand', () => {
    const constRand = () => 0.25;
    expect(generateRaritySequence(constRand)).toEqual(generateRaritySequence(constRand));
  });

  it('rand=0 picks the first non-zero-weight rarity of each bracket', () => {
    const seq = generateRaritySequence(() => 0);
    // deaths 1-8 all have BRONZE weight > 0 → BRONZE; the 9+ bracket has BRONZE 0 → SILVER.
    expect(seq[0]).toBe('BRONZE');
    expect(seq[7]).toBe('BRONZE');
    expect(seq[8]).toBe('SILVER');
  });

  it('rand→1 picks the last non-zero-weight rarity of each bracket', () => {
    const seq = generateRaritySequence(() => 0.999999);
    // deaths 1-2: PRISMATIC weight is 0 → GOLD is the last non-zero weight.
    expect(seq[0]).toBe('GOLD');
    expect(seq[1]).toBe('GOLD');
    // deaths 3+ all have PRISMATIC > 0.
    expect(seq[2]).toBe('PRISMATIC');
    expect(seq[RARITY_SEQUENCE_LENGTH - 1]).toBe('PRISMATIC');
  });

  it('zero-weight rarities never appear in their bracket', () => {
    // Brute-force a fine-grained sweep of rand values for death 1 (bracket [70,25,5,0]).
    for (let i = 0; i < 200; i++) {
      const seq = generateRaritySequence(() => i / 200);
      expect(seq[0]).not.toBe('PRISMATIC');
    }
  });

  it('bracket boundaries hold (death N uses the first bracket with upToDeath ≥ N)', () => {
    // Sanity on the table itself: brackets are sorted and cover everything.
    let prev = 0;
    for (const b of RARITY_WEIGHT_BRACKETS) {
      expect(b.upToDeath).toBeGreaterThan(prev);
      prev = b.upToDeath as number;
      expect(b.weights.reduce((a, w) => a + w, 0)).toBeGreaterThan(0);
    }
    expect(RARITY_WEIGHT_BRACKETS[RARITY_WEIGHT_BRACKETS.length - 1].upToDeath).toBe(Infinity);
  });
});
