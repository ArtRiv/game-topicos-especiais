// Client-side network payload types.
// These mirror game-server/src/types.ts — keep in sync when protocol changes.

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
  // Phase 9.3 (Plan 03): per-cast UUID for cross-client correlation (used by the host
  // damage validator + the NETWORK_DAMAGE_CONFIRMED/SPELL_DESTROYED dedupe set).
  // Distinct from `spellType` below which is the SPELL_ID class constant.
  spellId: string;
  // SPELL_ID type constant (e.g. 'FIRE_BOLT') — used by remote receivers to look up the factory.
  spellType: string;
  element: string;
  x: number;
  y: number;
  direction: string;
  targetX: number;
  targetY: number;
};

export type SpellCastBroadcast = SpellCastPayload & { playerId: string };

/** FireBreath channeled spell — start event */
export type BreathStartPayload = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

export type BreathStartBroadcast = BreathStartPayload & { playerId: string };

/** FireBreath channeled spell — per-tick aim update (sent at 20 Hz via unreliable channel) */
export type BreathUpdatePayload = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

export type BreathUpdateBroadcast = BreathUpdatePayload & { playerId: string };

/** FireBreath channeled spell — end event */
export type BreathEndPayload = Record<string, never>;

export type BreathEndBroadcast = { playerId: string };

/** EarthWall — single pillar placement */
export type EarthWallPillarPayload = {
  x: number;
  y: number;
};

export type EarthWallPillarBroadcast = EarthWallPillarPayload & { playerId: string };

/** EarthWall — single pillar destruction (crumbled) */
export type EarthWallPillarDestroyPayload = {
  x: number;
  y: number;
};

export type EarthWallPillarDestroyBroadcast = EarthWallPillarDestroyPayload & { playerId: string };

export type RoomTransitionPayload = {
  levelName: string;
  doorId: number;
  roomId: number;
};

export type PlayerDisconnectedPayload = {
  playerId: string;
};

/** Match-lifecycle FSM states (LFC-01). Mirrors game-server/src/types.ts MatchState. */
export type MatchState = 'LOBBY' | 'LOADING' | 'COUNTDOWN' | 'ACTIVE' | 'ENDED';

/** Inbound broadcast: server informs all clients of a match-state transition (LFC-02). */
export type MatchStateChangedPayload = {
  lobbyId: string;
  state: MatchState;
  /** Server epoch ms when the transition was performed; useful for COUNTDOWN sync in Phase 8. */
  serverTs: number;
};

/** Outbound: client tells server it has finished loading and is ready to enter COUNTDOWN (LFC-05). */
export type MatchLoadedPayload = {
  lobbyId: string;
};

/** Server-emitted countdown tick (LFC-08). Mirrors game-server/src/types.ts MatchCountdownTickPayload. */
export type MatchCountdownTickPayload = {
  lobbyId: string;
  remaining: number;   // 3, 2, 1, 0
  label: string;       // '3' | '2' | '1' | 'FIGHT'
  serverTs: number;
};

// ────────────────────────────────────────────────────────────────
// Phase 9.3: Host-authoritative cross-player damage (PVP-02/04/05/06)
// Per D-01..D-04. Sent via socket.io (NOT WebRTC) because the host is server-side.
// Mirrored in game-server/src/types.ts — keep field shapes identical.
// ────────────────────────────────────────────────────────────────

/** Match mode: 'respawn' broadcasts a RespawnPayload after RESPAWN_DELAY_MS; 'last-standing' does not (D-12). */
export type MatchMode = 'respawn' | 'last-standing';

/** Outbound from caster: a local-overlap claim that my spell hit a remote player (D-01). */
export type SpellHitPayload = {
  spellId: string;       // stable unique spell instance ID (NOT spellType — that's separate)
  spellType: string;     // SPELL_ID constant (e.g. 'FIRE_BOLT') — used by server for damage table lookup
  casterId: string;      // player id of caster (server cross-checks against socket → player id mapping)
  targetId: string;      // player id of claimed target
  hitX: number;          // claimed hit position
  hitY: number;
  damage: number;        // claimed damage; server caps against MAX_SPELL_DAMAGE per RESEARCH.md §2 landmine
};

/** Outbound broadcast from server: damage that ALL clients (incl. caster) must apply (PVP-05). */
export type DamageConfirmedPayload = {
  spellId: string;       // for client-side dedupe / animation correlation
  targetId: string;
  amount: number;        // server-decided final damage (post-cap)
  spellType: string;
  hitX: number;
  hitY: number;
};

/** Outbound broadcast from server: target hit 0 HP (D-08). */
export type EliminationPayload = {
  playerId: string;
  eliminatedAt: number;  // server epoch ms
};

/** Outbound broadcast from server: target's respawn timer elapsed (D-08, D-10). */
export type RespawnPayload = {
  playerId: string;
  x: number;             // server-side original spawn point
  y: number;
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
