// Server-side socket event payload types.
// Mirrored in src/networking/types.ts on the client — keep in sync when protocol changes.

export type PlayerInfo = {
  id: string;
  name: string;
  socketId: string;
  element?: string;
  team?: number;          // 0 = Team A, 1 = Team B; undefined = unassigned
};

export type Lobby = {
  id: string;
  hostPlayerId: string;
  players: PlayerInfo[];
  mode: string | null;
  status: 'waiting' | 'in-progress';
  config: LobbyConfig;
};

export type LobbyFormat = '1v1' | '2v2' | '3v3' | '4v4' | '5v5' | '6v6' | '7v7' | '8v8' | '9v9' | '10v10';

// Single extensible lobby config object. Future fields (timeLimit?, friendlyFire?, spellModifiers?) are added as optional top-level keys — no nesting, no version envelope, no new socket events (LBC-07).
export type LobbyConfig = {
  format: LobbyFormat;
  mapId: string;          // value from MAP_POOL[i].id
  maxPlayers: number;     // derived: parseInt(format) * 2
  // Future optional fields (LBC-07): timeLimit?, friendlyFire?, spellModifiers? — add as optional top-level keys, no nesting.
};

export type MapPoolEntry = {
  id: string;             // wire identifier (stable)
  displayName: string;    // human-readable lobby label
  thumbnailKey: string;   // Phaser texture key (SCREAMING_SNAKE — matches ASSET_KEYS convention)
};

export const MAP_POOL: readonly MapPoolEntry[] = [
  { id: 'WORLD', displayName: 'Open Field', thumbnailKey: 'MAP_THUMB_WORLD' },
  { id: 'DUNGEON_1', displayName: 'Dungeon', thumbnailKey: 'MAP_THUMB_DUNGEON_1' },
  { id: 'STAGES', displayName: 'Arena', thumbnailKey: 'MAP_THUMB_STAGES' },
] as const;

export type MatchConfig = {
  lobbyId: string;
  players: PlayerInfo[];
  mode: string;
  config: LobbyConfig;
};

/** Outbound: local player sends this every 20 Hz tick */
export type PlayerUpdatePayload = {
  x: number;
  y: number;
  direction: string;
  state: string;
  element: string;
};

/** Inbound: server relays other players' updates */
export type PlayerUpdateBroadcast = PlayerUpdatePayload & { playerId: string };

export type SpellCastPayload = {
  // Phase 9.3 (Plan 03): per-cast UUID for cross-client correlation (matches client mirror).
  spellId: string;
  // SPELL_ID type constant (e.g. 'FIRE_BOLT') — used by remote receivers to look up the factory.
  spellType: string;
  element: string;
  x: number;
  y: number;
  direction: string;
};

export type SpellCastBroadcast = SpellCastPayload & { playerId: string };

export type RoomTransitionPayload = {
  levelName: string;
  doorId: number;
  roomId: number;
};

export type PlayerDisconnectedPayload = {
  playerId: string;
};

/** Match-lifecycle FSM states (LFC-01). Order matters: each state can only advance to the next or to ENDED. */
export type MatchState = 'LOBBY' | 'LOADING' | 'COUNTDOWN' | 'ACTIVE' | 'ENDED';

/** Outbound broadcast: server informs all clients of a match-state transition (LFC-02). */
export type MatchStateChangedPayload = {
  lobbyId: string;
  state: MatchState;
  /** Server epoch ms when the transition was performed; useful for COUNTDOWN sync in Phase 8. */
  serverTs: number;
};

/** Inbound: client tells server it has finished loading and is ready to enter COUNTDOWN (LFC-05). */
export type MatchLoadedPayload = {
  lobbyId: string;
};

/** Outbound broadcast: per-second countdown tick during COUNTDOWN state (LFC-08).
 * Phase 14 (D-18 step 6): the server now emits 5 of these per cycle: 5 → 4 → 3 → 2 → 1,
 * spaced 1000 ms apart (the old 3 → 2 → 1 → FIGHT sequence is replaced by the intro cinematic). */
export type MatchCountdownTickPayload = {
  lobbyId: string;
  /** Seconds remaining at this tick. 5 | 4 | 3 | 2 | 1 at runtime; typed as number so the wire format
   * stays permissive (a future variable-duration mode could ship other counts without a protocol bump). */
  remaining: number;
  /** Display label for the tick. '5' | '4' | '3' | '2' | '1' at runtime; typed as string for the same
   * reason as `remaining` — gives client cinematics room to add new labels without a protocol bump. */
  label: string;
  /** Server epoch ms when the tick was broadcast; mirrors MatchStateChangedPayload.serverTs. */
  serverTs: number;
};

/** Total duration of the COUNTDOWN state in milliseconds — Phase 14 (D-18): 5 ticks at 1000 ms each
 * (5 → 4 → 3 → 2 → 1) for the new intro cinematic. Used by server.ts:startCountdown to schedule the
 * final ACTIVE transition. Server-only constant — the client cinematic uses its own pacing literals. */
export const COUNTDOWN_DURATION_MS = 5000;

/** Trailing hold after the final '1' tick before the COUNTDOWN→ACTIVE transition broadcast.
 * Total COUNTDOWN-to-ACTIVE span is COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS = 5500 ms — fully containing
 * the five one-second ticks so the ACTIVE unlock never fires mid-cinematic. */
export const FIGHT_HOLD_MS = 500;

// ────────────────────────────────────────────────────────────────
// Phase 9.3: Host-authoritative cross-player damage (PVP-02/04/05/06)
// Per D-01..D-04. Sent via socket.io (host is server-side).
// Mirrored in src/networking/types.ts — keep field shapes identical.
// ────────────────────────────────────────────────────────────────

/** Match mode: 'respawn' broadcasts a RespawnPayload after RESPAWN_DELAY_MS; 'last-standing' does not (D-12).
 *  'team-deathmatch' (Phase 14, D-03) adds shared per-team kill scoring + a win condition on top of 'respawn' semantics. */
export type MatchMode = 'respawn' | 'last-standing' | 'team-deathmatch';

/** Phase 14 (D-07): per-player match stats carried in the ENDED broadcast. */
export type TdmPlayerStat = {
  playerId: string;
  name: string;
  team: number;   // 0 | 1
  kills: number;
  deaths: number;
};

/** Phase 14 (D-04, D-17): live team-score broadcast, emitted on every confirmed kill. */
export type TeamScorePayload = {
  teamScores: [number, number];   // [teamA, teamB]
  lastScoringTeam: number;        // 0 | 1 — which number just changed (drives the pop tween)
};

/** Phase 14 (D-04, D-06): single win broadcast on ACTIVE -> ENDED. */
export type MatchEndedPayload = {
  winningTeam: number | null;     // null = draw (not expected this phase, but supported)
  teamScores: [number, number];
  mvpPlayerId: string | null;     // highest kills (D-07 tie-break resolved server-side)
  stats: TdmPlayerStat[];
};

/** Outbound from caster: a local-overlap claim that my spell hit a remote player (D-01). */
export type SpellHitPayload = {
  spellId: string;
  spellType: string;
  casterId: string;
  targetId: string;
  hitX: number;
  hitY: number;
  damage: number;
};

/** Outbound broadcast from server: damage that ALL clients (incl. caster) must apply (PVP-05). */
export type DamageConfirmedPayload = {
  spellId: string;
  targetId: string;
  amount: number;
  spellType: string;
  hitX: number;
  hitY: number;
};

/** Outbound broadcast from server: target hit 0 HP (D-08). */
export type EliminationPayload = {
  playerId: string;
  eliminatedAt: number;
};

/** Outbound broadcast from server: target's respawn timer elapsed (D-08, D-10). */
export type RespawnPayload = {
  playerId: string;
  x: number;
  y: number;
};

/** Phase 14 bugfix (TDM playtest #4): one server spawn assignment for a player. */
export type SpawnAssignment = {
  playerId: string;
  x: number;
  y: number;
};

/** Phase 14 bugfix (TDM playtest #4): outbound broadcast at COUNTDOWN→ACTIVE carrying every
 *  player's match-start team spawnpoint. The client previously placed everyone at the tilemap
 *  door (the "spawn in the middle" bug); now each client snaps its local + remote players to the
 *  server-authoritative farthest-from-enemy team spawn before gameplay unlocks. */
export type MatchSpawnsPayload = {
  spawns: SpawnAssignment[];
};

/** Outbound from any client: my spell hit an environment object (D-04 wall desync fix). */
export type SpellHitEnvironmentPayload = {
  spellId: string;
  hitX: number;
  hitY: number;
};

/** Outbound broadcast from server: a spell is destroyed everywhere (D-04). */
export type SpellDestroyedPayload = {
  spellId: string;
  hitX: number;
  hitY: number;
};

/** Outbound from each client at 20 Hz: position mirror for server-side plausibility cache (RESEARCH.md §2). */
export type PosMirrorPayload = {
  x: number;
  y: number;
};

/** Phase 9.3 tunables — server-side authoritative copies. Mirror in src/common/runtime-config.ts for client-side debug panel. */
export const PLAUSIBILITY_RANGE_PX = 96;       // ~2 tiles at 32 px tilesize. TODO: tune from playtest
export const PLAUSIBILITY_STALE_MS = 200;      // last position update must be within this window. TODO: tune from playtest
export const RESPAWN_DELAY_MS = 5000;          // D-09 default. TODO: tune from playtest
export const MAX_SPELL_DAMAGE = 50;            // RESEARCH.md §2 landmine: cap-check claimed damage. TODO: tune from playtest

/** Phase 14 tunable — server-side authority for the team-deathmatch win condition. */
export const TDM_WIN_TARGET = 30;   // D-01: first team to 30 kills wins. TODO: tune from playtest.

/** Phase 14 tunable — server-side authoritative respawn-invuln window cap (D-12/D-14).
 *  validateHit rejects spell:hit claims against a target while now < #invulnUntil.
 *  Client mirror lives in src/common/config/tdm.ts (sizes the blink only — server is authority). */
export const RESPAWN_INVULN_MAX_MS = 2500;   // ~2.5s. TODO: tune from playtest.
