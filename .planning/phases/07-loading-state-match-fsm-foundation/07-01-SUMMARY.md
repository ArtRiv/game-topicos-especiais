---
phase: 07-loading-state-match-fsm-foundation
plan: 01
subsystem: networking
tags: [socket.io, fsm, state-machine, match-lifecycle, sync-barrier, typescript, vitest]

# Dependency graph
requires:
  - phase: 06-foundation-cleanup
    provides: Stable WebRTC mesh + reliable lobby:start flow that this plan extends with a state machine
provides:
  - Server-side MatchState FSM (LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED) with transition guards
  - match:state-changed broadcast emitted on every transition with server timestamp (LFC-02)
  - lobby:start → LOBBY→LOADING transition emitted BEFORE lobby:started (LFC-03)
  - match:loaded socket handler tracking per-socket acks (LFC-05 sync barrier)
  - Phase 7 STUB auto-advance COUNTDOWN→ACTIVE (50ms) so existing GameScene flow keeps working until Phase 8
  - GameRoom public surface: state getter, transitionTo(), markLoaded(), loadedCount, getAllSocketIds()
affects: [07-02-loading-scene-client, 08-countdown-intro, 09-results-screen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server-authoritative match state with strict VALID_NEXT guard table
    - Sync-barrier pattern: caller tracks transition delta to ensure side-effect fires exactly once
    - "Phase N STUB" comment convention so future phases can grep & remove temporary code

key-files:
  created: []
  modified:
    - game-server/src/types.ts
    - game-server/src/game-room.ts
    - game-server/src/server.ts
    - game-server/src/game-room.test.ts

key-decisions:
  - "GameRoom owns match state (not LobbyManager) because state-changes are tied to in-match sockets, not lobby membership"
  - "match:state-changed is ADDITIVE — lobby:started kept as navigation trigger so Plan 07-02 doesn't need to change its scene-switch logic"
  - "50ms stub for COUNTDOWN→ACTIVE chosen deliberately short so existing flow is preserved end-to-end; Phase 8 will replace with real 3-2-1 countdown timing"
  - "markLoaded() returns true exactly on the call that completes the set (not on every call once full), so server.ts can call transitionTo('COUNTDOWN') exactly once without try/catch ceremony per ack"

patterns-established:
  - "FSM transition broadcast: caller responsibility — GameRoom.transitionTo() updates state, server.ts broadcasts via dedicated broadcastMatchState() helper"
  - "Sync-barrier returns boolean transition signal so the caller commits the next state exactly once"

requirements-completed: [LFC-01, LFC-02, LFC-03, LFC-05]

# Metrics
duration: ~10min
completed: 2026-05-15
---

# Phase 07 Plan 01: Match FSM + Sync Barrier (Server) Summary

**Server-side match state machine (LOBBY→LOADING→COUNTDOWN→ACTIVE→ENDED) with per-socket match:loaded sync barrier and match:state-changed broadcast wired into lobby:start.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-15T22:38:00Z (approx)
- **Completed:** 2026-05-15T22:48:23Z
- **Tasks:** 3 / 3
- **Files modified:** 4

## Accomplishments

- GameRoom now owns the match-state FSM with guarded transitions (throws on invalid edges) — LFC-01
- match:state-changed broadcast wired into lobby:start; emitted BEFORE lobby:started so client handlers can rely on receive order — LFC-02, LFC-03
- match:loaded socket handler accumulates per-socket acks and transitions LOADING→COUNTDOWN exactly when the full set is in — LFC-05
- Phase-7 stub auto-advances COUNTDOWN→ACTIVE after 50ms so existing GameScene flow continues to work end-to-end until Phase 8 replaces it
- 6 new vitest unit tests covering FSM transitions, invalid-edge throws, sync-barrier exact-once semantics, non-member ack rejection, and ack cleanup on removePlayer (13 tests pass total)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add MatchState types and GameRoom state machine** — `efdb9bf` (feat)
2. **Task 2: Wire match:state-changed broadcast and match:loaded sync barrier in server.ts** — `a95e0d4` (feat)
3. **Task 3: Add server-side FSM unit tests + bug fix to markLoaded contract** — `ce1b449` (test + Rule 1 fix)

## Files Created/Modified

- `game-server/src/types.ts` — added `MatchState`, `MatchStateChangedPayload`, `MatchLoadedPayload` exports
- `game-server/src/game-room.ts` — rewrote with FSM (`#state`, `transitionTo`, `markLoaded`, `loadedCount`, `getAllSocketIds`); preserved existing public surface (`addPlayer`, `removePlayer`, `getPlayerIdBySocketId`, `getOtherSocketIds`, `playerCount`, `transitionLock`)
- `game-server/src/server.ts` — added `broadcastMatchState()` helper; extended `lobby:start` to transition LOBBY→LOADING + broadcast BEFORE `lobby:started`; new `match:loaded` socket handler with COUNTDOWN→ACTIVE 50ms Phase-7 stub; comment in disconnect handler documenting ack-cleanup via `GameRoom.removePlayer`
- `game-server/src/game-room.test.ts` — appended 6 FSM tests under "GameRoom — match state machine (LFC-01, LFC-05)" describe block; existing 7 tests untouched

## Decisions Made

- Kept `lobby:started` event emit alongside the new `match:state-changed` to preserve Plan 07-02's existing navigation trigger (additive, not replacement)
- Chose 50ms over 0ms for COUNTDOWN→ACTIVE stub so the COUNTDOWN broadcast is observable in tests/devtools before the ACTIVE one
- Moved `#loadedSocketIds.clear()` into `transitionTo()` (firing on any transition AWAY from LOADING) rather than gating it on COUNTDOWN specifically — robust against future ENDED-from-LOADING paths (e.g., host disconnect during LOADING)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `markLoaded` contract violation**

- **Found during:** Task 3 (running new test suite)
- **Issue:** Plan-supplied `markLoaded` implementation returned `true` on every call once `loadedSocketIds.size === players.size`. The doc comment promised "Returns true exactly once per LOADING cycle". The test `markLoaded returns false until every player has acked, then true exactly once` explicitly asserted that a duplicate ack after the set was full returns `false`. As-written the implementation would have caused `server.ts` to call `room.transitionTo('COUNTDOWN')` a second time on the duplicate ack and throw `Invalid match transition: COUNTDOWN → COUNTDOWN` (the server's try/catch would swallow it, but the broadcast helper would fire again with the same state — wrong-but-harmless on first glance and a latent bug if the catch were ever removed).
- **Fix:** Track the Set size before and after `add()`; return `true` only when the call *grew* the set to full. Duplicate-ack and ack-after-full both return `false`.
- **Files modified:** `game-server/src/game-room.ts` (lines 64-79)
- **Verification:** All 13 vitest tests pass; tsc --noEmit exits 0
- **Committed in:** `ce1b449` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix matching documented contract)
**Impact on plan:** No scope creep — the fix aligned the implementation with the plan's own doc-comment contract and made the supplied test pass. No interface change.

## Issues Encountered

- `npm install` had to run in the worktree because `node_modules/` is not propagated when the worktree is created; this is expected and not a deviation. After install, `tsc --noEmit` and `vitest run` both pass cleanly.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 07-02 (client LoadingScene):** ready. Server emits `match:state-changed` and accepts `match:loaded` ack. Client mirror types should be added to `src/networking/types.ts` (note: do NOT edit it in this plan — explicitly out of scope per Task 1 read_first guidance).
- **Phase 8 (countdown UX):** ready. The single `Phase 7 STUB` marker in `server.ts` is the exact spot to remove and replace with real countdown timing. `match:state-changed` already carries `serverTs` for COUNTDOWN sync.

## Verification

- `cd game-server && npx tsc --noEmit` → exits 0
- `cd game-server && npx vitest run src/game-room.test.ts` → 13 tests pass (7 original + 6 new)
- `grep -c "Phase 7 STUB" game-server/src/server.ts` → 1
- `grep -c "match:state-changed" game-server/src/server.ts` → 2 (helper + handler)
- `grep -c "match:loaded" game-server/src/server.ts` → 2 (`match:loaded` socket handler + comment)

## Self-Check

- `game-server/src/types.ts` — FOUND, contains `export type MatchState`
- `game-server/src/game-room.ts` — FOUND, contains `transitionTo` and `markLoaded`
- `game-server/src/server.ts` — FOUND, contains `match:state-changed` and `match:loaded`
- `game-server/src/game-room.test.ts` — FOUND, contains "GameRoom — match state machine"
- Commit `efdb9bf` — FOUND in git log
- Commit `a95e0d4` — FOUND in git log
- Commit `ce1b449` — FOUND in git log

## Self-Check: PASSED

---
*Phase: 07-loading-state-match-fsm-foundation*
*Plan: 01*
*Completed: 2026-05-15*
