---
status: partial
phase: 07-loading-state-match-fsm-foundation
source: [07-VERIFICATION.md]
started: 2026-05-15T22:00:00Z
updated: 2026-05-15T22:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Two-tab synchronized loading & match-start smoke test
expected: Pressing START in Tab A (host) causes BOTH tabs to leave WAITING ROOM together and show the new LoadingScene with both players' names + team colors and the map name. Within ~1.5–2s both tabs advance to GameScene together. DevTools WS log shows: match:state-changed(LOADING) → match:loaded(x2) → match:state-changed(COUNTDOWN) → match:state-changed(ACTIVE).
result: [pending]

### 2. Visual confirmation of player list + map preview on LoadingScene
expected: Each player row shows the player's name and a colored dot (blue=Team A, red=Team B, gray=unassigned). Map name from matchConfig.mode is shown at the top, with a placeholder rectangle labeled '(map preview)' beneath it.
result: [pending]

### 3. LoadingScene min-display gate (LFC-04 visibility) works under foreground+background tab
expected: Even when the server sync-barrier completes in <50ms, the LoadingScene is perceivable for ≥~1.5s before transitioning to GameScene, in BOTH a fully-foreground tab and a side-by-side two-window setup (per gap-closure commits d4d8e9e and 4f2b07d).
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
