---
phase: 08-countdown-state
plan: 01
subsystem: networking
tags: [socket.io, fsm, countdown, server-authoritative, timer-cleanup]

# Dependency graph
requires:
  - phase: 07-loading-state-match-fsm-foundation
    provides: GameRoom FSM (LOBBY→LOADING→COUNTDOWN→ACTIVE→ENDED), markLoaded sync barrier, LobbyManager, match:state-changed broadcast, lobby:start handler, Phase 7 STUB auto-advance (now removed)
provides:
  - Server-driven 4-tick countdown broadcast (3 → 2 → 1 → FIGHT) at 1000 ms cadence
  - Single LOADING→ACTIVE transition broadcast at t+3500 ms after COUNTDOWN entry
  - MatchCountdownTickPayload protocol type (lobbyId, remaining, label, serverTs)
  - COUNTDOWN_DURATION_MS / FIGHT_HOLD_MS named constants
  - GameRoom.pushCountdownHandle / clearCountdownTimers — room-owned timer lifecycle
  - Idempotent lobby:start (CR-02 fix): status-guard in LobbyManager + gameRooms.has defense in server.ts
  - Identity-bound tick callbacks (T-08-02 mitigation): gameRooms.get === room AND state === COUNTDOWN
  - Automatic timer cleanup on COUNTDOWN→* transitions and on empty-room removePlayer (WR-07 fix)
affects: [08-02-client-countdown, 09-results-screen, 10-host-kick, 11-reconnect]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies — uses existing socket.io + vitest
  patterns:
    - "Room-owned timer handles: scheduled setTimeout handles are pushed onto GameRoom so the room itself owns cancellation (no free-floating timers)"
    - "Identity-bound async callbacks: every scheduled callback verifies gameRooms.get(lobbyId) === capturedRoom before emitting, defending against use-after-free when a room is replaced mid-countdown"
    - "Defense-in-depth idempotency: state-status guard in domain manager + Map.has guard at the protocol boundary"
    - "Named protocol constants in types.ts (COUNTDOWN_DURATION_MS, FIGHT_HOLD_MS) so client and server import the same source of truth"

key-files:
  created: []
  modified:
    - game-server/src/types.ts
    - game-server/src/lobby-manager.ts
    - game-server/src/game-room.ts
    - game-server/src/server.ts
    - game-server/src/lobby-manager.test.ts
    - game-server/src/game-room.test.ts

key-decisions:
  - "Constants COUNTDOWN_DURATION_MS=3000 and FIGHT_HOLD_MS=500 live in types.ts (not server.ts) so future client code in Plan 08-02 can import the same protocol values without a config-file detour"
  - "startCountdown accepts both lobbyId AND room — avoids a redundant gameRooms.get and makes the identity-check intent (gameRooms.get(lobbyId) === room) explicit at the call site"
  - "Test files cast setTimeout returns via `as unknown as ReturnType<typeof setTimeout>` because vitest's globals pull DOM lib typing into test scope (DOM's setTimeout returns number; Node's returns NodeJS.Timeout). Production code is unaffected — game-room.ts compiles cleanly with the Node typing"

patterns-established:
  - "Room-owned timer lifecycle: any setTimeout related to a GameRoom MUST be pushed via pushCountdownHandle so the room cancels it on state transition or empty-room cleanup"
  - "Server-emit-only events: match:countdown-tick has no socket.on handler — server is the sole source"
  - "Capture-by-reference + identity check: async callbacks close over the captured `room` and verify identity, never re-look-up by id alone"

requirements-completed:
  - LFC-08
  - LFC-09

# Metrics
duration: 6min
completed: 2026-05-15
---

# Phase 08 Plan 01: Countdown State (Server) Summary

**Server-driven 4-tick countdown broadcast (3 → 2 → 1 → FIGHT) at 1000 ms cadence + single LOADING→ACTIVE transition at t+3500 ms, with room-owned timer cleanup and idempotent lobby:start (CR-02 + WR-07 fixes folded in).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-15T22:00:00Z (approx — first commit at 22:00:19 local / 01:00:19 UTC)
- **Completed:** 2026-05-16T01:06:00Z
- **Tasks:** 3
- **Files modified:** 6 (3 production + 3 test files; zero files created)

## Accomplishments

- Phase 7 STUB (`setTimeout(50ms)` auto-advance from COUNTDOWN→ACTIVE) is gone — zero grep hits anywhere under `game-server/src/`.
- New `startCountdown(lobbyId, room)` helper in `server.ts` schedules exactly 4 `match:countdown-tick` broadcasts at t+0/1000/2000/3000 ms followed by one `LOADING→ACTIVE` transition + `match:state-changed` broadcast at t+3500 ms. Every callback is identity-checked (`gameRooms.get(lobbyId) === room && room.state === 'COUNTDOWN'`).
- `GameRoom` now owns its countdown timer handles: new `#countdownHandles` field + `pushCountdownHandle()` / `clearCountdownTimers()` methods. `transitionTo` clears them on any COUNTDOWN→* edge; `removePlayer` clears them when the room becomes empty. WR-07 (Phase 7 free-floating timers) is closed.
- `lobby:start` is now idempotent: `LobbyManager.startLobby` returns `null` when `lobby.status !== 'waiting'`, and `server.ts` has a defense-in-depth `if (gameRooms.has(lobby.id)) return;` guard before allocating a new `GameRoom`. CR-02 is closed.
- Test suite grew from 31 → 37 (+6): 2 new lobby-manager idempotency cases + 4 new game-room countdown-handle cases. All 37 pass; `tsc --noEmit` exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make lobby:start idempotent (CR-02)** — `00aa13a` (fix)
2. **Task 2: Add countdown-tick payload type + countdown timer storage on GameRoom (WR-07)** — `c609efa` (feat)
3. **Task 3: Replace Phase 7 STUB with real countdown timer (LFC-08, LFC-09)** — `2dafc05` (feat)

## Files Created/Modified

- `game-server/src/types.ts` — Added `MatchCountdownTickPayload` (lobbyId, remaining, label, serverTs) plus exported runtime constants `COUNTDOWN_DURATION_MS = 3000` and `FIGHT_HOLD_MS = 500`.
- `game-server/src/lobby-manager.ts` — `startLobby` now early-returns `null` when `lobby.status !== 'waiting'` (CR-02 guard).
- `game-server/src/game-room.ts` — New `#countdownHandles` field, `pushCountdownHandle()` / `clearCountdownTimers()` public methods, `transitionTo` clears handles on COUNTDOWN→* edges, `removePlayer` clears handles when player count hits 0.
- `game-server/src/server.ts` — Extended type-only import + added value import for `COUNTDOWN_DURATION_MS` / `FIGHT_HOLD_MS`. New `startCountdown(lobbyId, room)` module-level helper scheduling 4 ticks + final transition. `lobby:start` handler gains `if (gameRooms.has(lobby.id)) return;` defense-in-depth guard. Phase 7 STUB block (the `setTimeout(..., 50)` auto-advance) deleted entirely. `match:loaded` handler now ends in `startCountdown(lobbyId, room);`. One-line audit-trail comment above the disconnect handler's `room.removePlayer(socket.id)` call.
- `game-server/src/lobby-manager.test.ts` — New `startLobby — idempotency (CR-02)` describe block with 2 cases (double-call returns null; status-already-in-progress returns null).
- `game-server/src/game-room.test.ts` — New `GameRoom — countdown timer handles (LFC-08, WR-07)` describe block with 4 cases (push/clear idempotency, transitionTo(ACTIVE) clears, transitionTo(ENDED) clears, removePlayer-empties-room clears). Uses `vi.useFakeTimers()` to assert callbacks never fire after cancellation.

## Decisions Made

- **Constants placement:** `COUNTDOWN_DURATION_MS` and `FIGHT_HOLD_MS` live in `types.ts` (not `server.ts`) — per plan rule, this makes the protocol values importable by Plan 08-02 client code from the same module that defines `MatchCountdownTickPayload`. Self-documenting protocol module.
- **Helper signature:** `startCountdown(lobbyId, room)` accepts both rather than re-looking-up the room via `gameRooms.get(lobbyId)`. Avoids a redundant Map lookup and makes the identity-check intent explicit at the call site (the room reference IS the capture target the callbacks verify against).
- **Identity check + state check are both required:** callbacks check `gameRooms.get(lobbyId) === room` AND `room.state === 'COUNTDOWN'`. The first catches "room was replaced by a future race"; the second catches "room is still the same but already transitioned" (e.g., a future host-disconnect-during-countdown path that calls `transitionTo('ENDED')`).
- **Audit-trail comment in disconnect handler:** Per Task 3 spec, did NOT add new logic to the disconnect handler — `GameRoom.removePlayer` (edited in Task 2) transitively triggers `clearCountdownTimers()` when the room becomes empty. Added a one-line comment so future readers find the audit trail.

## Deviations from Plan

None — plan executed exactly as written, with one minor implementation adjustment documented below that does not constitute a deviation (it's a test-only TypeScript ergonomics fix the plan explicitly anticipated by noting the production code should use `ReturnType<typeof setTimeout>`).

### Implementation note (not a deviation)

**Test-file `setTimeout` type cast:** In `game-room.test.ts`, calls to `setTimeout(spy, ms)` are cast via `as unknown as ReturnType<typeof setTimeout>` before being passed to `room.pushCountdownHandle(...)`. Reason: vitest's globals shim pulls the DOM `setTimeout` overload (returns `number`) into test-file scope, while production `game-room.ts` resolves the Node overload (returns `NodeJS.Timeout`). Casting in tests is the minimal-surface fix that keeps the production API's strong typing intact. Verified: `tsc --noEmit` exits 0, all 17 game-room tests pass with `vi.useFakeTimers()` confirming cancelled handles never fire.

---

**Total deviations:** 0
**Impact on plan:** None. The implementation note above is a test-tooling artifact, not a logic deviation.

## Issues Encountered

- `game-server` had no `node_modules` directory in the worktree (parallel worktrees don't share installs). Ran `npm install` once at start to enable `tsc --noEmit` and `vitest run`. No production code change required.
- Initial test-file `setTimeout` calls failed `tsc --noEmit` with `TS2345: Argument of type 'number' is not assignable to parameter of type 'Timeout'` — see the "Implementation note" above for the resolution.

## Plan Verification Criteria (all 11 PASS)

1. `cd game-server && npx tsc --noEmit` exits 0 — PASS
2. `cd game-server && npx vitest run` — 37/37 tests pass (was 31; +6 new) — PASS
3. `grep -c "Phase 7 STUB" game-server/src/server.ts` returns 0 — PASS
4. `grep -rc "Phase 7 STUB" game-server/src/` returns 0 across all files — PASS
5. `grep -c "match:countdown-tick" game-server/src/server.ts` returns 1 — PASS (>=1)
6. `grep -c "startCountdown" game-server/src/server.ts` returns 2 — PASS (>=2)
7. `grep -c "MatchCountdownTickPayload" game-server/src/types.ts` returns 1 — PASS (>=1)
8. `grep -cE "COUNTDOWN_DURATION_MS|FIGHT_HOLD_MS" game-server/src/types.ts` returns 3 — PASS (>=2)
9. `grep -cE "pushCountdownHandle|clearCountdownTimers" game-server/src/game-room.ts` returns 4 — PASS (>=2)
10. `grep -F "lobby.status !== 'waiting'" game-server/src/lobby-manager.ts` returns the guard line — PASS (>=1)
11. `grep -c "gameRooms.has(lobby.id)" game-server/src/server.ts` returns 1 — PASS (>=1)

## Threat Model Compliance

Per the plan's `<threat_model>`:

- **T-08-01 (DoS via double-clicked `lobby:start`):** mitigated. `LobbyManager.startLobby` returns `null` when `lobby.status !== 'waiting'`; `server.ts` defense-in-depth `gameRooms.has(lobby.id)` guard prevents `new GameRoom()` allocation. Both layers verified by tests + grep counts (#10, #11).
- **T-08-02 (use-after-free in scheduled callbacks):** mitigated. All 5 callbacks (4 ticks + final transition) capture `room` by reference and verify `gameRooms.get(lobbyId) === room && room.state === 'COUNTDOWN'` before emitting. Handles are pushed onto `room.pushCountdownHandle` and cancelled by `clearCountdownTimers()` on COUNTDOWN→* transitions and empty-room removePlayer.
- **T-08-03 (spoofed inbound `match:countdown-tick` from peer):** accepted as documented. No `socket.on('match:countdown-tick', ...)` handler exists on the server; server is emit-only for this event.
- **T-08-04 (Phase 7 WR-02 payload-shape validation):** accepted as scoped-out. Plan 08-01 preserves the existing `({ lobbyId }: MatchLoadedPayload)` shape; hardening is a separate phase.

## Next Phase Readiness

- Plan 08-02 (client cinematic + overlay) can now wire up to `match:countdown-tick` as the single source of countdown labels. The constants `COUNTDOWN_DURATION_MS` and `FIGHT_HOLD_MS` are exported from `game-server/src/types.ts` and mirror-importable into `src/networking/types.ts`.
- The Phase 7 STUB is gone — Plan 08-02 must NOT reintroduce any 50ms auto-advance fallback path; the server is now authoritative for the COUNTDOWN→ACTIVE edge.
- All Phase 7 review-report bugs that affect Phase 8 (CR-02, WR-07) are closed. The Phase 7 WR-02 payload-shape validation remains open but is out of scope here.

## Self-Check: PASSED

Verified before returning:
- `game-server/src/types.ts` — FOUND, contains `MatchCountdownTickPayload`, `COUNTDOWN_DURATION_MS`, `FIGHT_HOLD_MS`
- `game-server/src/lobby-manager.ts` — FOUND, contains `lobby.status !== 'waiting'` guard
- `game-server/src/game-room.ts` — FOUND, contains `pushCountdownHandle` + `clearCountdownTimers` methods
- `game-server/src/server.ts` — FOUND, contains `startCountdown` + `match:countdown-tick` + `gameRooms.has(lobby.id)`, ZERO `Phase 7 STUB` hits
- `game-server/src/lobby-manager.test.ts` — FOUND, contains `startLobby — idempotency (CR-02)` describe block
- `game-server/src/game-room.test.ts` — FOUND, contains `GameRoom — countdown timer handles (LFC-08, WR-07)` describe block
- Commit `00aa13a` (Task 1) — FOUND in git log
- Commit `c609efa` (Task 2) — FOUND in git log
- Commit `2dafc05` (Task 3) — FOUND in git log

---
*Phase: 08-countdown-state*
*Plan: 01*
*Completed: 2026-05-15*
