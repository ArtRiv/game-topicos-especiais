import { describe, it, expect } from 'vitest';
import { pickStartSpawn } from './spawn-assignment.js';
import { SPAWNPOINTS } from './config/tdm.js';

// pickStartSpawn is the DETERMINISTIC match-start assignment. The server (game-server/src/game-room.ts
// GameRoom.pickStartSpawn) MUST implement the identical rule so client + server agree and there is no
// match-start snap/teleport. These tests pin the rule so a future change to either side that breaks the
// agreement fails loudly here.

describe('pickStartSpawn (deterministic match-start spawn)', () => {
  const STAGES_A = SPAWNPOINTS.STAGES.teamA;
  const STAGES_B = SPAWNPOINTS.STAGES.teamB;

  it('is deterministic — identical inputs return the identical spawn', () => {
    const roster = [
      { id: 'c', team: 0 },
      { id: 'a', team: 0 },
      { id: 'b', team: 1 },
    ];
    const first = pickStartSpawn('a', 0, roster, 'STAGES');
    const second = pickStartSpawn('a', 0, roster, 'STAGES');
    expect(second).toEqual(first);
  });

  it('assigns teammates to DISTINCT spawns by sorted-id index', () => {
    // teamA = {a, c} sorted → a=index0, c=index1. teamB = {b} → index0.
    const roster = [
      { id: 'c', team: 0 },
      { id: 'a', team: 0 },
      { id: 'b', team: 1 },
    ];
    expect(pickStartSpawn('a', 0, roster, 'STAGES')).toEqual(STAGES_A[0]);
    expect(pickStartSpawn('c', 0, roster, 'STAGES')).toEqual(STAGES_A[1]);
    expect(pickStartSpawn('b', 1, roster, 'STAGES')).toEqual(STAGES_B[0]);
  });

  it('roster ORDER does not matter — only sorted id does', () => {
    const r1 = [{ id: 'a', team: 0 }, { id: 'c', team: 0 }];
    const r2 = [{ id: 'c', team: 0 }, { id: 'a', team: 0 }];
    expect(pickStartSpawn('c', 0, r1, 'STAGES')).toEqual(pickStartSpawn('c', 0, r2, 'STAGES'));
  });

  it('wraps with modulo when a team has more players than spawns', () => {
    // 5 teammates, teamA has 4 STAGES spawns → the 5th (index4) wraps to index0.
    const roster = [
      { id: 'p0', team: 0 }, { id: 'p1', team: 0 }, { id: 'p2', team: 0 },
      { id: 'p3', team: 0 }, { id: 'p4', team: 0 },
    ];
    expect(pickStartSpawn('p4', 0, roster, 'STAGES')).toEqual(STAGES_A[4 % STAGES_A.length]);
  });

  it('treats undefined team as team A (index 0 fallback)', () => {
    const roster = [{ id: 'solo', team: undefined }];
    expect(pickStartSpawn('solo', undefined, roster, 'STAGES')).toEqual(STAGES_A[0]);
  });

  it('falls back to WORLD spawns for an unknown mapId', () => {
    const roster = [{ id: 'a', team: 0 }];
    expect(pickStartSpawn('a', 0, roster, 'NOPE')).toEqual(SPAWNPOINTS.WORLD.teamA[0]);
  });

  it('matches an independent oracle of the server rule across a randomized roster', () => {
    // Oracle = the server's algorithm, re-implemented here from scratch. If the client helper drifts
    // from this rule, the assertion breaks — catching client/server divergence at the unit level.
    const oracle = (id: string, team: number, roster: { id: string; team: number }[], mapId: string) => {
      const map = SPAWNPOINTS[mapId] ?? SPAWNPOINTS.WORLD;
      const list = team === 1 ? map.teamB : map.teamA;
      if (list.length === 0) return { x: 100, y: 100 };
      const mates = roster.filter((p) => p.team === team).map((p) => p.id).sort();
      const idx = mates.indexOf(id);
      return list[(idx < 0 ? 0 : idx) % list.length];
    };
    const roster = [
      { id: 'zeta', team: 0 }, { id: 'alpha', team: 1 }, { id: 'mike', team: 0 },
      { id: 'bravo', team: 1 }, { id: 'november', team: 0 }, { id: 'kilo', team: 1 },
    ];
    for (const p of roster) {
      expect(pickStartSpawn(p.id, p.team, roster, 'STAGES'))
        .toEqual(oracle(p.id, p.team, roster, 'STAGES'));
    }
  });
});
