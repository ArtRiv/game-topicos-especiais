// Deterministic MATCH-START spawn assignment, shared shape with the server's
// GameRoom.pickStartSpawn (game-server/src/game-room.ts). Both sides MUST compute the identical
// result so the client can place the local player at its team spawn the instant GameScene boots,
// with no late server snap to correct it (a slow round-trip otherwise surfaced as a match-start
// teleport). Respawns remain server-authoritative + random (GameRoom.pickSpawn) — only match START
// is deterministic.
//
// Rule (identical to the server): among this player's teammates (same team), sorted by id, take this
// player's index; spawn = teamList[index % teamList.length]. Identical inputs → identical output.

import { SPAWNPOINTS, type SpawnPoint } from './config/tdm';

type RosterEntry = { id: string; team?: number };

/**
 * Resolve a player's deterministic match-start spawn.
 *
 * @param playerId  the player to place
 * @param team      the player's team (0 = A, 1 = B; undefined → treated as 0/team A)
 * @param roster    the full match roster (all teams) — only same-team entries are used
 * @param mapId     the map id (MAP_POOL id, e.g. 'STAGES'); unknown falls back to WORLD
 * @returns         the chosen spawn point, or {x:100,y:100} if the team has no spawns configured
 */
export function pickStartSpawn(
  playerId: string,
  team: number | undefined,
  roster: readonly RosterEntry[],
  mapId: string,
): SpawnPoint {
  const map = SPAWNPOINTS[mapId] ?? SPAWNPOINTS['WORLD'];
  const list = (team === 1 ? map.teamB : map.teamA) ?? []; // undefined/0 -> teamA
  if (list.length === 0) return { x: 100, y: 100 };
  const teammates = roster
    .filter((p) => (p.team ?? 0) === (team ?? 0))
    .map((p) => p.id)
    .sort();
  const idx = teammates.indexOf(playerId);
  return list[(idx < 0 ? 0 : idx) % list.length];
}
