---
phase: "02"
plan: "02"
subsystem: lobby
tags: [bug-fix, ui, host-detection, team-assignment]
dependency_graph:
  requires: [02-01]
  provides: [host-detection, team-assignment-ui]
  affects: [lobby-scene]
tech_stack:
  added: []
  patterns: [private-class-fields, phaser-containers]
key_files:
  modified: [src/scenes/lobby-scene.ts]
decisions:
  - "#isHost set on CREATE LOBBY click (before server response) so flag is ready when #showWaitingRoomView is called"
  - "#isHost reset only in shutdown() and #onLobbyStarted — NOT in #clearView() to avoid erasing it during view transitions"
  - "Both bug fix and team UI committed in one atomic commit (same file, interleaved changes)"
metrics:
  duration: ~15min
  completed: "2026-03-30"
  tasks: 5
  files: 1
---

# Phase 02 Plan 02: LobbyScene Host Fix + Team Assignment UI Summary

**One-liner:** `#isHost` boolean eliminates race-condition START button bug; host now sees team A/B toggles per player row in the waiting room.

**Status:** complete  
**Commit(s):** `77d67eb` — fix(02-02): add #isHost boolean for correct host detection in LobbyScene

## What was built

- **Bug fix — host detection:** Replaced broken `lobby.hostPlayerId === nm.localPlayerId || lobby.players[0]?.socketId` condition (always `true`) with a `#isHost: boolean` field that is set to `true` exactly when `sendLobbyCreate()` is called, and reset to `false` only in `shutdown()` and `#onLobbyStarted` (not in `#clearView()`).
- **START button visibility:** Only the lobby creator now sees the START GAME button in the waiting room; all other clients see the hint text only.
- **Team toggle buttons (host):** Each player row in the waiting room shows "A" and "B" buttons for the host, wired to `NetworkManager.getInstance().sendLobbyAssignTeam(player.id, team)`. The inactive team button is dim (`BTN_DISABLED`); the active one retains the normal `BTN_COLOR`.
- **Read-only team badges (non-host):** Non-host players see "Team A" (blue), "Team B" (red), or "—" (grey) text badge per player row.
- **Row height:** Increased from 28 px to 36 px per row to accommodate the extra controls.
- **N-player generic rendering:** `players.forEach(...)` — no hardcoded player count.

## Key files changed

- `src/scenes/lobby-scene.ts`

## Decisions made

- `#isHost` is a private class field (not derived from network state) to avoid depending on `nm.localPlayerId` which is only populated after `lobby:started`.
- Reset only in `shutdown()` + `#onLobbyStarted` — placing a reset in `#clearView()` would clear the flag during the lobby-list → waiting-room transition (which calls `#clearView()` as its first action), causing the START button to never appear. **This is the key correctness invariant for this plan.**
- Combined both the bug fix and the team UI into one commit because the changes are interleaved within a single file.

## Deviations from Plan

None — plan executed exactly as written.

## Verification passed

- [x] `pnpm tsc --noEmit` — no errors in `src/` (4 pre-existing errors in `node_modules` only)
- [x] Host detection logic manually verified correct: CREATE LOBBY → `#isHost = true` → `#showWaitingRoomView` → `#clearView()` runs (but does NOT touch `#isHost`) → `if (this.#isHost)` evaluates `true` → START button rendered for host only
- [x] Team assignment: host A/B buttons call `sendLobbyAssignTeam`; server broadcasts `lobby:updated`; `#onWaitingRoomUpdate` calls `#renderPlayerList` → all clients re-render with updated badges

## Self-Check: PASSED

- `src/scenes/lobby-scene.ts` modified ✓
- Commit `77d67eb` exists ✓
