---
phase: 09-lobby-format-map-configuration
plan: 01
subsystem: game-server/lobby
tags: [server, lobby, config, socket-io, types]
requirements_completed: [LBC-01, LBC-02, LBC-03, LBC-05, LBC-06, LBC-07]
dependency_graph:
  requires:
    - "Phase 7: MatchConfig flow LOBBY->LOADING in place"
  provides:
    - "Server LobbyConfig single-source-of-truth on Lobby"
    - "MAP_POOL constant (server-side)"
    - "lobby:set-config socket protocol"
    - "MatchConfig.config snapshot at lobby:started"
  affects:
    - "src/networking/types.ts (Plan 03 will mirror)"
    - "src/scenes/lobby-scene.ts (Plan 03 will bind controls)"
    - "src/scenes/loading-scene.ts (Plan 03 will consume mapId from MatchConfig.config)"
tech_stack:
  added: []
  patterns:
    - "Host-gated discriminated-union mutator returning { ok: true, lobby } | { ok: false, reason }"
    - "Partial<LobbyConfig> wire payload + single lobby:updated rebroadcast (LBC-06)"
key_files:
  created: []
  modified:
    - "game-server/src/types.ts"
    - "game-server/src/lobby-manager.ts"
    - "game-server/src/server.ts"
decisions:
  - "Discriminated union return shape for setConfig (preferred over Lobby | null so reject copy travels verbatim to lobby:error)"
  - "maxPlayers always server-derived (parseInt(format) * 2) — never trusted from client (LBC-02)"
  - "MatchConfig.config snapshot uses shallow spread { ...lobby.config } so later edits cannot mutate an in-flight match"
metrics:
  tasks_completed: 3
  files_modified: 3
  completed_date: "2026-05-21"
---

# Phase 09 Plan 01: Server Lobby Config Foundation Summary

Server-side single source of truth for lobby configuration: `LobbyConfig` + `MAP_POOL` types, default-on-create, host-gated `setConfig` mutator with capacity-downshift rejection, `lobby:set-config` socket handler, and `MatchConfig` extended to snapshot the full config at `LOBBY → LOADING`.

## What Was Built

### Final shape of LobbyConfig (game-server/src/types.ts)

```ts
export type LobbyFormat = '1v1' | '2v2' | '3v3' | '4v4' | '5v5' | '6v6' | '7v7' | '8v8' | '9v9' | '10v10';

// Single extensible lobby config object. Future fields (timeLimit?, friendlyFire?,
// spellModifiers?) are added as optional top-level keys — no nesting, no version envelope,
// no new socket events (LBC-07).
export type LobbyConfig = {
  format: LobbyFormat;
  mapId: string;          // value from MAP_POOL[i].id
  maxPlayers: number;     // derived: parseInt(format) * 2
};

export type MapPoolEntry = {
  id: string;
  displayName: string;
  thumbnailKey: string;   // SCREAMING_SNAKE — matches ASSET_KEYS convention
};

export const MAP_POOL: readonly MapPoolEntry[] = [
  { id: 'WORLD', displayName: 'Open Field', thumbnailKey: 'MAP_THUMB_WORLD' },
  { id: 'DUNGEON_1', displayName: 'Dungeon', thumbnailKey: 'MAP_THUMB_DUNGEON_1' },
] as const;
```

### Extended Lobby and MatchConfig

```ts
export type Lobby = {
  id: string;
  hostPlayerId: string;
  players: PlayerInfo[];
  mode: string | null;
  status: 'waiting' | 'in-progress';
  config: LobbyConfig;          // NEW (Phase 9)
};

export type MatchConfig = {
  lobbyId: string;
  players: PlayerInfo[];
  mode: string;
  config: LobbyConfig;          // NEW (Phase 9) — snapshot at LOBBY->LOADING
};
```

### LobbyManager.setConfig signature & reject reasons (game-server/src/lobby-manager.ts)

```ts
setConfig(
  socketId: string,
  partial: Partial<LobbyConfig>
): { ok: true; lobby: Lobby } | { ok: false; reason: string }
```

Reject reasons (verbatim copy returned via `lobby:error`):

| Trigger | `reason` value |
|---|---|
| No lobby for socket | `No lobby` |
| Lobby not in `waiting` | `Match already in progress` |
| Non-host caller | `Only the host can change lobby settings` |
| Invalid `format` | `Invalid format` |
| Invalid `mapId` (not in MAP_POOL) | `Invalid map` |
| Capacity downshift (players > new max) | `Reduce players first (N > M cap)` |

On success: `lobby.config` mutated in place with `{ format: nextFormat, mapId: nextMapId, maxPlayers: parseInt(format) * 2 }`. `maxPlayers` is **always** re-derived server-side, never trusted from the client.

Default config on `createLobby`: `{ format: '3v3', mapId: 'WORLD', maxPlayers: 6 }` (D-04).

### lobby:set-config handler (game-server/src/server.ts)

The two new emit lines that satisfy the single-broadcast invariant (LBC-06) plus the browser-row refresh (D-16):

```ts
socket.on('lobby:set-config', ({ config }: { config: Partial<LobbyConfig> }) => {
  const result = lobbyManager.setConfig(socket.id, config);
  if (!result.ok) {
    socket.emit('lobby:error', { message: result.reason });
    return;
  }
  io.to(`lobby:${result.lobby.id}`).emit('lobby:updated', { lobby: result.lobby });
  io.emit('lobby:list-updated', { lobbies: lobbyManager.listLobbies() });
});
```

### MatchConfig snapshot at lobby:start

```ts
const matchConfig = {
  lobbyId: lobby.id,
  players: lobby.players,
  mode: lobby.mode ?? 'team-deathmatch',
  config: { ...lobby.config },   // shallow spread — protect in-flight match from later lobby edits
};
io.to(`lobby:${lobby.id}`).emit('lobby:started', { matchConfig });
```

## LBC-07 Extensibility (verified by inspection)

Adding `timeLimit?: number` (or `friendlyFire?: boolean`, or `spellModifiers?: {...}`) to `LobbyConfig` requires **zero** changes to:

- `lobby:set-config` handler (typed as `Partial<LobbyConfig>` — new optional keys ride along for free)
- `lobby:updated` emit (sends full `Lobby` — new field surfaces automatically)
- `lobby:list-updated` emit (sends full lobbies — new field surfaces automatically)
- `lobby:started` MatchConfig snapshot (spreads `lobby.config` — new field copied for free)

The only additions required for a future field are: (1) the key in `LobbyConfig`, (2) merge logic in `setConfig` if the field has validation needs. No new wire events, no protocol renames.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add LobbyConfig + MAP_POOL types, extend Lobby & MatchConfig | `98504a8` | game-server/src/types.ts |
| 2 | Default config on createLobby + setConfig mutator | `d4e3ad0` | game-server/src/lobby-manager.ts |
| 3 | lobby:set-config socket handler + MatchConfig snapshot | `b176e6a` | game-server/src/server.ts |

## Verification

- `cd game-server && npx tsc --noEmit` exits 0.
- Inline smoke test (Task 2 verify block) prints `OK`:
  - default config = `{ format: '3v3', mapId: 'WORLD', maxPlayers: 6 }` ✓
  - `setConfig({ format: '5v5' })` → derives `maxPlayers === 10` ✓
  - `setConfig({ mapId: 'NOPE' })` → `{ ok: false, reason: 'Invalid map' }` ✓
- All grep acceptance criteria for the three tasks pass (LobbyConfig declaration, MAP_POOL, setConfig signature, verbatim reject copy, single-broadcast pattern, `{ ...lobby.config }` spread).

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

Plan tasks were tagged `tdd="true"`, but no separate test framework exists in `game-server/` (no `vitest`/`jest` installed). The plan's `<verify>` blocks specified an inline `node --input-type=module -e ...` smoke test rather than a unit-test suite, which was executed and passed. RED/GREEN/REFACTOR commit gates were not produced because there is no test file to commit independently — the smoke test runs against the already-compiled `dist/` and the plan's acceptance criteria are grep-based rather than test-runner-based. This matches the existing game-server convention (no test directory exists in the repo).

## Self-Check: PASSED

- `game-server/src/types.ts` — FOUND, contains `LobbyConfig`, `MAP_POOL`, extended `Lobby.config`, extended `MatchConfig.config`.
- `game-server/src/lobby-manager.ts` — FOUND, contains `setConfig`, default config in `createLobby`, `#maxPlayersForFormat`, verbatim reject copy.
- `game-server/src/server.ts` — FOUND, contains `socket.on('lobby:set-config', ...)`, `{ ...lobby.config }` snapshot.
- Commits `98504a8`, `d4e3ad0`, `b176e6a` — all present in `git log`.
- `npx tsc --noEmit` exit code 0.
- Smoke test prints `OK`.
