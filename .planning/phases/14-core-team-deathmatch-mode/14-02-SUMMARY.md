---
phase: 14-core-team-deathmatch-mode
plan: 02
subsystem: server-match + config-tuning
tags: [team-deathmatch, spawnpoints, respawn-invuln, countdown, debug-panel, runtime-config, server-authority]

# Dependency graph
requires:
  - phase: 14-01
    provides: "'team-deathmatch' MatchMode + setMatchMode(lobby.mode) wiring at lobby:start; GameRoom #playerInfo/#hp/#lastPos/getTeam; result.eliminated scoring branch + scheduleRespawn callback; TDM_WIN_TARGET server constant"
provides:
  - "src/common/config/tdm.ts: SPAWNPOINTS (WORLD/DUNGEON_1/STAGES, 2+ per team) + TDM_WIN_TARGET (client mirror) + RESPAWN_INVULN_MAX_MS"
  - "config barrel re-exports tdm; RUNTIME_CONFIG mirrors SPAWNPOINTS/TDM_WIN_TARGET/RESPAWN_INVULN_MAX_MS"
  - "gameplay debug panel: TDM section (Win target, Invuln ms sliders) + first-ever COPY VALUES button emitting a paste-ready SPAWNPOINTS literal"
  - "game-server RESPAWN_INVULN_MAX_MS = 2500 (server-authoritative)"
  - "GameRoom server-side SPAWNPOINTS copy + pickSpawn(playerId, mapId) farthest-from-enemy + #invulnUntil + startInvuln/clearInvuln + validateHit invuln rejection (D-14)"
  - "server.ts: match-start spawn loop uses two-pass register+pickSpawn (replaces 100+idx*64) with opening invuln; scheduleRespawn callback uses fresh pickSpawn + startInvuln"
  - "server countdown ticks 5,4,3,2,1 (no FIGHT); COUNTDOWN_DURATION_MS pinned to 5000 (5500ms total span)"
affects: [14-03 (client cinematic renders 5..1 across the 5500ms window), 14-04 (client invuln blink sized from RESPAWN_INVULN_MAX_MS)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server-authoritative spawn assignment: client never asserts a spawn; pickSpawn reads team + living-enemy positions server-side (T-14-06)"
    - "Server-authoritative respawn invuln: #invulnUntil map is sole authority; validateHit rejects hits while protected (T-14-07); client cancel is cosmetic (T-14-09 accept)"
    - "Nested-object tunable through the *_TUNING/COPY-VALUES loop (SPAWNPOINTS) — gameplay panel gained its first COPY VALUES button, serializing a nested structure (not just flat scalars)"
    - "Server config literal duplicated (not imported) from client config/tdm.ts with a keep-in-sync comment — server has no access to the client barrel"

key-files:
  created:
    - src/common/config/tdm.ts
    - .planning/phases/14-core-team-deathmatch-mode/14-02-SUMMARY.md
  modified:
    - src/common/config/index.ts
    - src/common/runtime-config.ts
    - src/debug/debug-panel.ts
    - game-server/src/types.ts
    - game-server/src/game-room.ts
    - game-server/src/server.ts

key-decisions:
  - "Match-start spawn uses a two-pass register-then-pickSpawn loop so #playerInfo is fully populated before any living-enemy lookup (single pass would mis-score the first players)"
  - "Opening invuln granted to every player at match start (not just on respawn) for consistency with respawn protection (D-12 cap applies)"
  - "COUNTDOWN_DURATION_MS pinned to 5000 in types.ts (the PINNED decision) rather than hardcoding 5000 in server.ts — the transition still computes COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS"
  - "getSpawnPoint left in place on GameRoom (now unreferenced by server.ts) — harmless public accessor, removing it was out of scope"

patterns-established:
  - "pickSpawn farthest-from-enemy: min-over-enemies squared distance per candidate, pick max; never throws (WORLD fallback, teamA default, {100,100} empty-list guard)"
  - "RuntimeConfigValue alias in debug-panel.ts covers the nested SPAWNPOINTS object so index-write casts stay sound without unknown-laundering"

requirements-completed: [TDM-03, TDM-04, TDM-05]

# Metrics
duration: ~7min
completed: 2026-05-29
---

# Phase 14 Plan 02: Server Spawnpoints + Respawn Invuln + 5..1 Countdown Summary

**Per-map team SPAWNPOINTS config (debug-tunable with a COPY VALUES path) + server-side farthest-from-enemy spawn assignment on match start and every respawn + server-authoritative respawn invulnerability that rejects spell:hit on protected targets + a 5→4→3→2→1 server countdown over a 5500ms span.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-29T17:44:56Z
- **Completed:** 2026-05-29T17:51:50Z
- **Tasks:** 3
- **Files modified:** 6 (1 created)

## Accomplishments
- Authored `SPAWNPOINTS` (WORLD / DUNGEON_1 / STAGES, ≥2 per team) as a client config mirrored into the server, with the gameplay debug panel's first-ever COPY VALUES button emitting a paste-ready nested `SPAWNPOINTS` literal.
- Implemented `GameRoom.pickSpawn(playerId, mapId)` — picks the team spawnpoint farthest from any living enemy, never throwing on unknown map / undefined team / overflow (D-10, D-11).
- Added server-authoritative respawn invuln: `#invulnUntil` map + `startInvuln`/`clearInvuln`, and a `validateHit` rejection that drops `spell:hit` claims on protected targets (D-14).
- Wired `pickSpawn` into both the match-start registration loop (replacing the naive `100 + idx*64`) and the respawn callback, each with an invuln window.
- Changed the server countdown to `5,4,3,2,1` and pinned `COUNTDOWN_DURATION_MS = 5000` (5500ms total span with `FIGHT_HOLD_MS = 500`) for the new intro cinematic.

## Task Commits

Each task was committed atomically:

1. **Task 1: SPAWNPOINTS + invuln/win-target config + RUNTIME_CONFIG mirror + debug COPY VALUES** - `1ef6d6e` (feat)
2. **Task 2: pickSpawn + #invulnUntil + validateHit rejection in GameRoom** - `0f69244` (feat)
3. **Task 3: wire pickSpawn into registerPlayer + scheduleRespawn; 5..1 countdown + COUNTDOWN_DURATION_MS=5000** - `78e5505` (feat)

**Plan metadata:** (final docs commit below)

## Files Created/Modified
- `src/common/config/tdm.ts` (created) - SPAWNPOINTS keyed by mapId + TDM_WIN_TARGET + RESPAWN_INVULN_MAX_MS, plus SpawnPoint/MapSpawns types.
- `src/common/config/index.ts` - barrel re-export `export * from './tdm'`.
- `src/common/runtime-config.ts` - imports + RUNTIME_CONFIG "Phase 14 — TDM tunables" group (SPAWNPOINTS stored as nested object).
- `src/debug/debug-panel.ts` - TDM SECTIONS entry (2 scalar sliders) + COPY VALUES button serializing RUNTIME_CONFIG.SPAWNPOINTS; RuntimeConfigValue alias to keep index-write casts sound.
- `game-server/src/types.ts` - RESPAWN_INVULN_MAX_MS = 2500; COUNTDOWN_DURATION_MS 3000→5000; MatchCountdownTickPayload + duration doc comments updated to the 5-tick / 5500ms span.
- `game-server/src/game-room.ts` - server SPAWNPOINTS copy + types; #invulnUntil; pickSpawn; startInvuln/clearInvuln; validateHit invuln rejection; clearCombatState clears invuln.
- `game-server/src/server.ts` - TICKS 5..1; two-pass match-start spawn via pickSpawn + opening invuln; respawn callback uses fresh pickSpawn + startInvuln; stale 3500ms comment fixed.

## Decisions Made
- **Two-pass match-start spawn loop:** register all players first (populating `#playerInfo`), then resolve each spawn via `pickSpawn` and re-register at that position. A single pass would run living-enemy lookups against an incomplete roster.
- **Opening invuln at match start** in addition to respawn, for consistent fair re-entry (D-12 cap applies to both).
- **COUNTDOWN_DURATION_MS pinned in types.ts** (the plan's PINNED decision) rather than a hardcoded `5000` in server.ts; the transition delay still derives from `COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS`.
- **Kept `GameRoom.getSpawnPoint`** even though server.ts no longer calls it — removing a public accessor was out of scope and harmless.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Widened debug-panel index-write casts for the nested SPAWNPOINTS value**
- **Found during:** Task 1 (RUNTIME_CONFIG mirror + debug panel)
- **Issue:** Adding `SPAWNPOINTS` (a `Record<string, MapSpawns>` object) into `RUNTIME_CONFIG` widened its value union, so the three existing `as Record<string, number | boolean | string>` casts in `debug-panel.ts` (`#defaultValues`, the slider `input` write, `#resetAll`) no longer overlapped and failed `tsc` (TS2322 / TS2352). This blocked the Task 1 typecheck.
- **Fix:** Added a `RuntimeConfigValue = (typeof RUNTIME_CONFIG)[keyof typeof RUNTIME_CONFIG]` alias and retargeted `#defaultValues` plus the two index-write casts to it. Sliders still only ever write numbers; the alias just makes the index writes sound for the nested object.
- **Files modified:** src/debug/debug-panel.ts
- **Verification:** `npx tsc 2>&1 | grep -E "^(src/|game-server/)"` returns zero matches.
- **Committed in:** 1ef6d6e (Task 1 commit)

**2. [Rule 1 - Bug] Fixed stale countdown-span comment in server.ts**
- **Found during:** Task 3 (countdown change)
- **Issue:** The final-transition comment said "at t+3500 ms (3000 ms of ticks + 500 ms FIGHT hold)" — wrong after the bump to 5 ticks / 5000ms.
- **Fix:** Updated to "t+5500 ms (5000 ms of ticks + 500 ms trailing hold)".
- **Files modified:** game-server/src/server.ts
- **Committed in:** 78e5505 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking type error, 1 doc/comment bug)
**Impact on plan:** Both necessary for a clean typecheck / accurate docs. No scope creep — no new files or behavior beyond the plan.

## Issues Encountered
- None beyond the auto-fixed type widening above.

### GSD-helper steps skipped (environment)
- Per the environment note, `gsd-sdk query` is unavailable. All three task commits used plain `git` (with hooks, no `--no-verify`); STATE.md and ROADMAP.md were updated directly with the Edit tool. No state/roadmap/requirements query helpers were invoked.
- Per the executor typecheck note, the `pnpm build` half of each task's `<verify>` was satisfied via the documented project-source filter `npx tsc 2>&1 | grep -E "^(src/|game-server/)"` (zero matches = clean); `pnpm build`'s own exit is dominated by pre-existing environmental node_modules type noise, which is out of scope.

## Verification
- `cd game-server && npx tsc --noEmit` — clean (exit 0) after Task 1, Task 2, and Task 3.
- `cd game-server && npm test` — 79 tests pass (4 files) after Task 2 and Task 3.
- Frontend project-source typecheck: `npx tsc 2>&1 | grep -E "^(src/|game-server/)"` — zero matches after Task 1 and Task 3.
- Contains-markers verified on disk: `SPAWNPOINTS` ×3 in tdm.ts, `COUNTDOWN_DURATION_MS = 5000` in types.ts, `pickSpawn` in game-room.ts (×1 def) and server.ts (×4 uses incl. startInvuln), `COPY VALUES` ×4 in debug-panel.ts, `label: '5'` in server.ts, `invulnUntil` ×6 in game-room.ts.
- Naive `100 + idx*64` offset removed from server.ts; no `'FIGHT'` label remains in the TICKS array (only the unchanged `FIGHT_HOLD_MS` constant name + doc text).

## Deferred Issues (out of scope)
- Pre-existing unrelated frontend test failures (thunder-strike.test.ts, spell-registry.test.ts, stale dist/ copies) and environmental `pnpm build` node_modules noise — already logged in `.planning/phases/14-core-team-deathmatch-mode/deferred-items.md`. Not touched.

## Notes for Downstream Plans

**Plan 03 (client cinematic):** the server now emits countdown ticks `5,4,3,2,1` (labels) over a **5500ms** span (`COUNTDOWN_DURATION_MS` pinned to 5000 + `FIGHT_HOLD_MS` 500). The client `#onCountdownTick` already renders `payload.label`, so the cinematic must lay the camera/banner/HUD-reveal across those 5 ticks; the COUNTDOWN→ACTIVE unlock fires after the full ~5500ms window. The client zoom literal (`game-scene.ts:3635`) is `3000` and is NOT the server constant — Plan 03 owns re-pacing the cinematic to the new 5s window.

**Plan 04 (client HUD + invuln blink):** `RESPAWN_INVULN_MAX_MS` (2500) is in `RUNTIME_CONFIG` for sizing the client blink. The `respawn` payload carries no explicit invuln duration; the client must cancel its blink on first move/cast and at the cap. The server `#invulnUntil` is the sole damage authority — the client cancel is cosmetic and must NOT try to extend or report invuln state to the server.

## Next Phase Readiness
- Wave 2 server half complete: spawnpoints, invuln rejection, and the 5..1 countdown are live (the matchMode-gated branches from 14-01 are exercised by this plan).
- Plan 03 (client cinematic) and Plan 04 (client HUD/invuln/results) can proceed; both are client-only and do not touch the files this plan modified except game-scene.ts (owned by 03/04).

## Self-Check: PASSED

- All created/modified files present (verified on disk).
- All 3 task commits present in git log: 1ef6d6e, 0f69244, 78e5505.
- Contains-markers verified (see Verification).

---
*Phase: 14-core-team-deathmatch-mode*
*Completed: 2026-05-29*
