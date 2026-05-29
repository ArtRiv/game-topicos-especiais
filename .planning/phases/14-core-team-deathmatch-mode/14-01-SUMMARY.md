---
phase: 14-core-team-deathmatch-mode
plan: 01
subsystem: server-match + client-protocol
tags: [team-deathmatch, scoring, match-fsm, protocol-mirror, event-bus]
requires: []
provides:
  - "'team-deathmatch' MatchMode in both protocol files"
  - "TdmPlayerStat / TeamScorePayload / MatchEndedPayload protocol types (server + client mirror)"
  - "TDM_WIN_TARGET = 30 (server authority only)"
  - "GameRoom TDM scoring: #teamScores/#kills/#deaths, addTeamKill/recordDeath/getTeam/getTeamScores/getMatchStats/getMvpPlayerId"
  - "lobby:start applies room.setMatchMode(lobby.mode) — makes every TDM branch live at runtime"
  - "server.ts result.eliminated branch: kill/death attribution + live match:team-score + win-check + single match:ended"
  - "EVENT_BUS keys NETWORK_TEAM_SCORE, NETWORK_MATCH_ENDED (socket-bridged) + internal HUD_REVEAL"
  - "network-manager bridges: socket match:team-score -> NETWORK_TEAM_SCORE, match:ended -> NETWORK_MATCH_ENDED"
affects:
  - game-server/src/types.ts
  - src/networking/types.ts
  - game-server/src/game-room.ts
  - game-server/src/server.ts
  - src/common/event-bus.ts
  - src/networking/network-manager.ts
tech-stack:
  added: []
  patterns:
    - "Server types.ts <-> client networking/types.ts mirror (identical shapes)"
    - "Server-authoritative scoring (attribution reads team from #playerInfo, never the client)"
    - "3-step socket -> EVENT_BUS bridge (key in event-bus.ts, on() in network-manager.ts)"
    - "Snapshot ENDED stats BEFORE transitionTo('ENDED') (which clears combat state)"
key-files:
  created:
    - .planning/phases/14-core-team-deathmatch-mode/14-01-SUMMARY.md
    - .planning/phases/14-core-team-deathmatch-mode/deferred-items.md
  modified:
    - game-server/src/types.ts
    - src/networking/types.ts
    - game-server/src/game-room.ts
    - game-server/src/server.ts
    - game-server/src/game-room.test.ts
    - src/common/event-bus.ts
    - src/networking/network-manager.ts
decisions:
  - "MVP tie-break: highest kills, then fewest deaths, then earliest #kills insertion order (Map preserves order)"
  - "TdmPlayerStat.team falls back to -1 for a player with no team (defensive; TDM players always have 0/1)"
  - "ENDED payload (getMvpPlayerId + getMatchStats) is built BEFORE transitionTo('ENDED') because the transition clears combat state"
metrics:
  duration: ~25m
  completed: 2026-05-29
  tasks: 3
  files_changed: 7
---

# Phase 14 Plan 01: Team-Deathmatch Server Foundation + Protocol Mirror Summary

Server-authoritative team-deathmatch scoring: a `'team-deathmatch'` MatchMode, a shared per-team kill score, per-player kill/death tracking, a win condition at 30 kills, and two new server->client broadcasts (live team score + final ENDED-with-stats). The room is now actually set to the lobby's MatchMode at `lobby:start`, making every TDM branch live at runtime. All protocol changes are mirrored in lockstep between server and client types, and the new broadcasts are bridged onto `EVENT_BUS` (this plan owns the phase's event-key registry, including the internal `HUD_REVEAL`).

## What Was Built

### Task 1 — MatchMode + TDM payloads + win-target (commit 4a7f26e)
- Extended `MatchMode` to `'respawn' | 'last-standing' | 'team-deathmatch'` in **both** `game-server/src/types.ts` and `src/networking/types.ts`.
- Added `TdmPlayerStat`, `TeamScorePayload`, `MatchEndedPayload` with identical shapes in both files.
- Added `TDM_WIN_TARGET = 30` to the server file **only** (server is the authority; the client tunable copy lands in Plan 02).

### Task 2 — Room MatchMode wiring + scoring + win-check (commit 9f7bccf)
- **STEP A (runtime-critical):** `lobby:start` now calls `room.setMatchMode((lobby.mode ?? 'team-deathmatch') as MatchMode)` right after the `addPlayer` loop. Imported `MatchMode`. Without this the room stayed `'respawn'` and every TDM branch was dead code.
- **STEP B (GameRoom):** added `#teamScores: [number, number]`, `#kills`, `#deaths`; seed `#kills`/`#deaths` to 0 in `registerPlayer`; added `getTeam`, `addTeamKill` (team-guarded, no-op for unassigned casters per D-05), `recordDeath`, `getTeamScores` (defensive copy), `getMatchStats`, `getMvpPlayerId` (kills desc, then fewest deaths, then insertion order); reset all three in `clearCombatState`.
- **STEP C (server.ts):** in the `result.eliminated` branch, gated on `room.matchMode === 'team-deathmatch'`: record death, attribute the kill to the caster's team only when `!isSameTeam`, broadcast `match:team-score`, and on reaching `TDM_WIN_TARGET` build the `MatchEndedPayload`, transition `ACTIVE -> ENDED`, and emit a single `match:ended`.
- **STEP D (test):** added a `team-deathmatch scoring` describe block to `game-room.test.ts` that explicitly calls `setMatchMode('team-deathmatch')` before asserting score increments, plus FF no-op, no-team no-op, kills/deaths/MVP, and clearCombatState reset cases.

### Task 3 — Event registry + bus bridges (commit 7b8f21d)
- `event-bus.ts`: added `NETWORK_TEAM_SCORE`, `NETWORK_MATCH_ENDED` (socket-bridged), and internal `HUD_REVEAL` (no bridge). This plan owns the registry so Plans 03/04 never edit it.
- `network-manager.ts`: bridged `socket.on('match:team-score')` -> `NETWORK_TEAM_SCORE` and `socket.on('match:ended')` -> `NETWORK_MATCH_ENDED`, alongside the existing elimination/respawn bridges. Imported `TeamScorePayload`, `MatchEndedPayload`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ENDED-stats snapshot ordering**
- **Found during:** Task 2, STEP C.
- **Issue:** The plan's STEP C template called `room.transitionTo('ENDED')` before constructing the `MatchEndedPayload` (which calls `getMvpPlayerId()` + `getMatchStats()`). But `transitionTo('ENDED')` invokes `clearCombatState()`, which clears `#kills`/`#deaths`/`#playerInfo` — so the broadcast would have shipped an empty stats array and a null MVP.
- **Fix:** Build the `MatchEndedPayload` (winningTeam + scores + MVP + stats) BEFORE calling `transitionTo('ENDED')`; emit `match:ended` after the successful transition. Wrapped the transition in try/catch (consistent with existing FSM call sites).
- **Files modified:** game-server/src/server.ts
- **Commit:** 9f7bccf

### GSD-helper steps skipped (environment)
- Per the environment note, `gsd-sdk query` is unavailable. All commits used plain `git` (with hooks, no `--no-verify`); STATE.md and ROADMAP.md were updated directly with the Edit tool. No state helpers were invoked.

## Verification

- `cd game-server && npx tsc --noEmit` — clean (exit 0) after Task 1 and Task 2.
- `cd game-server && npm test` — 79 tests pass (4 files), including the new TDM scoring tests.
- Frontend project-source typecheck: `npx tsc 2>&1 | grep -E "^(src/|game-server/)"` — zero matches (clean). `pnpm build` itself fails only on pre-existing environmental node_modules type errors (TextDecoder/SharedArrayBuffer, vitest/vite/rollup moduleResolution) per the executor's typecheck note — not project source.
- Protocol mirror confirmed: both `types.ts` files contain `'team-deathmatch'` + the three new payload types; only the server file contains `TDM_WIN_TARGET`.

## Deferred Issues (out of scope)

Logged in `.planning/phases/14-core-team-deathmatch-mode/deferred-items.md`:
- Pre-existing frontend test failures in `src/game-objects/spells/thunder-strike.test.ts` and `spell-registry.test.ts` (plus stale `dist/**/*.test.js` copies being collected). Unrelated to this plan's files (event-bus, network-manager).
- Environmental `pnpm build` / node_modules typecheck noise (not project source).

## Notes for Downstream Plans

**Plan 02:** `lobby:start` now calls `room.setMatchMode(lobby.mode)` (game-room still defaults to `'respawn'`). GameRoom now has `#teamScores`/`#kills`/`#deaths`/`getTeam`; `clearCombatState` resets them; the win-check is gated on `matchMode === 'team-deathmatch'`. Plan 02's spawn/invuln branches gated on the same `matchMode` getter are now live at runtime.

**Plans 03/04:** the client consumes `CUSTOM_EVENTS.NETWORK_TEAM_SCORE` (`TeamScorePayload`), `CUSTOM_EVENTS.NETWORK_MATCH_ENDED` (`MatchEndedPayload`), and the internal `CUSTOM_EVENTS.HUD_REVEAL` key — all already registered in `event-bus.ts`. Do NOT re-add them. `TeamScorePayload.lastScoringTeam` drives the score-plate pop tween; `MatchEndedPayload` carries `winningTeam`, `teamScores`, `mvpPlayerId`, and `stats` (per-player kills/deaths) for the results scene.

## Self-Check: PASSED

- All 6 modified source files present (FOUND).
- All 3 task commits present in git log: 4a7f26e, 9f7bccf, 7b8f21d (FOUND).
- Contains-markers verified: `team-deathmatch` in both types files, `addTeamKill` in game-room.ts, `setMatchMode` in server.ts, `NETWORK_MATCH_ENDED` in event-bus.ts.
