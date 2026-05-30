import type { MatchState, MatchMode, PlayerInfo, TdmPlayerStat, SpawnAssignment } from './types.js';
import {
  PLAUSIBILITY_RANGE_PX,
  PLAUSIBILITY_STALE_MS,
  RESPAWN_DELAY_MS,
  MAX_SPELL_DAMAGE,
  RESPAWN_INVULN_MAX_MS,
} from './types.js';

// Phase 14 (D-09): server-side copy of per-map team spawnpoints. The server has no access to the
// client config barrel (src/common/config/tdm.ts), so this literal is duplicated here. KEEP IN SYNC
// with src/common/config/tdm.ts — the debug-panel COPY VALUES path emits a literal you paste BOTH places.
type SpawnPoint = { x: number; y: number };
type MapSpawns = { teamA: SpawnPoint[]; teamB: SpawnPoint[] };

const SPAWNPOINTS: Record<string, MapSpawns> = {
  WORLD:     { teamA: [{ x: 96, y: 96 }, { x: 96, y: 224 }],  teamB: [{ x: 384, y: 96 }, { x: 384, y: 224 }] },
  DUNGEON_1: { teamA: [{ x: 80, y: 120 }, { x: 80, y: 240 }], teamB: [{ x: 400, y: 120 }, { x: 400, y: 240 }] },
  STAGES:    { teamA: [{ x: 96, y: 160 }, { x: 128, y: 96 }], teamB: [{ x: 384, y: 160 }, { x: 352, y: 224 }] },
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
  #spawnPoints = new Map<string, { x: number; y: number }>();               // playerId → original spawn (D-10)
  #matchSpawns: SpawnAssignment[] = [];                                      // match-start spawns, replayable on scene-ready
  #maxHp: number = 100;                                                     // mirror client CONFIG.PLAYER_START_MAX_HEALTH

  // --- Phase 14: team-deathmatch scoring state (D-04, D-07) ---
  #teamScores: [number, number] = [0, 0];                                   // shared per-team kill total
  #kills = new Map<string, number>();                                       // playerId → kills (caster-attributed)
  #deaths = new Map<string, number>();                                      // playerId → deaths (target-attributed)
  // --- Phase 14: server-authoritative respawn invuln (D-12, D-14) ---
  #invulnUntil = new Map<string, number>();                                 // playerId → epoch ms until which hits are rejected

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

  /** D-10/D-11: pick the player's team spawnpoint that is FARTHEST from any living enemy.
   *  Server-authoritative — reads team from #playerInfo and living-enemy positions from
   *  #lastPos/#hp; the client never asserts a spawn (T-14-06). Never throws (T-14-08):
   *  unknown mapId falls back to WORLD, undefined team defaults to teamA, empty list returns {100,100}.
   *  Overflow (more players than spawns) is implicitly safe — players may legitimately share the
   *  farthest spawn (D-11 "reuse/cycle"). Distances are compared squared (no sqrt needed). */
  public pickSpawn(playerId: string, mapId: string): { x: number; y: number } {
    const team = this.#playerInfo.get(playerId)?.team;
    const map = SPAWNPOINTS[mapId] ?? SPAWNPOINTS['WORLD'];
    const list = team === 1 ? map.teamB : map.teamA;   // undefined/0 -> teamA (D-11)
    if (list.length === 0) return { x: 100, y: 100 };

    // Gather LIVING ENEMY positions (different team than this player, HP > 0, known position).
    const enemies: { x: number; y: number }[] = [];
    for (const info of this.#playerInfo.values()) {
      if (info.id === playerId) continue;
      if (info.team === team) continue;                // same team is not an enemy
      if ((this.#hp.get(info.id) ?? 0) <= 0) continue; // dead -> not "living"
      const pos = this.#lastPos.get(info.id);
      if (pos) enemies.push({ x: pos.x, y: pos.y });
    }

    // No living enemies → deterministic first spawn.
    if (enemies.length === 0) return list[0];

    // Score each candidate by its distance to its NEAREST living enemy; pick the largest such distance.
    let best = list[0];
    let bestNearestSq = -1;
    for (const cand of list) {
      let nearestSq = Number.POSITIVE_INFINITY;
      for (const e of enemies) {
        const dx = cand.x - e.x;
        const dy = cand.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestSq) nearestSq = d2;
      }
      if (nearestSq > bestNearestSq) {
        bestNearestSq = nearestSq;
        best = cand;
      }
    }
    return best;
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
  }
}
