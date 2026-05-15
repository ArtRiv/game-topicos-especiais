---
phase: 07-loading-state-match-fsm-foundation
plan: 02
subsystem: scenes
tags: [phaser-3, scene, match-lifecycle, loading-screen, sync-barrier, socket.io, typescript]

# Dependency graph
requires:
  - phase: 07-loading-state-match-fsm-foundation
    plan: 01
    provides: Server-side MatchState FSM, match:state-changed broadcast, match:loaded sync barrier
provides:
  - Client-side MatchState / MatchStateChangedPayload / MatchLoadedPayload types mirroring the server
  - CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED so scenes can subscribe to FSM transitions
  - SCENE_KEYS.LOADING_SCENE + new LoadingScene class
  - NetworkManager.sendMatchLoaded(lobbyId) + match:state-changed listener
  - LobbyScene -> LoadingScene -> PreloadScene -> GameScene navigation chain
affects: [08-countdown-intro, 09-results-screen, 09-lobby-format-map-config]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Scene-as-sync-barrier: LoadingScene sends ack on entry and waits for FSM broadcast before chaining to next scene
    - Mirror-type discipline: client mirrors server protocol types in src/networking/types.ts (kept in sync per comment header)
    - Listener-on-create + off-on-shutdown for EVENT_BUS subscriptions (canonical Phase 6 cleanup pattern)

key-files:
  created:
    - src/scenes/loading-scene.ts
  modified:
    - src/networking/types.ts
    - src/common/event-bus.ts
    - src/scenes/scene-keys.ts
    - src/networking/network-manager.ts
    - src/scenes/lobby-scene.ts
    - src/main.ts

key-decisions:
  - "LoadingScene does NOT preload Phaser assets — PreloadScene still owns the asset pack. LoadingScene is UI-only during Phase 7. Adding asset loading here would duplicate PreloadScene's work and break the single-source-of-truth for assets."
  - "Accept either COUNTDOWN or ACTIVE as the 'all loaded' signal in LoadingScene. The Phase-7 server stub auto-advances COUNTDOWN→ACTIVE in 50 ms, so the client may receive either first depending on socket ordering — both mean the same thing for the client-side scene transition."
  - "Send `match:loaded` via `this.time.delayedCall(0, ...)` instead of synchronously in `create()`. This ensures the user sees the LoadingScene UI render at least one frame before the ack-and-transition sequence starts, giving visual confirmation that loading is happening."
  - "Defer the map preview to Phase 9 (labeled placeholder rectangle for now). The plan explicitly authorizes this — `matchConfig.mode` is the de-facto map identifier in Phase 7, and there is no map-pool/preview-asset registry yet."

patterns-established:
  - "Match-FSM consumers subscribe to CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED and filter on lobbyId — anyone needing FSM state can plug in without touching NetworkManager"
  - "Sync-barrier ack from the client: send exactly once (guarded by a boolean) and let the server's broadcast drive the next scene transition"

requirements-completed: [LFC-02, LFC-03, LFC-04, LFC-05]

# Metrics
duration: ~4min
completed: 2026-05-15
---

# Phase 07 Plan 02: Client LoadingScene + Match-State Plumbing Summary

**Client-side LoadingScene + match-state event plumbing: pressing Start in the lobby now takes every client to a synchronized loading screen with player list + map name, and no client enters the GameScene until the server broadcasts COUNTDOWN/ACTIVE (LFC-05 sync barrier).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-15T22:51:39Z
- **Completed:** 2026-05-15T22:55:44Z
- **Tasks:** 2 of 3 complete (Task 3 is a manual two-tab smoke test — see Checkpoint Status below)
- **Files created:** 1
- **Files modified:** 6

## Accomplishments

- **Client mirror types** for the FSM protocol added to `src/networking/types.ts` — `MatchState`, `MatchStateChangedPayload`, `MatchLoadedPayload`, matching Plan 07-01's server definitions byte-for-byte.
- **New event constant** `CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED` so any scene can subscribe to FSM transitions without touching `NetworkManager`.
- **NetworkManager wiring**: added `sendMatchLoaded(lobbyId)` next to `sendLobbyStart`, and a new `this.#socket.on('match:state-changed', ...)` listener that re-emits the payload on the EVENT_BUS. Existing `lobby:started` listener untouched (still drives navigation).
- **New `LoadingScene`** (`src/scenes/loading-scene.ts`) — renders title, map name + placeholder preview rectangle, and a per-player row with name + team-colored dot mirroring `LobbyScene #renderPlayerList`. Sends `match:loaded` exactly once on entry; transitions to PreloadScene on receipt of `COUNTDOWN` or `ACTIVE` for the matching `lobbyId`.
- **LobbyScene navigation rerouted**: `#onLobbyStarted` now consumes the `matchConfig` payload and starts `LOADING_SCENE` with it, instead of jumping straight to `PRELOAD_SCENE`.
- **Scene registration**: `LoadingScene` added to `main.ts` between `LobbyScene` and `PreloadScene` to match runtime order.
- **End-to-end flow preserved**: LobbyScene → LoadingScene → PreloadScene → GameScene. The Phase-7 server stub's 50ms COUNTDOWN→ACTIVE auto-advance keeps the existing GameScene entry working until Phase 8 replaces it with a real countdown.

## Task Commits

| # | Task | Type | Commit |
|---|------|------|--------|
| 1 | Add client-side match-state types, event constant, and NetworkManager wiring | feat | `fbde457` |
| 2 | Implement LoadingScene + register it in main.ts; route lobby:started through it | feat | `b270101` |
| 3 | Two-tab smoke test (manual checkpoint) | checkpoint:human-verify | (deferred — see Checkpoint Status) |

## Files Created/Modified

**Created:**
- `src/scenes/loading-scene.ts` — new Phaser Scene; renders match player list + map name + placeholder preview; sends `match:loaded`; gates `scene.start(PRELOAD_SCENE)` on FSM COUNTDOWN/ACTIVE broadcast.

**Modified:**
- `src/networking/types.ts` — appended `MatchState`, `MatchStateChangedPayload`, `MatchLoadedPayload` exports (mirror of `game-server/src/types.ts`).
- `src/common/event-bus.ts` — added `NETWORK_MATCH_STATE_CHANGED` to `CUSTOM_EVENTS`.
- `src/scenes/scene-keys.ts` — added `LOADING_SCENE`.
- `src/networking/network-manager.ts` — extended types import; added `sendMatchLoaded()` public method; added `match:state-changed` socket listener.
- `src/scenes/lobby-scene.ts` — `#onLobbyStarted` now accepts `matchConfig` payload and starts `LOADING_SCENE` instead of `PRELOAD_SCENE`; added `MatchConfig` to the type import.
- `src/main.ts` — imported `LoadingScene`; registered with `game.scene.add(SCENE_KEYS.LOADING_SCENE, LoadingScene)` between Lobby and Preload.

## Decisions Made

- **LoadingScene is UI-only — PreloadScene still owns assets.** Putting `this.load.pack(...)` in LoadingScene would duplicate PreloadScene's work and break asset single-sourcing. The plan explicitly said so; the architecture supports it (PreloadScene runs *after* LoadingScene exits).
- **Accept either COUNTDOWN or ACTIVE as the 'all loaded' transition trigger.** The Phase-7 server stub auto-advances COUNTDOWN→ACTIVE in 50ms. Treating only COUNTDOWN as the trigger would race against the timer; treating either trigger as equivalent ("the server says we're past LOADING") keeps the client robust to socket-ordering quirks and to the eventual Phase 8 replacement of the stub.
- **Deferred-call ack pattern.** `sendMatchLoaded` fires from `time.delayedCall(0, ...)` rather than directly in `create()`. This guarantees one frame of UI rendering before the ack-and-potentially-immediate-transition, so the user always sees the LoadingScene at least briefly even on a 2-player lobby where the server's COUNTDOWN broadcast arrives within a single tick.
- **Map preview as labeled placeholder** — `matchConfig.mode` is the only map identifier in Phase 7 (Phase 9 introduces the real config + preview-asset pipeline). The placeholder rectangle is intentional and signposted in code comments.

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes were needed; types compiled cleanly on first attempt and the navigation rewrite was a 1-line change to the existing `#onLobbyStarted` handler.

## Issues Encountered

- **Worktree did not have `node_modules/` propagated** — needed to run `npm install` in both the worktree root and `game-server/` to enable `tsc --noEmit`. Expected and not a deviation.
- **Pre-existing `tsc --noEmit` warnings** unrelated to this plan (4 errors in `node_modules/typescript/lib/lib.dom.d.ts` and `node_modules/vitest/.../vite/.../index.d.ts` — type-defs version conflict in the project's base `@devshareacademy/tsconfig` extends). Verified to exist both **before and after** this plan's edits via `git stash` + count. No new `src/` errors introduced. Out of scope per executor "SCOPE BOUNDARY" rule.

## Known Stubs

| File | Line | Pattern | Reason |
|------|------|---------|--------|
| `src/scenes/loading-scene.ts` | 60 | "Map preview placeholder — Phase 9 will replace this rectangle with a real preview asset." | Intentional. The plan authorizes this; `matchConfig.mode` is the only map identifier in Phase 7. Phase 9 (Lobby Format & Map Configuration) will introduce a real preview-asset registry. |

## Checkpoint Status

**Task 3 is a `checkpoint:human-verify` manual two-tab smoke test.** It cannot be executed by an autonomous agent — it requires a human at a browser running two tabs against a live dev server and observing the WS message log. Auto-mode is **off** (`workflow.auto_advance=false`), so this checkpoint must be performed by the user before the plan can be declared fully complete.

**To perform the smoke test:**

1. From the worktree root: `npm install` (already done in this worktree).
2. From `game-server/`: `npm install` (already done) then `npm run dev`.
3. From the worktree root in a separate terminal: `npm start` (Vite dev server).
4. Open two browser tabs at the client URL. In each, enter `localhost` as server IP and a distinct nickname.
5. Tab A: click CREATE LOBBY. Tab B: join from the list. From Tab A (host), assign one player to Team A and the other to Team B.
6. Tab A: click START GAME.

**Expected:**
- Both tabs immediately leave WAITING ROOM and show the new LoadingScene with both players' names + team colors and the map name visible.
- Within ~50–200 ms, both tabs advance to GameScene together. Neither tab arrives noticeably earlier.
- DevTools → Network → WS shows: `match:state-changed` (LOADING) immediately after Start, then `match:loaded` from each tab, then `match:state-changed` (COUNTDOWN), then `match:state-changed` (ACTIVE).

If any tab gets stuck on the loading screen, capture the WS message log + console output — that's a real LFC-05 sync-barrier bug to fix before declaring the plan done.

**Server-side correctness already exercised:** Plan 07-01 shipped 13 vitest tests covering FSM transitions, invalid-edge throws, the sync-barrier exact-once contract, non-member ack rejection, and ack cleanup on removePlayer. The remaining manual test is **client visual behavior** only.

## User Setup Required

None for code paths exercised in this plan — but the smoke test above requires running the dev server and opening two browser tabs.

## Next Phase Readiness

- **Phase 8 (countdown UX) ready.** The single `Phase 7 STUB` marker in `game-server/src/server.ts` (the 50ms `setTimeout` advancing COUNTDOWN→ACTIVE) is the exact spot to replace with real 3-2-1 countdown timing. LoadingScene already exits on COUNTDOWN, so Phase 8 owns "show the countdown overlay between LoadingScene's exit and the moment of FIGHT!". The serverTs on `match:state-changed` is already carried for sync.
- **Phase 9 (lobby format & map config) ready.** LoadingScene reads `matchConfig.mode` as the map name and renders a labeled placeholder — once Phase 9 introduces a real map registry + preview assets, the only file that needs to change is `src/scenes/loading-scene.ts` (the `mapName`/placeholder rectangle block).

## Verification

**Plan acceptance criteria from PLAN.md `<verification_criteria>`:**

1. `npx tsc --noEmit` — **N/A as a pass/fail gate** because of a pre-existing type-defs conflict in `node_modules/` (4 errors before edits = 4 errors after edits, exact match via `git stash` comparison). Run on edited files in isolation: **passes** with no errors. Run on `game-server/` only: **passes**.
2. `grep -l "NETWORK_MATCH_STATE_CHANGED" src/common/event-bus.ts` → **`src/common/event-bus.ts`** ✓
3. `grep -l "LOADING_SCENE" src/scenes/scene-keys.ts` → **`src/scenes/scene-keys.ts`** ✓
4. `test -f src/scenes/loading-scene.ts` → **exits 0** ✓
5. `grep -c "LoadingScene" src/main.ts` → **2** (import + scene.add) ✓
6. `grep "scene.start(SCENE_KEYS.LOADING_SCENE" src/scenes/lobby-scene.ts` → **`this.scene.start(SCENE_KEYS.LOADING_SCENE, { matchConfig: data.matchConfig });`** ✓
7. Manual two-tab smoke test — **deferred to user** (see Checkpoint Status).

## Self-Check

- `src/scenes/loading-scene.ts` — FOUND, contains `sendMatchLoaded` and `NETWORK_MATCH_STATE_CHANGED`
- `src/networking/types.ts` — FOUND, contains `export type MatchState`
- `src/common/event-bus.ts` — FOUND, contains `NETWORK_MATCH_STATE_CHANGED`
- `src/scenes/scene-keys.ts` — FOUND, contains `LOADING_SCENE`
- `src/networking/network-manager.ts` — FOUND, contains `sendMatchLoaded` and `match:state-changed`
- `src/scenes/lobby-scene.ts` — FOUND, contains `SCENE_KEYS.LOADING_SCENE`
- `src/main.ts` — FOUND, contains `LoadingScene`
- Commit `fbde457` — FOUND in git log
- Commit `b270101` — FOUND in git log

## Self-Check: PASSED

---
*Phase: 07-loading-state-match-fsm-foundation*
*Plan: 02*
*Completed: 2026-05-15*
