import type {
  MatchState,
  MatchMode,
  PlayerInfo,
  TdmPlayerStat,
  SpawnAssignment,
  CardRarity,
  PlayerModifiers,
  OfferedCard,
  UpgradeOfferPayload,
} from './types.js';
import {
  PLAUSIBILITY_RANGE_PX,
  PLAUSIBILITY_STALE_MS,
  RESPAWN_DELAY_MS,
  MAX_SPELL_DAMAGE,
  RESPAWN_INVULN_MAX_MS,
  PLAYER_MAX_HP,
} from './types.js';
import {
  UPGRADE_CARDS,
  getCardById,
  computeModifiers,
  DEFAULT_PLAYER_MODIFIERS,
  generateRaritySequence,
  RARITY_SEQUENCE_LENGTH,
} from './upgrade-cards.js';
import { randomUUID } from 'node:crypto';

// Phase 14 (D-09): server-side copy of per-map team spawnpoints. The server has no access to the
// client config barrel (src/common/config/tdm.ts), so this literal is duplicated here. KEEP IN SYNC
// with src/common/config/tdm.ts — the debug-panel COPY VALUES path emits a literal you paste BOTH places.
type SpawnPoint = { x: number; y: number };
type MapSpawns = { teamA: SpawnPoint[]; teamB: SpawnPoint[] };

const SPAWNPOINTS: Record<string, MapSpawns> = {
  WORLD:     { teamA: [{ x: 96, y: 96 }, { x: 96, y: 224 }],  teamB: [{ x: 384, y: 96 }, { x: 384, y: 224 }] },
  DUNGEON_1: { teamA: [{ x: 80, y: 120 }, { x: 80, y: 240 }], teamB: [{ x: 400, y: 120 }, { x: 400, y: 240 }] },
  STAGES: {
    teamA: [
      { x: 104, y: 202 },
      { x: 142, y: 486 },
      { x: 125, y: 742 },
      { x: 175, y: 958 },
    ],
    teamB: [
      { x: 1218, y: 827 },
      { x: 1027, y: 1022 },
      { x: 937, y: 518 },
      { x: 649, y: 199 },
    ],
  },
};

const VALID_NEXT: Record<MatchState, MatchState[]> = {
  LOBBY: ['LOADING'],
  LOADING: ['COUNTDOWN', 'ENDED'],
  COUNTDOWN: ['ACTIVE', 'ENDED'],
  ACTIVE: ['ENDED'],
  ENDED: [],
};

export class GameRoom {
  #players: Map<string, string> = new Map(); // socketId → playerId
  #state: MatchState = 'LOBBY';
  #loadedSocketIds: Set<string> = new Set();
  /** Pending countdown setTimeout handles owned by this room. Cleared on transition out of
   * COUNTDOWN or when the room becomes empty. (WR-07 fix from Phase 07-REVIEW.md.) */
  #countdownHandles: ReturnType<typeof setTimeout>[] = [];
  public transitionLock: boolean = false;

  // --- Phase 9.3: host-authoritative damage state (D-01..D-12) ---
  #lastPos = new Map<string, { x: number; y: number; ts: number }>();      // playerId → snapshot
  #hp = new Map<string, number>();                                          // playerId → current HP
  #confirmedSpellHits = new Set<string>();                                  // spellId → consumed (dedupe)
  #respawnHandles = new Map<string, ReturnType<typeof setTimeout>>();      // playerId → pending respawn timer
  #playerInfo = new Map<string, PlayerInfo>();                              // playerId → info (for team lookups)
  #matchMode: MatchMode = 'respawn';                                        // D-12: structural support, no UI surface in 9.3
  #winTarget: number = 30;                                                   // TDM kill target (per-match, from lobby config)
  #spawnPoints = new Map<string, { x: number; y: number }>();               // playerId → original spawn (D-10)
  #matchSpawns: SpawnAssignment[] = [];                                      // match-start spawns, replayable on scene-ready
  #maxHp: number = PLAYER_MAX_HP;                                           // mirror client CONFIG.PLAYER_START_MAX_HEALTH

  // --- Special-spell pickups (server-authoritative spawn + first-claim-wins) ---
  #pendingPickups = new Map<string, { spellType: string; x: number; y: number; claimedBy: string | null }>();
  #pickupHandles: ReturnType<typeof setTimeout>[] = [];

  // --- Phase 14: team-deathmatch scoring state (D-04, D-07) ---
  #teamScores: [number, number] = [0, 0];                                   // shared per-team kill total
  #kills = new Map<string, number>();                                       // playerId → kills (caster-attributed)
  #deaths = new Map<string, number>();                                      // playerId → deaths (target-attributed)
  // --- Phase 14: server-authoritative respawn invuln (D-12, D-14) ---
  #invulnUntil = new Map<string, number>();                                 // playerId → epoch ms until which hits are rejected

  // --- TDM death-card upgrades (server-authoritative) ---
  #upgradesEnabled: boolean = false;                                        // from lobby config at lobby:start
  #raritySequence: CardRarity[] = [];                                       // rolled once per match; Nth death → [min(N,len)-1]
  #cardStacks = new Map<string, Map<string, number>>();                     // playerId → (cardId → level)
  #pendingOffers = new Map<string, { offerId: string; cardIds: string[]; deadline: number }>(); // playerId → live offer

  get state(): MatchState { return this.#state; }

  addPlayer(playerId: string, socketId: string): void {
    this.#players.set(socketId, playerId);
  }

  removePlayer(socketId: string): string | undefined {
    const playerId = this.#players.get(socketId);
    this.#players.delete(socketId);
    this.#loadedSocketIds.delete(socketId);
    // Phase 9.3: per-player combat-state cleanup so a mid-respawn disconnect doesn't fire
    // a respawn broadcast for a player who isn't there anymore.
    if (playerId !== undefined) {
      const h = this.#respawnHandles.get(playerId);
      if (h) { clearTimeout(h); this.#respawnHandles.delete(playerId); }
      this.#lastPos.delete(playerId);
      this.#hp.delete(playerId);
      this.#playerInfo.delete(playerId);
      this.#spawnPoints.delete(playerId);
      // Death-card upgrades: a disconnect mid-offer just evaporates (no reconnect support).
      this.#cardStacks.delete(playerId);
      this.#pendingOffers.delete(playerId);
    }
    if (this.#players.size === 0) {
      this.clearCountdownTimers();
      this.clearCombatState();
    }
    return playerId;
  }

  getPlayerIdBySocketId(socketId: string): string | undefined {
    return this.#players.get(socketId);
  }

  /** Reverse lookup for targeted emits (e.g. upgrade:offer goes only to the dying player). */
  getSocketIdByPlayerId(playerId: string): string | undefined {
    for (const [socketId, pid] of this.#players) {
      if (pid === playerId) return socketId;
    }
    return undefined;
  }

  getOtherSocketIds(socketId: string): string[] {
    return Array.from(this.#players.keys()).filter(id => id !== socketId);
  }

  getAllSocketIds(): string[] {
    return Array.from(this.#players.keys());
  }

  get playerCount(): number {
    return this.#players.size;
  }

  /**
   * Attempt a state transition. Throws if the transition is not in the VALID_NEXT table.
   * Caller (server.ts) is responsible for broadcasting `match:state-changed` after a successful transition.
   */
  transitionTo(next: MatchState): void {
    const allowed = VALID_NEXT[this.#state];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid match transition: ${this.#state} → ${next}`);
    }
    const prev = this.#state;
    this.#state = next;
    if (next !== 'LOADING') {
      this.#loadedSocketIds.clear();
    }
    if (prev === 'COUNTDOWN' && next !== 'COUNTDOWN') this.clearCountdownTimers();
    // Phase 9.3: combat state lives only within an active match; clear on match end.
    if (next === 'ENDED') this.clearCombatState();
  }

  /**
   * Mark a socket as having reported `match:loaded`. Returns true exactly once per LOADING cycle:
   * the call that completes the set (every player loaded) returns true so the caller can transition.
   * All other calls return false. Invalid-state calls (not LOADING) return false silently.
   *
   * Note: duplicate acks (Set semantics) and acks AFTER the set is already complete both return
   * false. Only the transition from "incomplete set" → "complete set" returns true.
   */
  markLoaded(socketId: string): boolean {
    if (this.#state !== 'LOADING') return false;
    if (!this.#players.has(socketId)) return false;
    const sizeBefore = this.#loadedSocketIds.size;
    this.#loadedSocketIds.add(socketId);
    const sizeAfter = this.#loadedSocketIds.size;
    // Only the call that *completes* the set returns true. Duplicate acks (size unchanged) and
    // acks after the set is already full both return false so the caller transitions exactly once.
    if (sizeAfter === sizeBefore) return false;
    return sizeAfter === this.#players.size;
  }

  /** Append a pending countdown setTimeout handle so the room can cancel it later (WR-07). */
  pushCountdownHandle(h: ReturnType<typeof setTimeout>): void {
    this.#countdownHandles.push(h);
  }

  /** Cancel every pending countdown handle and reset the store. Idempotent. */
  clearCountdownTimers(): void {
    for (const h of this.#countdownHandles) {
      clearTimeout(h);
    }
    this.#countdownHandles = [];
  }

  /** Test/observability accessor — count of acks received in the current LOADING cycle. */
  get loadedCount(): number {
    return this.#loadedSocketIds.size;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 9.3: host-authoritative damage pipeline (D-01..D-12)
  // ──────────────────────────────────────────────────────────────────────────

  /** Cache the latest position for a player. Called by the `game:pos-mirror` socket handler at 20 Hz. */
  public recordPosition(playerId: string, x: number, y: number): void {
    this.#lastPos.set(playerId, { x, y, ts: Date.now() });
  }

  /** Register a player at match start: tracks team info, spawn point, starting HP. */
  public registerPlayer(info: PlayerInfo, spawnX: number, spawnY: number, maxHp: number): void {
    this.#playerInfo.set(info.id, info);
    this.#spawnPoints.set(info.id, { x: spawnX, y: spawnY });
    this.#hp.set(info.id, maxHp);
    this.#maxHp = maxHp;
    // Phase 14: seed per-player kill/death tallies so getMatchStats always has a row (D-07).
    this.#kills.set(info.id, 0);
    this.#deaths.set(info.id, 0);
  }

  public getSpawnPoint(playerId: string): { x: number; y: number } | undefined {
    return this.#spawnPoints.get(playerId);
  }

  /** Server-authoritative max HP (mirror of client CONFIG.PLAYER_START_MAX_HEALTH), set by
   *  registerPlayer. Lets damage:confirmed carry both current + max so clients render the bar
   *  from server truth instead of subtracting locally (Phase 14 bugfix: HP-drift / stuck-at-1). */
  public getMaxHp(): number {
    return this.#maxHp;
  }

  /** Current server-authoritative HP for a player (or 0 if unknown). */
  public getHp(playerId: string): number {
    return this.#hp.get(playerId) ?? 0;
  }

  /** Phase 14 bugfix (#1/#2): remember the match-start spawn assignments so a client whose
   *  GameScene boots AFTER the COUNTDOWN→ACTIVE `match:spawns` broadcast (the LoadingScene
   *  cinematic outlasts the server countdown) can request a replay via `match:scene-ready`. */
  public setMatchSpawns(spawns: SpawnAssignment[]): void {
    this.#matchSpawns = spawns;
  }

  /** The stored match-start spawn assignments (empty until COUNTDOWN→ACTIVE computes them). */
  public getMatchSpawns(): SpawnAssignment[] {
    return this.#matchSpawns;
  }

  /** D-10/D-11: pick one of the player's team spawnpoints at RANDOM (changed from the prior
   *  farthest-from-enemy heuristic — random keeps spawns unpredictable each death, which the
   *  enlarged per-team spawn sets on the event map make viable). Server-authoritative — reads team
   *  from #playerInfo; the client never asserts a spawn (T-14-06). Never throws (T-14-08): unknown
   *  mapId falls back to WORLD, undefined team defaults to teamA, empty list returns {100,100}.
   *  Overflow (more players than spawns) is implicitly safe — players may legitimately share a spawn. */
  public pickSpawn(playerId: string, mapId: string): { x: number; y: number } {
    const team = this.#playerInfo.get(playerId)?.team;
    const map = SPAWNPOINTS[mapId] ?? SPAWNPOINTS['WORLD'];
    const list = team === 1 ? map.teamB : map.teamA;   // undefined/0 -> teamA (D-11)
    if (list.length === 0) return { x: 100, y: 100 };
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Match-START spawn — DETERMINISTIC, not random. The client computes the SAME assignment locally
   *  (pickStartSpawn in src/common/spawn-assignment.ts) so it can place the player at the correct spot
   *  the instant GameScene boots, with NO late server snap to correct it (which, on a slow round-trip,
   *  showed up as a visible match-start teleport). Random spawns still apply on every RESPAWN (pickSpawn).
   *
   *  Rule: among this player's teammates (same team), sorted by id, take this player's index; spawn =
   *  teamList[index % teamList.length]. Identical inputs on client + server → identical output. MUST be
   *  called AFTER all players are registered (so the team roster is complete). Same fallbacks as pickSpawn. */
  public pickStartSpawn(playerId: string, mapId: string): { x: number; y: number } {
    const team = this.#playerInfo.get(playerId)?.team;
    const map = SPAWNPOINTS[mapId] ?? SPAWNPOINTS['WORLD'];
    const list = team === 1 ? map.teamB : map.teamA;   // undefined/0 -> teamA (D-11)
    if (list.length === 0) return { x: 100, y: 100 };
    const teammates = [...this.#playerInfo.values()]
      .filter((p) => (p.team ?? 0) === (team ?? 0))
      .map((p) => p.id)
      .sort();
    const idx = teammates.indexOf(playerId);
    return list[(idx < 0 ? 0 : idx) % list.length];
  }

  /** D-05 friendly-fire check. Returns true only when BOTH players have a defined team that matches.
   *  When either side is undefined (e.g., free-for-all 1v1), returns false — FF is effectively disabled. */
  public isSameTeam(casterId: string, targetId: string): boolean {
    const a = this.#playerInfo.get(casterId);
    const b = this.#playerInfo.get(targetId);
    if (!a || !b) return false;
    if (a.team === undefined || b.team === undefined) return false;
    return a.team === b.team;
  }

  /** D-02 plausibility validator. Returns false when:
   *  - caster and target are on the same team (D-05 FF short-circuit)
   *  - target has no cached position
   *  - cached snapshot is older than PLAUSIBILITY_STALE_MS
   *  - claimed hit is further than PLAUSIBILITY_RANGE_PX from cached position
   *  Bad/late claims are silently dropped per D-02. */
  public validateHit(
    claim: { targetId: string; hitX: number; hitY: number; casterId: string },
    now: number,
  ): boolean {
    if (this.isSameTeam(claim.casterId, claim.targetId)) return false;
    const known = this.#lastPos.get(claim.targetId);
    if (!known) return false;
    if (now - known.ts > PLAUSIBILITY_STALE_MS) return false;
    // D-14: reject hits on a server-tracked invulnerable target (respawn protection). The server's
    // #invulnUntil map is the sole authority — the client blink/cancel (Plan 04) is cosmetic only.
    if (now < (this.#invulnUntil.get(claim.targetId) ?? 0)) return false;
    const dx = known.x - claim.hitX;
    const dy = known.y - claim.hitY;
    return dx * dx + dy * dy <= PLAUSIBILITY_RANGE_PX * PLAUSIBILITY_RANGE_PX;
  }

  /** Dedupe per-spell hit broadcasts (RESEARCH.md §1 landmine 5: N clients each emit the same hit).
   *  Returns true exactly once per spellId; subsequent calls return false. */
  public tryConsumeHit(spellId: string): boolean {
    if (this.#confirmedSpellHits.has(spellId)) return false;
    this.#confirmedSpellHits.add(spellId);
    return true;
  }

  /** Apply damage with MAX_SPELL_DAMAGE cap (RESEARCH.md §2 anti-cheat landmine).
   *  Returns the resulting HP, whether the player crossed the 0 threshold this hit, and the capped amount actually applied. */
  public applyDamage(
    targetId: string,
    claimedAmount: number,
  ): { newHp: number; eliminated: boolean; cappedAmount: number } {
    const amount = Math.min(claimedAmount, MAX_SPELL_DAMAGE);
    const cur = this.#hp.get(targetId) ?? 0;
    const next = Math.max(0, cur - amount);
    this.#hp.set(targetId, next);
    return { newHp: next, eliminated: cur > 0 && next === 0, cappedAmount: amount };
  }

  /** Schedule a respawn callback after RESPAWN_DELAY_MS unless matchMode is 'last-standing' (D-12).
   *  Caller (server.ts) supplies the callback that broadcasts RespawnPayload to the lobby room.
   *  The HP restore lives in the callback path (server.ts calls restoreFullHp) — NOT here — because
   *  the death-card auto-pick must resolve first (a Tough Skin auto-pick raises the max to restore to). */
  public scheduleRespawn(playerId: string, onFire: () => void): void {
    if (this.#matchMode === 'last-standing') return;            // D-12
    const existing = this.#respawnHandles.get(playerId);
    if (existing) clearTimeout(existing);
    const h = setTimeout(() => {
      this.#respawnHandles.delete(playerId);
      onFire();
    }, RESPAWN_DELAY_MS);
    this.#respawnHandles.set(playerId, h);
  }

  /** Restore a player to their (upgrade-aware) full HP. Called by server.ts in the respawn
   *  callback AFTER the pending death-card offer is auto-resolved. */
  public restoreFullHp(playerId: string): void {
    this.#hp.set(playerId, this.getMaxHpFor(playerId));
  }

  /** D-12 structural support: respawn vs last-standing match mode. No client-facing setter exposed
   *  (T-09.3.02-07 mitigation). Lobby UI selector deferred to Phase 9.4 / 10. */
  public setMatchMode(mode: MatchMode): void { this.#matchMode = mode; }
  public get matchMode(): MatchMode { return this.#matchMode; }

  // Per-match TDM kill target (from lobby config; default 30). Read by the win-check in server.ts.
  public setWinTarget(target: number): void { this.#winTarget = target; }
  public get winTarget(): number { return this.#winTarget; }

  // --- Special-spell pickups ---
  public addPendingPickup(pickupId: string, spellType: string, x: number, y: number): void {
    this.#pendingPickups.set(pickupId, { spellType, x, y, claimedBy: null });
  }

  /** First-claim-wins. Returns true exactly once per pickupId (the winning claim); later claims drop. */
  public tryClaimPickup(pickupId: string, playerId: string): boolean {
    const p = this.#pendingPickups.get(pickupId);
    if (!p || p.claimedBy !== null) return false;
    p.claimedBy = playerId;
    return true;
  }

  /** Un-collected pickups (for replay to a late-booting client via match:scene-ready). */
  public getActivePickups(): { pickupId: string; spellType: string; x: number; y: number }[] {
    const out: { pickupId: string; spellType: string; x: number; y: number }[] = [];
    for (const [pickupId, p] of this.#pendingPickups) {
      if (p.claimedBy === null) out.push({ pickupId, spellType: p.spellType, x: p.x, y: p.y });
    }
    return out;
  }

  public pushPickupHandle(h: ReturnType<typeof setTimeout>): void { this.#pickupHandles.push(h); }

  public clearPickupTimers(): void {
    for (const h of this.#pickupHandles) clearTimeout(h);
    this.#pickupHandles = [];
  }

  /** D-12/D-14: start the server-authoritative respawn-invuln window for a player. validateHit
   *  rejects any spell:hit on this player until RESPAWN_INVULN_MAX_MS from now. Called by server.ts
   *  on match start and on each respawn callback — never from a client message. */
  public startInvuln(playerId: string): void {
    this.#invulnUntil.set(playerId, Date.now() + RESPAWN_INVULN_MAX_MS);
  }

  /** Clear a player's invuln window early (e.g. server-side hook; the client move/cast cancel in
   *  Plan 04 is cosmetic-only and does NOT call this — the server cap is the authority). */
  public clearInvuln(playerId: string): void {
    this.#invulnUntil.delete(playerId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TDM death-card upgrades. Server-authoritative: the rarity sequence, the 3
  // offered cards, selection validation, auto-pick, per-player stacks, and the
  // PlayerModifiers snapshot are all decided HERE. Clients only render offers
  // and echo back a cardId.
  // ──────────────────────────────────────────────────────────────────────────

  public setUpgradesEnabled(enabled: boolean): void { this.#upgradesEnabled = enabled; }
  public get upgradesEnabled(): boolean { return this.#upgradesEnabled; }

  /** Roll the match's shared rarity sequence. Called once at COUNTDOWN→ACTIVE (TDM + upgrades on). */
  public initRaritySequence(rand: () => number = Math.random): void {
    this.#raritySequence = generateRaritySequence(rand);
  }

  /** Test/observability accessor. */
  public getRaritySequence(): readonly CardRarity[] { return this.#raritySequence; }

  /** Current snapshot of a player's modifiers from their card stacks. Defaults when no stacks. */
  public getModifiersFor(playerId: string): PlayerModifiers {
    const stacks = this.#cardStacks.get(playerId);
    if (!stacks || stacks.size === 0) return { ...DEFAULT_PLAYER_MODIFIERS };
    return computeModifiers(stacks);
  }

  /** Upgrade-aware per-player max HP: room base + flat card bonus (half-heart units). */
  public getMaxHpFor(playerId: string): number {
    return this.#maxHp + this.getModifiersFor(playerId).maxHealthBonus;
  }

  /** Damage multiplier the clamp allows a caster for a given spellType (1 when un-upgraded/unknown). */
  public getDamageMultFor(playerId: string, spellType: string): number {
    const mods = this.getModifiersFor(playerId);
    if (spellType === 'FIRE_BOLT') return mods.fireballDamageMult;
    if (spellType === 'LIGHTNING_BEAM') return mods.lightningDamageMult;
    return 1;
  }

  /** Roll a 3-card offer for a player's CURRENT death count (call AFTER recordDeath). Rarity comes
   *  from the match sequence; eligible = cards the player hasn't maxed. Thin pool tops up from other
   *  rarities; a fully maxed-out player gets null (no offer this death). Replaces any stale offer. */
  public rollUpgradeOffer(playerId: string, rand: () => number = Math.random): UpgradeOfferPayload | null {
    if (!this.#upgradesEnabled || this.#raritySequence.length === 0) return null;
    const deathNumber = this.#deaths.get(playerId) ?? 0;
    if (deathNumber < 1) return null;
    const rarity = this.#raritySequence[Math.min(deathNumber, RARITY_SEQUENCE_LENGTH) - 1];

    const stacks = this.#cardStacks.get(playerId);
    const levelOf = (cardId: string): number => stacks?.get(cardId) ?? 0;
    const eligible = UPGRADE_CARDS.filter((c) => levelOf(c.id) < c.maxLevel);
    const sameRarity = eligible.filter((c) => c.rarity === rarity);
    const others = eligible.filter((c) => c.rarity !== rarity);

    const pickRandom = <T>(pool: T[], count: number): T[] => {
      const copy = [...pool];
      const out: T[] = [];
      while (copy.length > 0 && out.length < count) {
        out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
      }
      return out;
    };

    const chosen = pickRandom(sameRarity, 3);
    if (chosen.length < 3) chosen.push(...pickRandom(others, 3 - chosen.length));
    if (chosen.length === 0) return null;

    const offerId = randomUUID();
    const deadline = Date.now() + RESPAWN_DELAY_MS;
    this.#pendingOffers.set(playerId, { offerId, cardIds: chosen.map((c) => c.id), deadline });

    const cards: OfferedCard[] = chosen.map((c) => ({
      cardId: c.id,
      name: c.name,
      description: c.description,
      rarity: c.rarity,
      category: c.category,
      currentLevel: levelOf(c.id),
      maxLevel: c.maxLevel,
    }));
    return { offerId, rarity, deathNumber, cards, deadlineTs: deadline };
  }

  /** Validate + apply a player's pick. Returns the applied result (with the full recomputed
   *  modifier snapshot) or null on any validation failure (silently dropped by the caller). */
  public applyUpgradeSelection(
    playerId: string,
    offerId: string,
    cardId: string,
  ): { cardId: string; newLevel: number; rarity: CardRarity; modifiers: PlayerModifiers } | null {
    const offer = this.#pendingOffers.get(playerId);
    if (!offer || offer.offerId !== offerId) return null;
    if (!offer.cardIds.includes(cardId)) return null;
    // Small grace past the deadline for socket latency — the auto-pick path consumes the offer
    // anyway, so this only matters for a select racing the respawn callback.
    if (Date.now() > offer.deadline + 250) return null;
    const card = getCardById(cardId);
    if (!card) return null;

    let stacks = this.#cardStacks.get(playerId);
    if (!stacks) { stacks = new Map(); this.#cardStacks.set(playerId, stacks); }
    const current = stacks.get(cardId) ?? 0;
    if (current >= card.maxLevel) return null;   // defensive — maxed cards are never offered

    const newLevel = current + 1;
    stacks.set(cardId, newLevel);
    this.#pendingOffers.delete(playerId);
    return { cardId, newLevel, rarity: card.rarity, modifiers: computeModifiers(stacks) };
  }

  /** Auto-pick for an offer that survived to respawn fire. Random card from the stored offer,
   *  same apply path. Null when there is no pending offer (player already picked / none rolled). */
  public autoResolveOffer(
    playerId: string,
    rand: () => number = Math.random,
  ): { cardId: string; newLevel: number; rarity: CardRarity; modifiers: PlayerModifiers } | null {
    const offer = this.#pendingOffers.get(playerId);
    if (!offer) return null;
    const cardId = offer.cardIds[Math.floor(rand() * offer.cardIds.length)];
    // Reuse the validation path but bypass the deadline by applying directly.
    const card = getCardById(cardId);
    if (!card) { this.#pendingOffers.delete(playerId); return null; }
    let stacks = this.#cardStacks.get(playerId);
    if (!stacks) { stacks = new Map(); this.#cardStacks.set(playerId, stacks); }
    const current = stacks.get(cardId) ?? 0;
    if (current >= card.maxLevel) { this.#pendingOffers.delete(playerId); return null; }
    const newLevel = current + 1;
    stacks.set(cardId, newLevel);
    this.#pendingOffers.delete(playerId);
    return { cardId, newLevel, rarity: card.rarity, modifiers: computeModifiers(stacks) };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Phase 14: team-deathmatch scoring (D-04, D-05, D-07). Server-authoritative —
  // attribution reads team ONLY from #playerInfo, never from the client.
  // ──────────────────────────────────────────────────────────────────────────

  /** Read a player's team (0 | 1) from server-side #playerInfo, or undefined if unassigned. */
  public getTeam(playerId: string): number | undefined {
    return this.#playerInfo.get(playerId)?.team;
  }

  /** Credit a confirmed enemy elimination to the caster's team + the caster's personal kill tally.
   *  Defensive (D-05): if the caster has no team (undefined), nothing is scored. Friendly fire is
   *  filtered by the caller via isSameTeam (and short-circuited earlier in validateHit). */
  public addTeamKill(casterId: string): void {
    const team = this.#playerInfo.get(casterId)?.team;
    if (team !== 0 && team !== 1) return;   // no team → never score (D-05)
    this.#teamScores[team]++;
    this.#kills.set(casterId, (this.#kills.get(casterId) ?? 0) + 1);
  }

  /** Tally a death against the eliminated player (D-07). */
  public recordDeath(targetId: string): void {
    this.#deaths.set(targetId, (this.#deaths.get(targetId) ?? 0) + 1);
  }

  /** Current shared per-team scores as a defensive copy [teamA, teamB]. */
  public getTeamScores(): [number, number] {
    return [this.#teamScores[0], this.#teamScores[1]];
  }

  /** One stat row per registered player (D-07). Falls back to 0 for any missing tally. */
  public getMatchStats(): TdmPlayerStat[] {
    const rows: TdmPlayerStat[] = [];
    for (const info of this.#playerInfo.values()) {
      rows.push({
        playerId: info.id,
        name: info.name,
        team: info.team ?? -1,
        kills: this.#kills.get(info.id) ?? 0,
        deaths: this.#deaths.get(info.id) ?? 0,
      });
    }
    return rows;
  }

  /** MVP = highest kills; D-07 tie-break: fewest deaths, then earliest insertion order in #kills
   *  (Map preserves insertion order). Returns null only when there are no players. */
  public getMvpPlayerId(): string | null {
    let mvp: string | null = null;
    let bestKills = -1;
    let bestDeaths = Number.POSITIVE_INFINITY;
    for (const [id, kills] of this.#kills) {
      const deaths = this.#deaths.get(id) ?? 0;
      if (kills > bestKills || (kills === bestKills && deaths < bestDeaths)) {
        mvp = id;
        bestKills = kills;
        bestDeaths = deaths;
      }
    }
    return mvp;
  }

  /** Wipe all combat state. Called on room emptied (removePlayer last) and on transition → ENDED. */
  public clearCombatState(): void {
    this.#lastPos.clear();
    this.#confirmedSpellHits.clear();
    this.#hp.clear();
    for (const h of this.#respawnHandles.values()) clearTimeout(h);
    this.#respawnHandles.clear();
    this.#playerInfo.clear();
    this.#spawnPoints.clear();
    this.#matchSpawns = [];
    // Phase 14: reset TDM scoring so a rematch in the same room starts at 0-0.
    this.#teamScores = [0, 0];
    this.#kills.clear();
    this.#deaths.clear();
    // Phase 14 (D-14): drop any lingering invuln windows so a rematch starts unprotected.
    this.#invulnUntil.clear();
    // Special-spell pickups: cancel pending spawns + clear state so a rematch starts fresh.
    this.clearPickupTimers();
    this.#pendingPickups.clear();
    // Death-card upgrades: all stacks/offers/sequence die with the match (rematch starts clean).
    this.#cardStacks.clear();
    this.#pendingOffers.clear();
    this.#raritySequence = [];
  }
}
