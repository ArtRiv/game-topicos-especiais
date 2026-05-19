---
phase: 06-foundation-cleanup
plan: 01
subsystem: scene-lifecycle
tags: [event-bus, listener-cleanup, scene-shutdown, memory-leak-prevention]
dependency_graph:
  requires: []
  provides: [standardized-event-bus-cleanup]
  affects: [lobby-scene, game-over-scene]
tech_stack:
  added: []
  patterns: [phaser-shutdown-event-cleanup]
key_files:
  created: []
  modified:
    - src/scenes/lobby-scene.ts
    - src/scenes/game-over-scene.ts
decisions:
  - "LobbyScene SHUTDOWN removes all 5 possible EVENT_BUS listeners as safety net, keeping existing view-transition off() calls intact"
  - "GameOverScene gets defensive SHUTDOWN hook even though it has no EVENT_BUS usage currently"
  - "RadialMenuScene and PreloadScene confirmed clean -- no changes needed"
metrics:
  duration: 56s
  completed: "2026-04-21"
  tasks: 1
  files_modified: 2
---

# Phase 06 Plan 01: EVENT_BUS Listener Cleanup Summary

Standardized EVENT_BUS listener cleanup in LobbyScene using this.events.once(SHUTDOWN) pattern, eliminating listener leak risk on scene transitions.

## What Was Done

### Task 1: Standardize EVENT_BUS cleanup in LobbyScene and audit remaining scenes

**LobbyScene (primary refactor):**
- Removed `public shutdown(): void` method (lines 33-40) which was the old non-standard cleanup pattern
- Added `this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)` inside `create()` matching the canonical pattern from GameScene and UIScene
- SHUTDOWN callback removes all 5 possible EVENT_BUS listeners: NETWORK_CONNECTED, NETWORK_LOBBY_UPDATED (both #onLobbyUpdated and #onWaitingRoomUpdate handlers), NETWORK_LOBBY_STARTED, NETWORK_DISCONNECTED
- Existing internal `EVENT_BUS.off()` calls in view-transition methods (#onConnected, #showWaitingRoomView, #onLobbyStarted) remain untouched -- they handle view-level cleanup while SHUTDOWN is the scene-level safety net

**GameOverScene (defensive hook):**
- Added `this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)` with comment explaining it exists for future safety
- Scene has no EVENT_BUS usage currently, but hook prevents future listener leaks if EVENT_BUS is added later

**RadialMenuScene (no change):**
- Confirmed no EVENT_BUS usage; uses `this.input.keyboard.once()` which auto-removes; `this.scene.stop()` handles Phaser-managed cleanup

**PreloadScene (no change):**
- Confirmed no EVENT_BUS usage; transitions immediately to GameScene after creating animations

**Commit:** `6849a11`

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `grep -n "public shutdown" src/scenes/lobby-scene.ts` -- no matches (removed)
2. `grep -c "Phaser.Scenes.Events.SHUTDOWN" src/scenes/lobby-scene.ts` -- returns 1
3. `grep -c "Phaser.Scenes.Events.SHUTDOWN" src/scenes/game-over-scene.ts` -- returns 1
4. `npx vitest run` -- 36 tests passed across 7 test files (exit 0)

## Self-Check: PASSED

- [x] src/scenes/lobby-scene.ts modified -- FOUND
- [x] src/scenes/game-over-scene.ts modified -- FOUND
- [x] Commit 6849a11 exists -- FOUND
