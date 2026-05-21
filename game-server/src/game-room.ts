import type { MatchState, MatchMode, PlayerInfo } from './types.js';
import {
  PLAUSIBILITY_RANGE_PX,
  PLAUSIBILITY_STALE_MS,
  RESPAWN_DELAY_MS,
  MAX_SPELL_DAMAGE,
} from './types.js';

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
  #spawnPoints = new Map<string, { x: number; y: number }>();               // playerId → original spawn (D-10)
  #maxHp: number = 100;                                                     // mirror client CONFIG.PLAYER_START_MAX_HEALTH

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
  }

  public getSpawnPoint(playerId: string): { x: number; y: number } | undefined {
    return this.#spawnPoints.get(playerId);
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
   *  Caller (server.ts) supplies the callback that broadcasts RespawnPayload to the lobby room. */
  public scheduleRespawn(playerId: string, onFire: () => void): void {
    if (this.#matchMode === 'last-standing') return;            // D-12
    const existing = this.#respawnHandles.get(playerId);
    if (existing) clearTimeout(existing);
    const h = setTimeout(() => {
      this.#hp.set(playerId, this.#maxHp);                       // restore HP at respawn
      this.#respawnHandles.delete(playerId);
      onFire();
    }, RESPAWN_DELAY_MS);
    this.#respawnHandles.set(playerId, h);
  }

  /** D-12 structural support: respawn vs last-standing match mode. No client-facing setter exposed
   *  (T-09.3.02-07 mitigation). Lobby UI selector deferred to Phase 9.4 / 10. */
  public setMatchMode(mode: MatchMode): void { this.#matchMode = mode; }
  public get matchMode(): MatchMode { return this.#matchMode; }

  /** Wipe all combat state. Called on room emptied (removePlayer last) and on transition → ENDED. */
  public clearCombatState(): void {
    this.#lastPos.clear();
    this.#confirmedSpellHits.clear();
    this.#hp.clear();
    for (const h of this.#respawnHandles.values()) clearTimeout(h);
    this.#respawnHandles.clear();
    this.#playerInfo.clear();
    this.#spawnPoints.clear();
  }
}
