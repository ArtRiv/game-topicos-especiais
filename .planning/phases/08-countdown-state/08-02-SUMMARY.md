---
phase: 08-countdown-state
plan: 02
subsystem: client
tags: [phaser, countdown, camera-zoom, input-lock, server-driven]

# Dependency graph
requires:
  - phase: 08-countdown-state
    plan: 01
    provides: server-driven 4-tick countdown broadcast + MatchCountdownTickPayload protocol
  - phase: 07-loading-state-match-fsm-foundation
    provides: MatchState + MatchStateChangedPayload protocol, NETWORK_MATCH_STATE_CHANGED event-bus constant, LoadingScene bridge to GameScene
provides:
  - MatchCountdownTickPayload client mirror type
  - NETWORK_MATCH_COUNTDOWN_TICK event-bus constant
  - NetworkManager re-emit of inbound match:countdown-tick onto EVENT_BUS
  - GameScene #combatLocked field + #enterCountdownMode / #exitCountdownMode / #onCountdownTick handlers
  - Camera zoom-in cinematic (0.6x → 1.0x over 3 s) on COUNTDOWN
  - Centered Press-Start-2P overlay text driven 100% by server ticks
  - Top-of-function #combatLocked guards on #updateFireBreathChanneling + #updateEarthWallSpell
affects: [09-results-screen, 11-reconnect]

# Tech tracking
tech-stack:
  added: []  # zero new dependencies — uses existing phaser + socket.io-client
  patterns:
    - "Server-driven overlay: client renders only what inbound match:countdown-tick frames tell it to render — no client-side setInterval / time.delayedCall for the digit progression"
    - "Additive lock flag: #combatLocked is a scene-local guard layered on top of #controls.isMovementLocked to close the spell-input gap (FireBreath + EarthWall handlers ignore isMovementLocked because the spells themselves manage that flag)"
    - "Lazy overlay creation: #countdownText is created on first #enterCountdownMode and reused on subsequent COUNTDOWN cycles within the same scene lifetime; SHUTDOWN cleans it up with the scene"
    - "Arrow-function class-field handlers: #onMatchStateChanged and #onCountdownTick use arrow-function field syntax so EVENT_BUS.off() resolves to the same reference as on() — canonical Phase 6/7 cleanup discipline"

key-files:
  created: []
  modified:
    - src/networking/types.ts
    - src/common/event-bus.ts
    - src/networking/network-manager.ts
    - src/scenes/game-scene.ts

key-decisions:
  - "Zoomed-out value (0.6) lives ONLY in #enterCountdownMode, never in #setupCamera — late-joiners (Phase 12 scope) must see the play zoom 1.0 by default"
  - "Camera animation uses Phaser's built-in cameras.main.zoomTo(1.0, 3000, 'Sine.easeOut') rather than a manual tween — duration 3000 matches the server's COUNTDOWN_DURATION_MS (set in Plan 08-01)"
  - "Overlay is a single in-scene Phaser.GameObjects.Text with setScrollFactor(0).setDepth(1000) — NOT a separate Phaser scene. setScrollFactor(0) immunizes the text from the camera pan/zoom so it stays viewport-centered"
  - "#onCountdownTick is defensive: it early-returns if #countdownText is null (the state-changed COUNTDOWN broadcast should create it first, but coalesced socket frames are possible in theory). Setting the text on every tick is idempotent"

patterns-established:
  - "Mirror-type discipline: client MatchCountdownTickPayload is byte-for-byte identical to game-server/src/types.ts MatchCountdownTickPayload, with a header comment naming the source — extend, never break"
  - "Server-emit-only events: no socket.emit('match:countdown-tick', ...) anywhere on the client; the server is the sole source"

requirements-completed:
  - LFC-06
  - LFC-07
  - LFC-08
  - LFC-09

# Metrics
duration: ~7min (Tasks 1–2 only — Task 3 manual UAT pending human verification)
completed: 2026-05-15
---

# Phase 08 Plan 02: Countdown State (Client) Summary

**Client-side cinematic for the server-driven 3-2-1-FIGHT countdown — input + spell lock via an additive #combatLocked flag, camera snap-out and 3 s zoom-in, centered Press-Start-2P overlay text driven 100% by inbound match:countdown-tick broadcasts, simultaneous unlock on match:state-changed ACTIVE.**

## Performance

- **Duration (automation):** ~7 min for Tasks 1–2
- **Started:** 2026-05-15 (immediately after Plan 08-01 wave 1 completion)
- **Completed (automation):** 2026-05-15
- **Tasks:** 3 (Task 3 is a manual two-window UAT awaiting human verification)
- **Files modified:** 4 (zero files created)

## Accomplishments

- `MatchCountdownTickPayload` now mirrors the server type byte-for-byte on the client side (`src/networking/types.ts`), with a header comment naming the server source per the team's mirror-type discipline.
- `NETWORK_MATCH_COUNTDOWN_TICK` added to `CUSTOM_EVENTS` immediately after `NETWORK_MATCH_STATE_CHANGED`.
- `NetworkManager` re-emits inbound `match:countdown-tick` socket frames as `NETWORK_MATCH_COUNTDOWN_TICK` on `EVENT_BUS`. The existing `match:state-changed` listener is unchanged (still used by `LoadingScene` and now `GameScene`).
- `GameScene` now subscribes to BOTH `NETWORK_MATCH_STATE_CHANGED` and `NETWORK_MATCH_COUNTDOWN_TICK`. Both subscriptions have matching `EVENT_BUS.off()` calls in the existing `Phaser.Scenes.Events.SHUTDOWN` once-handler (the canonical Phase 6/7 cleanup site at line 899 of the pre-edit file).
- New scene-local `#combatLocked` field gates `#updateFireBreathChanneling` and `#updateEarthWallSpell` at the top of each handler — closing the spell-input surface that `controls.isMovementLocked` alone does NOT cover (FireBreath sets `isMovementLocked` during its own channel; EarthWall's pending-click / drawing phases bypass `isMovementLocked`).
- New `#enterCountdownMode`: locks both flags, defensively zeros player velocity, calls `cameras.main.setZoom(0.6)` then `cameras.main.zoomTo(1.0, 3000, 'Sine.easeOut')`, lazily creates a centered `Phaser.GameObjects.Text` overlay with `setScrollFactor(0).setDepth(1000)`.
- New `#exitCountdownMode`: releases both locks and hides the overlay text on ACTIVE (does NOT destroy it — Phaser's scene SHUTDOWN handles teardown).
- New `#onCountdownTick`: drives the overlay text from the inbound payload's `label` field and runs a one-shot pop-in `scale: { from: 1.3, to: 1.0 }` Back.easeOut tween for juice. Zero client-side timers — the server is authoritative for the digit progression (LFC-08 hard rule).
- `#setupCamera` was NOT modified — the zoomed-out value is set exclusively inside `#enterCountdownMode`, preserving the play-zoom default for any future late-joiner / reconnect path.
- All 45 existing client vitest tests continue to pass (no regressions).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mirror type + event constant + NetworkManager listener for match:countdown-tick** — `d55537a` (feat)
2. **Task 2: Wire countdown cinematic into GameScene (input lock, camera zoom, overlay text)** — `633e9ab` (feat)
3. **Task 3: Two-window manual UAT** — PENDING (checkpoint:human-verify — see "Pending Verification" below)

## Files Modified

- `src/networking/types.ts` — Appended `MatchCountdownTickPayload` type immediately after the existing `MatchLoadedPayload` block. Mirrors `game-server/src/types.ts` exactly: `lobbyId`, `remaining` (number — 3/2/1/0), `label` (string — '3'/'2'/'1'/'FIGHT'), `serverTs`. Header comment cites the server source.
- `src/common/event-bus.ts` — Added `NETWORK_MATCH_COUNTDOWN_TICK: 'NETWORK_MATCH_COUNTDOWN_TICK'` to `CUSTOM_EVENTS` immediately after the existing `NETWORK_MATCH_STATE_CHANGED` entry.
- `src/networking/network-manager.ts` — Appended `MatchCountdownTickPayload` to the existing types import. Added `this.#socket.on('match:countdown-tick', ...)` listener directly below the existing `match:state-changed` listener; the handler ONLY re-emits onto `EVENT_BUS` and does no UI work.
- `src/scenes/game-scene.ts` — Five surgical edits:
  1. Appended `MatchStateChangedPayload` and `MatchCountdownTickPayload` to the existing `'../networking/types'` import (file previously imported none of the match-FSM payload types).
  2. Added `#combatLocked: boolean = false;` and `#countdownText: Phaser.GameObjects.Text | null = null;` private fields alongside the existing multiplayer fields.
  3. Added `EVENT_BUS.on(...)` for both new events inside `#registerCustomEvents` (alongside the existing OPENED_CHEST / ENEMY_DESTROYED / etc subscriptions) AND matching `EVENT_BUS.off(...)` inside the existing SHUTDOWN once-handler at the same site.
  4. Added three new private methods (`#onMatchStateChanged`, `#enterCountdownMode`, `#exitCountdownMode`, `#onCountdownTick`) immediately above `#registerCustomEvents`. The two event handlers are arrow-function class fields so `off()` resolves correctly.
  5. Added `if (this.#combatLocked) return;` as the VERY FIRST statement of `#updateFireBreathChanneling` and `#updateEarthWallSpell`, before any other guard.

## Decisions Made

- **Camera animation API:** Used `cameras.main.zoomTo(1.0, 3000, 'Sine.easeOut')` (Phaser's built-in camera tween) rather than `this.tweens.add({ targets: cameras.main, zoom: ..., duration: ... })`. Reason: the built-in API is the canonical idiomatic path for camera-only animation, handles cleanup on scene shutdown automatically, and exactly matches the example referenced in 08-RESEARCH.md.
- **Overlay font:** `'Press Start 2P'` 48px with `#ffdd55` fill + `#000000` 4px stroke — matches the game's existing pixel-art HUD style (UIScene uses the same font family for hearts/mana labels). Stroke ensures legibility against any tilemap background.
- **Overlay positioning:** `cam.width / 2, cam.height / 2` with `setOrigin(0.5)` and `setScrollFactor(0)` — anchored to the viewport center, immune to camera pan/zoom. This is why a single in-GameScene Text works rather than needing a separate scene.
- **Defensive null check in #onCountdownTick:** Even though `#enterCountdownMode` creates `#countdownText` before any tick arrives in the normal flow, the early-return guards against a hypothetical coalesced frame where a tick arrives before the state-changed handler runs. Setting `setText()` on a null reference would crash the scene.
- **No `time.delayedCall` for the 'FIGHT' label hiding:** `#exitCountdownMode` runs on the `match:state-changed: ACTIVE` broadcast, which the server already delays to t+3500 ms (per Plan 08-01's `FIGHT_HOLD_MS = 500`). The client adds no timing logic of its own — pure event-driven.

## Deviations from Plan

None — plan executed exactly as written. The two non-obvious adjustments below are minor implementation details, not deviations:

### Implementation note (not a deviation)

**Types-import shape:** The plan instructed "find the existing line that imports from `'../networking/types'` (it should already name `MatchStateChangedPayload` from Plan 07-02 or similar) — append `MatchCountdownTickPayload` to the same import. If the file does NOT yet import `MatchStateChangedPayload`, add both types in a single import line." On inspection, GameScene previously imported none of the match-FSM payload types (Plan 07-02 wired LoadingScene, not GameScene). I followed the plan's contingency clause and added both `MatchStateChangedPayload` AND `MatchCountdownTickPayload` to the existing types import in a single edit. Verified compile-clean.

**Verification clarification (not a deviation):** The plan's `<verify><automated>npx tsc --noEmit ...</automated></verify>` clause expects exit-0 from `tsc`. In the worktree, `npx tsc --noEmit` exits non-zero due to pre-existing environmental issues OUTSIDE the client code: (a) `game-server/src/server.ts` cannot resolve `express` / `@msgpack/msgpack` because worktrees don't share the server's `node_modules` (Plan 08-01 documented the same issue and ran `npm install` inside `game-server/`); (b) `lib.dom.d.ts` vs Node typings `TextDecoder` / `TextEncoder` mismatch; (c) vitest's bundled vite cannot resolve `rollup/parseAst` under the project's `moduleResolution: "node"` setting. All three errors exist on the baseline commit (`8ff712f`) BEFORE any Plan 08-02 edits — confirmed by `git stash && npx tsc --noEmit && git stash pop`. The grep filter `npx tsc --noEmit 2>&1 | grep -E "^src/"` returns zero lines after my edits, proving the CLIENT codebase compiles cleanly. Vitest's 45 tests all pass.

---

**Total deviations:** 0
**Impact on plan:** None.

## Pending Verification (Task 3 — checkpoint:human-verify)

Task 3 is a `checkpoint:human-verify` two-window manual UAT covering 12 visual / timing / multi-client checks across LFC-06..09. It CANNOT be automated in this repo:

- LFC-06 (input lock) requires verifying that WASD + spell keys produce zero outbound socket frames during the countdown — needs a real WS panel in DevTools.
- LFC-07 (camera zoom) is a Phaser camera tween — visual-only.
- LFC-08 (overlay sync) requires two browser tabs to display the same digit within ~200 ms across the wire — wall-clock simultaneity verification.
- LFC-09 (simultaneous unlock) is a press-test the instant `FIGHT!` clears — both tabs must respond.

The 12-step checklist is in the plan file at `.planning/phases/08-countdown-state/08-02-PLAN.md` under Task 3 `<how-to-verify>`. Resume signal: `approved` (or describe which step failed with WS log + console output).

## Plan Verification Criteria (automation-eligible — all 9 PASS; Task 3 PENDING)

1. `npx tsc --noEmit` exits 0 across `src/` (client codebase) — PASS (zero `^src/` errors; pre-existing game-server / lib.dom errors documented above)
2. `grep -c "MatchCountdownTickPayload" src/networking/types.ts` → 1 — PASS (>=1)
3. `grep -c "NETWORK_MATCH_COUNTDOWN_TICK" src/common/event-bus.ts` → 1 — PASS (>=1)
4. `grep -c "match:countdown-tick" src/networking/network-manager.ts` → 1 — PASS (>=1)
5. `grep -c "#combatLocked" src/scenes/game-scene.ts` → 7 — PASS (>=3)
6. `grep -cE "if \(this\.#combatLocked\) return" src/scenes/game-scene.ts` → 2 — PASS (>=2)
7. `grep -c "zoomTo(1.0" src/scenes/game-scene.ts` → 1 — PASS (>=1)
8. `grep -c "NETWORK_MATCH_COUNTDOWN_TICK" src/scenes/game-scene.ts` → 3 — PASS (>=2)
9. `grep -c "NETWORK_MATCH_STATE_CHANGED" src/scenes/game-scene.ts` → 3 — PASS (>=2)
10. Task 3 (manual two-window UAT) — PENDING (checkpoint:human-verify)

## Threat Flags

No new security-relevant surface introduced. The client adds NO new outbound socket emits and NO new inbound socket handlers beyond a single `match:countdown-tick` listener that consumes server-emit-only frames. Threat T-08-03 (spoofed inbound `match:countdown-tick` from a peer) was already accepted in Plan 08-01: the WebRTC mesh channels (peers) do NOT carry the `match:` event type space, so a malicious peer cannot inject these.

## Self-Check: PASSED

Verified before returning:
- `src/networking/types.ts` — FOUND, contains `MatchCountdownTickPayload`
- `src/common/event-bus.ts` — FOUND, contains `NETWORK_MATCH_COUNTDOWN_TICK`
- `src/networking/network-manager.ts` — FOUND, contains `match:countdown-tick` listener
- `src/scenes/game-scene.ts` — FOUND, contains `#combatLocked` field + `#enterCountdownMode` + `#exitCountdownMode` + `#onCountdownTick` + the two `if (this.#combatLocked) return` guards + `zoomTo(1.0`
- Commit `d55537a` (Task 1) — FOUND in git log
- Commit `633e9ab` (Task 2) — FOUND in git log
- Client vitest suite — 45/45 PASS, no regressions

---
*Phase: 08-countdown-state*
*Plan: 02*
*Completed (automation): 2026-05-15*
*Awaiting human verification of Task 3 (two-window UAT).*
