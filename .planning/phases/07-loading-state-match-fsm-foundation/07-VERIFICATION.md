---
phase: 07-loading-state-match-fsm-foundation
verified: 2026-05-15T00:00:00Z
status: human_needed
score: 4/4 truths verified
overrides_applied: 0
human_verification:
  - test: "Two-tab synchronized loading & match-start smoke test"
    expected: "Pressing START in Tab A (host) causes BOTH tabs to leave WAITING ROOM together and show the new LoadingScene with both players' names + team colors and the map name. Within ~1.5–2s both tabs advance to GameScene together. DevTools WS log shows: match:state-changed(LOADING) → match:loaded(x2) → match:state-changed(COUNTDOWN) → match:state-changed(ACTIVE)."
    why_human: "Visual rendering + cross-tab timing + WebSocket frame ordering are not introspectable from the codebase alone; requires a live dev-server + two browser tabs. The plan explicitly documents this as a manual checkpoint."
  - test: "Visual confirmation of player list + map preview on LoadingScene"
    expected: "Each player row shows the player's name and a colored dot (blue=Team A, red=Team B, gray=unassigned). Map name from matchConfig.mode is shown at the top, with a placeholder rectangle labeled '(map preview)' beneath it."
    why_human: "LFC-04 specifies user-perceivable UI; only a human can confirm font legibility, color accuracy, and layout. Code inspection confirms the render calls but not the visual outcome."
  - test: "LoadingScene min-display gate (LFC-04 visibility) works under foreground+background tab"
    expected: "Even when the server sync-barrier completes in <50ms, the LoadingScene is perceivable for ≥~1.5s before transitioning to GameScene, in BOTH a fully-foreground tab and a side-by-side two-window setup (per gap-closure commits d4d8e9e and 4f2b07d)."
    why_human: "Perceptual timing under browser foreground/background throttling can only be validated visually."
notes:
  - The phase under verification ships happy-path implementation only. The 07-REVIEW.md identified 2 BLOCKER-class robustness defects (CR-01 sync-barrier disconnect deadlock; CR-02 non-idempotent lobby:start) and 7 warning-tier issues. These are NOT goal-blocking for the phase goal as written — the happy-path two-tab smoke test passes — but they are real defects that surface under disconnect-during-LOADING and double-click-start scenarios. They are documented in the "Code Review Findings" section below for follow-up but do not change the goal-achievement verdict.
  - Pre-existing tsc errors in /node_modules/ are out of scope per executor SCOPE BOUNDARY rule; phase 7 files compile cleanly on their own.
---

# Phase 07: LOADING State + Match FSM Foundation — Verification Report

**Phase Goal:** Players see a synchronized loading screen showing match composition (player names + team colors) and the selected map preview before the game scene starts, and no one enters until everyone has loaded.

**Verified:** 2026-05-15
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria + PLAN must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Host pressing Start in the lobby transitions every connected client to a loading screen simultaneously (SC-1 / LFC-03) | VERIFIED | `game-server/src/server.ts:89-103` — `lobby:start` handler creates GameRoom, transitions `LOBBY → LOADING`, broadcasts `match:state-changed` to `lobby:${lobby.id}` room (every connected member), then emits `lobby:started` with matchConfig. `src/scenes/lobby-scene.ts:228-235` — `#onLobbyStarted` consumes matchConfig and starts `LOADING_SCENE` instead of `PRELOAD_SCENE` directly. Wiring confirmed end-to-end. |
| 2 | The loading screen lists every match participant with their name and team color, plus a preview of the selected map (SC-2 / LFC-04) | VERIFIED (with override-equivalent note: map preview is intentionally a labeled placeholder rectangle in Phase 7; real preview asset deferred to Phase 9 per explicit plan authorization) | `src/scenes/loading-scene.ts:67-93` — `#renderUI` adds `'LOADING MATCH'` title, `Map: ${matchConfig.mode}` text, placeholder rectangle, `PLAYERS (n)` header, and one row per player with name + colored dot (Team A=blue 0x44aaff, Team B=red 0xff5533, unassigned=palette tint). Mirrors LobbyScene `#renderPlayerList` palette. The 1500 ms `MIN_DISPLAY_MS` clamp in `#scheduleTransition` (anchored to `#ackSentAt` after fix `4f2b07d`) makes the UI perceivable. |
| 3 | The game scene does not start for any client until every client has reported "loaded" to the server (SC-3 / LFC-05) | VERIFIED | `game-server/src/game-room.ts:69-79` — `markLoaded()` returns `true` only on the call that grows the loaded-set to match player count (exact-once contract verified by vitest tests in `game-room.test.ts`). `server.ts:105-132` — `match:loaded` handler only transitions `LOADING → COUNTDOWN` when `allLoaded === true`; only then does it broadcast. Client side: `loading-scene.ts:106-128` gates `scene.start(PRELOAD_SCENE)` on `COUNTDOWN`/`ACTIVE` broadcast for the matching lobbyId. Client never advances on its own clock. |
| 4 | The match-state machine on the server has explicit `LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED` transitions and broadcasts every change to all clients (SC-4 / LFC-01, LFC-02) | VERIFIED | `game-server/src/game-room.ts:3-9` — `VALID_NEXT` table encodes exactly the required edges (LOBBY→LOADING; LOADING→COUNTDOWN,ENDED; COUNTDOWN→ACTIVE,ENDED; ACTIVE→ENDED; ENDED→∅). `transitionTo()` throws on invalid edges (test-verified). `server.ts:20-27` defines `broadcastMatchState()`; every successful transition in `server.ts` (89-103 lobby:start; 105-132 match:loaded → COUNTDOWN + stub COUNTDOWN→ACTIVE) is followed by a `broadcastMatchState()` call emitting to `lobby:${lobbyId}`. Client `network-manager.ts:262-264` listens and re-emits as `NETWORK_MATCH_STATE_CHANGED`. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `game-server/src/types.ts` | MatchState, MatchStateChangedPayload, MatchLoadedPayload exports | VERIFIED | Lines 58-72 export all three types as planned. |
| `game-server/src/game-room.ts` | FSM with transition guards + loaded-set tracking | VERIFIED | Lines 3-85: `VALID_NEXT` table, `#state`, `#loadedSocketIds`, `transitionTo()`, `markLoaded()`, `loadedCount`, `getAllSocketIds()`; existing public surface preserved. |
| `game-server/src/server.ts` | match:loaded handler + match:state-changed broadcast on lobby:start | VERIFIED | Lines 20-27 helper; lines 89-103 lobby:start now does `transitionTo('LOADING')` + broadcast BEFORE `lobby:started`; lines 105-132 new `match:loaded` handler with sync-barrier + Phase-7 STUB COUNTDOWN→ACTIVE. |
| `game-server/src/game-room.test.ts` | FSM + sync-barrier unit tests | VERIFIED | 13 vitest tests pass (7 original + 6 new): FSM transitions, invalid-edge throws, exact-once markLoaded, non-member rejection, ack-cleanup on removePlayer. `npx vitest run` exits 0. |
| `src/scenes/loading-scene.ts` | LoadingScene with player list + map preview, sends match:loaded, gates GameScene on COUNTDOWN broadcast | VERIFIED | 129 lines; renders title/map/players/status; sends ack via `#sendLoadedAck` (delayedCall 0); listens for `NETWORK_MATCH_STATE_CHANGED`; gates scene start on COUNTDOWN/ACTIVE; enforces `MIN_DISPLAY_MS = 1500` for LFC-04 visibility. |
| `src/networking/types.ts` | MatchState/MatchStateChangedPayload/MatchLoadedPayload client mirror | VERIFIED | Lines 101-115 — byte-for-byte mirror of server types. |
| `src/networking/network-manager.ts` | sendMatchLoaded() + match:state-changed listener | VERIFIED | Line 139 `sendMatchLoaded(lobbyId)`; lines 262-264 socket listener re-emitting as NETWORK_MATCH_STATE_CHANGED. |
| `src/common/event-bus.ts` | NETWORK_MATCH_STATE_CHANGED event constant | VERIFIED | Line 34 in CUSTOM_EVENTS. |
| `src/scenes/scene-keys.ts` | LOADING_SCENE key | VERIFIED | Line 8. |
| `src/scenes/lobby-scene.ts` | #onLobbyStarted routes through LOADING_SCENE with matchConfig | VERIFIED | Lines 228-235 — accepts `{ matchConfig }` and calls `scene.start(SCENE_KEYS.LOADING_SCENE, { matchConfig })`. |
| `src/main.ts` | LoadingScene registered between LobbyScene and PreloadScene | VERIFIED | Line 4 imports `LoadingScene`; line 39 `game.scene.add(SCENE_KEYS.LOADING_SCENE, LoadingScene)` between LOBBY_SCENE (38) and PRELOAD_SCENE (40). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `server.ts: lobby:start` | `game-room.ts: transitionTo()` | `room.transitionTo('LOADING')` followed by `broadcastMatchState()` | WIRED | server.ts:98-99. State changes before the lobby:started broadcast (per plan ordering rule). |
| `server.ts: match:loaded` | `game-room.ts: markLoaded()` | `room.markLoaded(socket.id)` returning boolean | WIRED | server.ts:108. Exact-once boolean drives the COUNTDOWN transition; tested at game-room.test.ts. |
| `loading-scene.ts: create()` | `network-manager.ts: sendMatchLoaded` | `NetworkManager.getInstance().sendMatchLoaded(lobbyId)` via deferred call | WIRED | loading-scene.ts:99 inside `#sendLoadedAck`, gated by `#ackSent` flag. |
| `network-manager.ts: socket.on('match:state-changed')` | `loading-scene.ts: #onMatchStateChanged` | `EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, payload)` → scene subscription | WIRED | network-manager.ts:262-264 (emit) + loading-scene.ts:55 (subscribe) + 106-112 (handler). |
| `lobby-scene.ts: #onLobbyStarted` | `loading-scene.ts: init/create` | `this.scene.start(SCENE_KEYS.LOADING_SCENE, { matchConfig })` | WIRED | lobby-scene.ts:234. matchConfig delivered. |
| `loading-scene.ts: #scheduleTransition` | `preload-scene.ts → GameScene` | `this.scene.start(SCENE_KEYS.PRELOAD_SCENE)` after MIN_DISPLAY_MS | WIRED | loading-scene.ts:126. PreloadScene then chains to GameScene per existing flow (unchanged). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `loading-scene.ts` | `#matchConfig` (players, mode, lobbyId) | Passed via `scene.start(LOADING_SCENE, { matchConfig })` from `lobby-scene.ts:234`, which receives it from `EVENT_BUS.emit(NETWORK_LOBBY_STARTED, { matchConfig })` (network-manager.ts:256). matchConfig is server-emitted in server.ts:101 from real `lobby.players` (LobbyManager state). | YES — real lobby player data flows from server through socket → NetworkManager → LobbyScene → LoadingScene. Confirmed via 07-02 manual smoke test that names/teams render correctly. | FLOWING |
| `loading-scene.ts` | `MatchStateChangedPayload` | Server emits via `broadcastMatchState()` in server.ts:20-27; payload contains live `room.state` + `Date.now()`. NetworkManager forwards verbatim. | YES — server-side state is the source of truth; verified by unit tests of FSM and confirmed in manual smoke test. | FLOWING |
| `game-room.ts` `#state` | Match-state FSM | Mutated only via `transitionTo()` calls in `server.ts:98, 113, 126`. | YES — state transitions are server-driven from real handlers (lobby:start, match:loaded, setTimeout stub). | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| FSM unit tests pass | `cd game-server && npx vitest run src/game-room.test.ts` | "13 passed (13)" in 5ms (0 failures) | PASS |
| `Phase 7 STUB` marker present once | `grep -c "Phase 7 STUB" game-server/src/server.ts` | `1` | PASS |
| `match:state-changed` wired both sides | grep across `game-server/src` and `src` | server.ts emits 1x via helper (called 3 places — lobby:start, match:loaded COUNTDOWN, stub COUNTDOWN→ACTIVE); network-manager.ts listens; loading-scene.ts subscribes via EVENT_BUS | PASS |
| `match:loaded` wired both sides | grep across `game-server/src` and `src` | server.ts:105 handler; network-manager.ts:139 emit | PASS |
| game-server TypeScript compiles | `cd game-server && npx tsc --noEmit` | exits 0, no output | PASS |
| Client TypeScript compiles for phase 7 files | `npx tsc --noEmit` filtered to phase files | no errors in any of the 7 modified/created files | PASS |
| Live two-tab synchronized load | Requires running dev-server + two browser tabs | Manual; documented as passed in 07-02-SUMMARY after gap-closure commits d4d8e9e + 4f2b07d | SKIP (routed to human verification) |

### Probe Execution

No formal `scripts/*/tests/probe-*.sh` are declared by this phase's PLANs. Behavioral validation runs through vitest (above) and the manual two-tab smoke test (routed to human verification).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LFC-01 | 07-01 | Server tracks match state machine — `LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED` — with explicit transitions on `GameRoom` | SATISFIED | `game-room.ts:3-9` VALID_NEXT table + `transitionTo()` guards; vitest covers all paths and invalid edges. |
| LFC-02 | 07-01, 07-02 | All clients receive match-state transitions via socket.io broadcast and update their local state | SATISFIED | `server.ts: broadcastMatchState()` called on every transition; `network-manager.ts:262-264` listens and re-emits as `NETWORK_MATCH_STATE_CHANGED`; `loading-scene.ts:106` consumes. |
| LFC-03 | 07-01, 07-02 | Host pressing Start in lobby transitions room to `LOADING` for all clients | SATISFIED | `server.ts:89-103` — lobby:start handler runs `room.transitionTo('LOADING')` + broadcast BEFORE the existing `lobby:started` emit. Client routes through LoadingScene via lobby-scene.ts:234. |
| LFC-04 | 07-02 | Pre-match loading screen displays match player list (names + team colors) and selected map preview | NEEDS HUMAN — code is in place; visual confirmation deferred to human verification | `loading-scene.ts:67-93` renders title, map name, placeholder preview rectangle, and per-player rows with team-colored dots. The map *preview* is an intentional labeled placeholder rectangle (real preview asset deferred to Phase 9 per explicit plan authorization at 07-02-PLAN.md). Visibility timing fixed by gap-closure commits d4d8e9e + 4f2b07d (anchored `MIN_DISPLAY_MS` to `#ackSentAt`). |
| LFC-05 | 07-01, 07-02 | Server waits for every client to report `match:loaded` before transitioning to `COUNTDOWN` (sync barrier) | SATISFIED | `game-room.ts:69-79` `markLoaded` exact-once contract; `server.ts:108-117` transitions only when allLoaded=true; client `loading-scene.ts:106-112` gates GameScene entry on COUNTDOWN/ACTIVE broadcast for matching lobbyId. |

**No orphaned LFC-0[1-5] requirements** — all 5 are claimed by at least one of plans 07-01 / 07-02 (07-01 frontmatter: LFC-01, LFC-02, LFC-03, LFC-05; 07-02 frontmatter: LFC-02, LFC-03, LFC-04, LFC-05). REQUIREMENTS.md maps LFC-01..05 → Phase 7 — all accounted for. LFC-06..09 are explicitly Phase 8 (not in scope here).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/scenes/loading-scene.ts` | 72 | Comment `Map preview placeholder — Phase 9 will replace this rectangle with a real preview asset.` | Info | Intentional placeholder explicitly authorized by 07-02-PLAN.md (Phase 9 owns the real map-preview asset registry). Not an unresolved debt marker (no `TBD`/`FIXME`/`XXX`); it is a forward-pointer comment. Not blocking. |
| `game-server/src/server.ts` | 119 | `// Phase 7 STUB: auto-advance COUNTDOWN → ACTIVE after a short delay` | Info | Intentional and required by the plan to preserve end-to-end game flow until Phase 8 replaces it with real countdown timing. The marker is the agreed convention for Phase 8 to find-and-replace. Not blocking. |

No `TBD`, `FIXME`, `XXX`, or `HACK` markers introduced in modified files. No stub returns, no hardcoded empty data feeding rendering, no console.log-only handlers.

### Code Review Findings (from 07-REVIEW.md — informational)

The standard-depth code review identified 2 BLOCKER-class robustness defects and 7 warnings that are NOT in the happy-path goal but represent real edge-case failure modes:

| ID | Severity | Issue | Goal-blocking? |
|----|----------|-------|----------------|
| CR-01 | BLOCKER | Sync barrier deadlocks if a non-acked peer disconnects during LOADING (remaining acked sockets are never re-evaluated after removePlayer). | No — happy path passes; reachable in "tab closes mid-LOADING" scenarios. |
| CR-02 | BLOCKER | `lobby:start` not idempotent — double-click overwrites the in-flight GameRoom, destroys already-received acks, deadlocks the new room. | No — happy path passes; reachable in "host double-clicks" / packet replay scenarios. |
| WR-01 | Warning | `gameRooms` map never cleaned up — memory leak across matches. | No — long-running server concern. |
| WR-02 | Warning | Server handlers don't validate inbound payload shape — TypeScript type assertion erased at runtime. | No — robustness/security. |
| WR-03 | Warning | LoadingScene never exits on ENDED broadcast — stranded scene on host disconnect during LOADING. | No — coupled to CR-01 trigger. |
| WR-04 | Warning | LobbyScene `#showWaitingRoomView` doesn't off-listeners before re-registering — duplicate listeners after host migration. | No — pre-existing pattern made more visible by Phase 7. |
| WR-05 | Warning | LoadingScene crashes if started without matchConfig. | No — only reachable via dev-tool/refactor regression. |
| WR-06 | Warning | sendMatchLoaded doesn't surface failure if called before socket connect. | No — edge case. |
| WR-07 | Warning | setTimeout 50ms stub in match:loaded leaks/can target wrong room. | No — coupled to WR-01 cleanup gap. |

**Verifier verdict on review findings:** These are real defects but do NOT falsify the phase goal as written. The phase goal is "Players see a synchronized loading screen ... and no one enters until everyone has loaded." That observable behavior IS achieved on the happy path (two-tab manual smoke test passed per 07-02-SUMMARY). The review findings should be tracked as follow-up work — most fit naturally with Phase 12 (Reconnect Grace Window — MER-05/MER-06) for the disconnect-resilience concerns, and CR-02/WR-01/WR-02/WR-04 should be scheduled as a robustness sweep before v1.2 ships. Recommend creating a dedicated follow-up phase or adding them to the existing milestone-level robustness backlog rather than re-opening Phase 7.

### Human Verification Required

Three items require human testing (visual rendering + cross-tab timing). See `human_verification` block in frontmatter.

1. **Two-tab synchronized loading & match-start smoke test** — Pressing START in Tab A (host) causes BOTH tabs to leave WAITING ROOM together and show LoadingScene with both players' names + team colors and the map name. Within ~1.5–2s both tabs advance to GameScene together. DevTools WS log shows the expected event sequence.

2. **Visual confirmation of player list + map preview on LoadingScene** — Each player row shows the player's name and a colored dot (blue=Team A, red=Team B, gray=unassigned). Map name from matchConfig.mode is shown at the top, with a placeholder rectangle labeled "(map preview)" beneath it.

3. **LoadingScene min-display gate (LFC-04 visibility) works under foreground+background tab** — Even when the server sync-barrier completes in <50ms, the LoadingScene is perceivable for ≥~1.5s before transitioning to GameScene, in BOTH a fully-foreground tab and a side-by-side two-window setup.

The two-tab smoke test was already executed by the user per 07-02-SUMMARY ("Final test confirmation: Two-window side-by-side test ... both windows showed map name + team-colored player rows for ~1.5s, then both advanced to GameScene synchronously. ✓"). This was the basis for promoting the checkpoint from `human-verify` to passed. The verifier flags these items so the orchestrator can present them to the user for explicit sign-off on the goal achievement, rather than relying solely on the executor's narrative.

### Gaps Summary

**No gaps blocking the phase goal.** All four ROADMAP success criteria have observable evidence in the codebase. All five LFC requirements (LFC-01..05) trace to concrete artifacts and wiring. The 13 vitest unit tests for the server FSM pass. End-to-end wiring (lobby:start → match:state-changed broadcast → LoadingScene render → match:loaded ack → COUNTDOWN broadcast → PreloadScene → GameScene) is intact.

The code review's BLOCKER findings (CR-01, CR-02) describe robustness failure modes outside the phase goal's happy-path scope. The verifier's recommendation is to surface them to the developer as follow-up work; they should NOT cause re-planning of Phase 7.

The reason status is `human_needed` rather than `passed` is procedural: visual rendering, cross-tab timing, and WebSocket frame ordering cannot be verified from the codebase alone. The smoke test was performed by the user during execution, but the goal-backward verifier does not have direct evidence of the live-system behavior — only of the code paths. The user should confirm one final time that the documented smoke-test outcome from 07-02-SUMMARY reflects their experience.

---

_Verified: 2026-05-15_
_Verifier: Claude (gsd-verifier)_
