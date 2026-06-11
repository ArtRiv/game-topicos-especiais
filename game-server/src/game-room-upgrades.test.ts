import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameRoom } from './game-room.js';
import { UPGRADE_CARDS, getCardById } from './upgrade-cards.js';
import { RESPAWN_DELAY_MS, PLAYER_MAX_HP, MAX_SPELL_DAMAGE, SPELL_MAX_BASE_DAMAGE } from './types.js';
import type { PlayerInfo } from './types.js';

const P1: PlayerInfo = { id: 'p1', name: 'Alice', socketId: 's1', team: 0 };
const P2: PlayerInfo = { id: 'p2', name: 'Bob', socketId: 's2', team: 1 };

/** Room in ACTIVE state with two registered players, upgrades on, sequence rolled. */
function makeActiveRoom(seqRand: () => number = () => 0): GameRoom {
  const room = new GameRoom();
  room.addPlayer('p1', 's1');
  room.addPlayer('p2', 's2');
  room.transitionTo('LOADING');
  room.markLoaded('s1');
  room.markLoaded('s2');
  room.transitionTo('COUNTDOWN');
  room.transitionTo('ACTIVE');
  room.setMatchMode('team-deathmatch');
  room.setUpgradesEnabled(true);
  room.registerPlayer(P1, 0, 0, PLAYER_MAX_HP);
  room.registerPlayer(P2, 0, 0, PLAYER_MAX_HP);
  room.initRaritySequence(seqRand);
  return room;
}

/** Kill p1 once and return their rolled offer (rand=0 keeps picks deterministic-ish). */
function dieAndGetOffer(room: GameRoom, rand: () => number = Math.random) {
  room.recordDeath('p1');
  return room.rollUpgradeOffer('p1', rand);
}

describe('GameRoom — death-card upgrade offers', () => {
  it('returns null when upgrades are disabled', () => {
    const room = makeActiveRoom();
    room.setUpgradesEnabled(false);
    expect(dieAndGetOffer(room)).toBeNull();
  });

  it('returns null when the rarity sequence was never rolled', () => {
    const room = new GameRoom();
    room.addPlayer('p1', 's1');
    room.setUpgradesEnabled(true);
    room.recordDeath('p1');
    expect(room.rollUpgradeOffer('p1')).toBeNull();
  });

  it('returns null before the first death', () => {
    const room = makeActiveRoom();
    expect(room.rollUpgradeOffer('p1')).toBeNull();
  });

  it('offers 3 DISTINCT cards of the sequence rarity for death 1', () => {
    const room = makeActiveRoom(() => 0); // rand 0 → death-1 rarity = BRONZE
    const offer = dieAndGetOffer(room);
    expect(offer).not.toBeNull();
    expect(offer!.deathNumber).toBe(1);
    expect(offer!.rarity).toBe('BRONZE');
    expect(offer!.cards).toHaveLength(3);
    const ids = offer!.cards.map((c) => c.cardId);
    expect(new Set(ids).size).toBe(3);
    for (const c of offer!.cards) expect(c.rarity).toBe('BRONZE');
  });

  it('deadline is ~now + RESPAWN_DELAY_MS', () => {
    const room = makeActiveRoom();
    const before = Date.now();
    const offer = dieAndGetOffer(room)!;
    expect(offer.deadlineTs).toBeGreaterThanOrEqual(before + RESPAWN_DELAY_MS - 50);
    expect(offer.deadlineTs).toBeLessThanOrEqual(Date.now() + RESPAWN_DELAY_MS + 50);
  });

  it('excludes maxed cards from later offers', () => {
    const room = makeActiveRoom(() => 0);
    // Max out a bronze card by repeated select cycles.
    const card = UPGRADE_CARDS.find((c) => c.rarity === 'BRONZE')!;
    for (let lvl = 0; lvl < card.maxLevel; lvl++) {
      room.recordDeath('p1');
      // Force the offer to contain our card by re-rolling until it shows up (pool is small).
      let offer = room.rollUpgradeOffer('p1');
      while (offer && !offer.cards.some((c) => c.cardId === card.id)) {
        offer = room.rollUpgradeOffer('p1');
      }
      expect(offer).not.toBeNull();
      const applied = room.applyUpgradeSelection('p1', offer!.offerId, card.id);
      expect(applied).not.toBeNull();
      expect(applied!.newLevel).toBe(lvl + 1);
    }
    // Every subsequent offer must exclude the maxed card.
    for (let i = 0; i < 10; i++) {
      room.recordDeath('p1');
      const offer = room.rollUpgradeOffer('p1');
      if (!offer) continue;
      expect(offer.cards.some((c) => c.cardId === card.id)).toBe(false);
    }
  });

  it('thin pool tops up with cards of other rarities when prismatic pool exhausted', () => {
    // rand → 0.999999 forces PRISMATIC for every death.
    const room = makeActiveRoom(() => 0.999999);
    // Exhaust all prismatic cards — each offer shows 3 from the pool of 5.
    // Pick one per offer until none remain (maxLevel: 1, so one pick = maxed).
    // After 5 picks, 5 cards are maxed; continue until an offer contains
    // zero prismatic cards (meaning the pool is empty and top-up kicks in).
    let exhausted = false;
    for (let attempt = 0; attempt < 20 && !exhausted; attempt++) {
      room.recordDeath('p1');
      const offer = room.rollUpgradeOffer('p1')!;
      const pCards = offer.cards.filter((c) => c.rarity === 'PRISMATIC');
      if (pCards.length === 0) {
        // Top-up triggered — this is what we're testing.
        expect(offer.cards).toHaveLength(3);
        exhausted = true;
      } else {
        // Still have prismatic cards — pick the first one to max it.
        room.applyUpgradeSelection('p1', offer.offerId, pCards[0].cardId);
      }
    }
    expect(exhausted).toBe(true);
  });

  it('per-player upgrade state evaporates on removePlayer', () => {
    const room = makeActiveRoom();
    const offer = dieAndGetOffer(room)!;
    room.removePlayer('s1');
    expect(room.applyUpgradeSelection('p1', offer.offerId, offer.cards[0].cardId)).toBeNull();
    expect(room.getModifiersFor('p1').maxHealthBonus).toBe(0);
  });
});

describe('GameRoom — upgrade selection validation', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = makeActiveRoom(() => 0);
  });

  it('valid selection increments the stack and returns the full snapshot', () => {
    const offer = dieAndGetOffer(room)!;
    const pick = offer.cards[1];
    const applied = room.applyUpgradeSelection('p1', offer.offerId, pick.cardId);
    expect(applied).not.toBeNull();
    expect(applied!.cardId).toBe(pick.cardId);
    expect(applied!.newLevel).toBe(1);
    expect(applied!.rarity).toBe(pick.rarity);
    // The snapshot reflects the pick (some field moved off its default).
    const def = getCardById(pick.cardId)!;
    if (def.stat === 'maxHealthBonus') {
      expect(applied!.modifiers.maxHealthBonus).toBeGreaterThan(0);
    } else {
      expect(applied!.modifiers[def.stat]).not.toBe(1);
    }
  });

  it('rejects a wrong offerId', () => {
    const offer = dieAndGetOffer(room)!;
    expect(room.applyUpgradeSelection('p1', 'bogus', offer.cards[0].cardId)).toBeNull();
  });

  it('rejects a card not in the offer', () => {
    const offer = dieAndGetOffer(room)!;
    const notOffered = UPGRADE_CARDS.find((c) => !offer.cards.some((o) => o.cardId === c.id))!;
    expect(room.applyUpgradeSelection('p1', offer.offerId, notOffered.id)).toBeNull();
  });

  it('rejects a second select (offer consumed)', () => {
    const offer = dieAndGetOffer(room)!;
    expect(room.applyUpgradeSelection('p1', offer.offerId, offer.cards[0].cardId)).not.toBeNull();
    expect(room.applyUpgradeSelection('p1', offer.offerId, offer.cards[1].cardId)).toBeNull();
  });

  it('rejects a selection past the deadline (+grace)', () => {
    vi.useFakeTimers();
    try {
      const offer = dieAndGetOffer(room)!;
      vi.advanceTimersByTime(RESPAWN_DELAY_MS + 500);
      expect(room.applyUpgradeSelection('p1', offer.offerId, offer.cards[0].cardId)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("one player's offer cannot be consumed by another player", () => {
    const offer = dieAndGetOffer(room)!;
    expect(room.applyUpgradeSelection('p2', offer.offerId, offer.cards[0].cardId)).toBeNull();
    // p1's offer is still intact.
    expect(room.applyUpgradeSelection('p1', offer.offerId, offer.cards[0].cardId)).not.toBeNull();
  });
});

describe('GameRoom — auto-resolve at respawn', () => {
  it('auto-picks a card from the surviving offer and consumes it', () => {
    const room = makeActiveRoom(() => 0);
    const offer = dieAndGetOffer(room)!;
    const auto = room.autoResolveOffer('p1', () => 0); // rand 0 → first card
    expect(auto).not.toBeNull();
    expect(auto!.cardId).toBe(offer.cards[0].cardId);
    expect(auto!.newLevel).toBe(1);
    // Idempotent: second call finds no pending offer.
    expect(room.autoResolveOffer('p1')).toBeNull();
  });

  it('returns null when the player already picked manually', () => {
    const room = makeActiveRoom(() => 0);
    const offer = dieAndGetOffer(room)!;
    room.applyUpgradeSelection('p1', offer.offerId, offer.cards[0].cardId);
    expect(room.autoResolveOffer('p1')).toBeNull();
  });
});

describe('GameRoom — upgrade-aware HP and damage', () => {
  it('getMaxHpFor reflects health-card stacks; un-upgraded players keep the base', () => {
    // seq rand 0.75 → death-1 bracket [70,25,5,0] lands on SILVER (hp_s is a SILVER card,
    // so same-rarity offers can actually contain it — BRONZE offers never would).
    const room = makeActiveRoom(() => 0.75);
    expect(room.getMaxHpFor('p1')).toBe(PLAYER_MAX_HP);
    // Give p1 Tough Skin (hp_s, +2 per level) via a forced offer cycle.
    room.recordDeath('p1');
    let offer = room.rollUpgradeOffer('p1');
    while (offer && !offer.cards.some((c) => c.cardId === 'hp_s')) {
      offer = room.rollUpgradeOffer('p1');
    }
    expect(offer).not.toBeNull();
    room.applyUpgradeSelection('p1', offer!.offerId, 'hp_s');
    expect(room.getMaxHpFor('p1')).toBe(PLAYER_MAX_HP + 2);
    expect(room.getMaxHpFor('p2')).toBe(PLAYER_MAX_HP);
    // restoreFullHp fills to the upgraded max.
    room.restoreFullHp('p1');
    expect(room.getHp('p1')).toBe(PLAYER_MAX_HP + 2);
  });

  it('getDamageMultFor maps spellTypes to the right modifier and defaults to 1', () => {
    const room = makeActiveRoom(() => 0);
    expect(room.getDamageMultFor('p1', 'FIRE_BOLT')).toBe(1);
    expect(room.getDamageMultFor('p1', 'LIGHTNING_BEAM')).toBe(1);
    expect(room.getDamageMultFor('p1', 'WATER_SPIKE')).toBe(1);
    // SPELL_MAX_BASE_DAMAGE clamp sanity: ceil(maxBase × mult) stays below MAX_SPELL_DAMAGE
    // for every card combination in V1 (the flat cap remains the outer bound).
    expect(Math.ceil(SPELL_MAX_BASE_DAMAGE.FIRE_BOLT * 4)).toBeLessThan(MAX_SPELL_DAMAGE);
  });

  it('scheduleRespawn no longer restores HP itself (the caller does, post-auto-resolve)', () => {
    vi.useFakeTimers();
    try {
      const room = makeActiveRoom(() => 0);
      room.applyDamage('p1', PLAYER_MAX_HP); // down to 0
      const onFire = vi.fn(() => {
        // At fire time HP is STILL 0 — server.ts auto-resolves the offer, then restores.
        expect(room.getHp('p1')).toBe(0);
        room.restoreFullHp('p1');
      });
      room.scheduleRespawn('p1', onFire);
      vi.advanceTimersByTime(RESPAWN_DELAY_MS);
      expect(onFire).toHaveBeenCalledOnce();
      expect(room.getHp('p1')).toBe(PLAYER_MAX_HP);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GameRoom — upgrade state reset', () => {
  it('clearCombatState wipes stacks, pending offers, and the rarity sequence', () => {
    const room = makeActiveRoom(() => 0);
    const offer = dieAndGetOffer(room)!;
    room.applyUpgradeSelection('p1', offer.offerId, offer.cards[0].cardId);
    room.transitionTo('ENDED'); // calls clearCombatState
    expect(room.getModifiersFor('p1').fireballDamageMult).toBe(1);
    expect(room.getModifiersFor('p1').maxHealthBonus).toBe(0);
    expect(room.getRaritySequence()).toHaveLength(0);
    expect(room.autoResolveOffer('p1')).toBeNull();
  });
});
