// Phase 14 — Team Deathmatch tunables. Mirrored in game-server (SPAWNPOINTS, RESPAWN_INVULN_MAX_MS) — keep in sync.
// Live-tunable via the gameplay debug panel; COPY VALUES emits a paste-ready SPAWNPOINTS literal.

export type SpawnPoint = { x: number; y: number };
export type MapSpawns = { teamA: SpawnPoint[]; teamB: SpawnPoint[] };

/** D-09: per-map team spawnpoints, keyed by mapId (MAP_POOL ids). Multiple per team. */
export const SPAWNPOINTS: Record<string, MapSpawns> = {
  WORLD:     { teamA: [{ x: 96, y: 96 }, { x: 96, y: 224 }],  teamB: [{ x: 384, y: 96 }, { x: 384, y: 224 }] },
  DUNGEON_1: { teamA: [{ x: 80, y: 120 }, { x: 80, y: 240 }], teamB: [{ x: 400, y: 120 }, { x: 400, y: 240 }] },
  STAGES:    { teamA: [{ x: 96, y: 160 }, { x: 128, y: 96 }], teamB: [{ x: 384, y: 160 }, { x: 352, y: 224 }] },
};

export const TDM_WIN_TARGET = 30;          // D-01 client mirror (server is authority).
export const RESPAWN_INVULN_MAX_MS = 2500; // D-12: invuln hard cap (~2.5s). Server-authoritative copy in game-room.
