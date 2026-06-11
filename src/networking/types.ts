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
  winTarget?: number;     // TDM kill target (8 | 15 | 30); default 30 when absent
  upgradesEnabled?: boolean; // TDM death-card upgrades; default true when absent
  // Future optional fields (LBC-07): timeLimit?, friendlyFire? — add as optional top-level keys, no nesting.
};

export type MapPoolEntry = {
  id: string;             // wire identifier (stable)
  displayName: string;    // human-readable lobby label
  thumbnailKey: string;   // Phaser texture key (SCREAMING_SNAKE — matches ASSET_KEYS convention)
};

export const MAP_POOL: readonly MapPoolEntry[] = [
  // Only Arena for the event. (WORLD/DUNGEON_1 removed from the pool — re-add when their spawns/balance
  // are ready.) Keep the array shape so the lobby map picker still works with a single entry.
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
  /** Horizontal sprite mirroring. Independent of `direction` because diagonal
   *  movement (e.g. UP + LEFT) keeps direction=UP for vertical-anim priority
   *  but separately flipX-true so the side anim's mirroring is honored.
   *  Optional for backwards-compat with older clients / fixtures. */
  flipX?: boolean;
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
  // Optional pre-resolved damage carried by cast-once spells whose damage is
  // decided at cast time rather than read from config on the receiver (e.g. the
  // ChargedLightningRay, whose damage scales with charge). Absent for all other
  // spells, which read their own config. Back-compat: older peers ignore it.
  damage?: number;
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
  targetHp: number;      // Phase 14 bugfix: server-authoritative HP AFTER this hit (clients SET, never subtract)
  maxHp: number;         // so clients can render the bar without guessing the max
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

// ── TDM death-card upgrades (server-authoritative; mirrors game-server/src/types.ts) ───────────

export type CardRarity = 'BRONZE' | 'SILVER' | 'GOLD' | 'PRISMATIC';

/** Complete per-player modifier snapshot, computed ONLY on the server from card stacks and
 *  broadcast whole in every upgrade:applied. Clients overwrite, never accumulate. Structurally
 *  identical to SpellModifiers (src/common/spell-modifiers.ts). */
export type PlayerModifiers = {
  fireballDamageMult: number;
  fireballSpeedMult: number;
  fireballSizeMult: number;
  fireballCooldownMult: number;
  fireAreaDamageMult: number;
  fireAreaSizeMult: number;
  fireAreaCooldownMult: number;
  fireAreaDurationMult: number;
  lightningDamageMult: number;
  lightningRangeMult: number;
  lightningChargeSpeedMult: number;
  lightningCooldownMult: number;
  tornadoPullMult: number;
  tornadoSizeMult: number;
  tornadoCooldownMult: number;
  tornadoDurationMult: number;
  waterSpikeDamageMult: number;
  waterSpikeCooldownMult: number;
  earthWallDurationMult: number;
  earthWallPillarHpBonus: number;
  earthBumpKnockbackMult: number;
  earthBumpDamageMult: number;
  earthBumpCooldownMult: number;
  windBoltDamageMult: number;
  windBoltSizeMult: number;
  windBoltSpeedMult: number;
  windBoltCooldownMult: number;
  windBoltPushMult: number;
  dashCooldownMult: number;
  moveSpeedMult: number;
  maxHealthBonus: number;
};

export type UpgradeCardCategory = 'FIREBALL' | 'FIRE_AREA' | 'LIGHTNING' | 'WATER_TORNADO' | 'WATER_SPIKE' | 'EARTH_WALL' | 'EARTH_BUMP' | 'WIND' | 'DASH' | 'PLAYER';

/** One card inside an upgrade:offer — full display data so the client needs no catalog copy. */
export type OfferedCard = {
  cardId: string;
  name: string;
  description: string;
  rarity: CardRarity;       // card's own rarity (≠ offer rarity only on thin-pool top-up)
  category: UpgradeCardCategory;
  currentLevel: number;     // player's stack BEFORE this pick
  maxLevel: number;
};

/** Server → the dying player's socket ONLY: pick 1 of these before deadlineTs. */
export type UpgradeOfferPayload = {
  offerId: string;
  rarity: CardRarity;
  deathNumber: number;      // 1-based personal death count
  cards: OfferedCard[];     // 1..3 (thin pool can yield fewer)
  deadlineTs: number;       // server epoch ms = respawn fire time (auto-pick after)
};

/** Client → server: my pick. playerId is derived from the socket, never trusted from payload. */
export type UpgradeSelectPayload = {
  offerId: string;
  cardId: string;
};

/** Server → ALL clients in lobby: a player's upgrade resolved (picked or auto-picked). */
export type UpgradeAppliedPayload = {
  playerId: string;
  cardId: string;
  newLevel: number;
  rarity: CardRarity;
  autoPicked: boolean;
  modifiers: PlayerModifiers;   // complete snapshot — clients overwrite, never accumulate
};

/** Phase 14 bugfix (TDM playtest #4): one server spawn assignment for a player. */
export type SpawnAssignment = {
  playerId: string;
  x: number;
  y: number;
};

/** Phase 14 bugfix (TDM playtest #4): outbound broadcast at COUNTDOWN→ACTIVE carrying every
 *  player's match-start team spawnpoint. Mirrors game-server/src/types.ts. The client snaps its
 *  local + remote players to the server-authoritative team spawn before gameplay unlocks
 *  (replacing the tilemap-door "spawn in the middle" placement). */
export type MatchSpawnsPayload = {
  spawns: SpawnAssignment[];
};

// ── Special-spell pickups (server-authoritative spawn + first-claim-wins) ──────────────────────
/** Server → all clients: a pickup appeared at (x,y). spellType is a SPELL_ID constant. */
export type PickupSpawnedPayload = {
  pickupId: string;
  spellType: string;   // 'DARK_BOLT' | 'VOID_ORB'
  x: number;
  y: number;
};

/** Client → server: I (the sender's socket) touched this pickup. Server derives the player from
 *  the socket — the claim carries ONLY pickupId so a client can't spoof another player's grab. */
export type PickupClaimPayload = {
  pickupId: string;
};

/** Server → all clients: pickup resolved to a winner. Everyone destroys the sprite. */
export type PickupCollectedPayload = {
  pickupId: string;
  playerId: string;
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
