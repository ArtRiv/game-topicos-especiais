---
status: partial
phase: 14-core-team-deathmatch-mode
source: [14-VERIFICATION.md]
started: 2026-05-29T00:00:00.000Z
updated: 2026-05-29T00:00:00.000Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Two-client team-deathmatch match to the win target
expected: Each enemy elimination by either teammate increments that team's shared score on BOTH clients simultaneously; reaching the target N (30, or a debug-lowered value) ends the match and every client sees the results overlay at the same time.
result: [pending]

### 2. Intro cinematic feel on a real client
expected: Map-name banner reveals every glyph for long names (e.g. 'DUNGEON 1') with no cut letters; camera establishes wide at map center, pans smoothly to the local player, zooms to play distance; HUD (bars + score plate + radial/element affordance) fades in together; 5-4-3-2-1 digits pop; movement + casting unlock together at the end.
result: [pending]

### 3. Respawn invulnerability visual + cancel
expected: A respawned local player visibly alpha-pulses while protected; enemy spells deal no damage during the window; the pulse stops the instant the player moves, casts, or hits the ~2.5s cap (hard alpha reset to 1).
result: [pending]

### 4. Spawn fairness across maps
expected: On match start and each respawn, players appear at sensible per-team spawnpoints far from living enemies on WORLD / DUNGEON_1 / STAGES, with no overlap/crash when a team has more players than authored spawnpoints.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
