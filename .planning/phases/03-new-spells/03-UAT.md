---
status: testing
phase: 03-new-spells
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md]
started: 2026-04-01T23:59:00.000Z
updated: 2026-04-01T23:59:00.000Z
---

## Current Test

number: 1
name: Ice Shard fires
expected: |
  As an Ice-element player, pressing the primary attack key fires an ice projectile
  toward the cursor. It travels in a straight line (high speed), loops its ice crystal
  animation while in flight, and explodes with a hit animation on contact with a wall
  or enemy character.
awaiting: user response

## Tests

### 1. Ice Shard fires
expected: As an Ice-element player, pressing the primary attack key fires an ice projectile toward the cursor. It travels in a straight line, loops its crystal animation while airborne, and shows a hit/explode animation on contact with a wall or enemy.
result: pending

### 2. Wind Bolt fires
expected: As a Wind-element player, pressing the primary attack key fires a wind projectile toward the cursor. It moves noticeably faster than the Ice Shard, loops its wind animation in flight, and explodes on contact with walls/enemies.
result: pending

### 3. Thunder Strike drops
expected: As a Thunder-element player, pressing the primary attack key causes a lightning strike to descend at the cursor position. A vertical strike animation plays (13 frames), then a brief ~400ms window where nearby enemies take damage, followed by a splash animation, then the spell disappears.
result: pending

### 4. Existing spells still work (no regressions)
expected: Fire bolt, Earth bolt, Water spike, and their secondary spells (Fire area, Earth bump, Water tornado) all still fire/trigger normally for their respective element players. No existing spell is broken by the registry refactor.
result: pending

### 5. New spells visible over network
expected: In a 2-player session, when Player 2 (Ice/Wind/Thunder element) casts their spell, Player 1 sees the correct spell animation appear at the correct position. Remote Ice Shards and Wind Bolts travel in the right direction; remote Thunder Strikes drop at the right location.
result: pending

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

<!-- Filled by diagnosis if issues are found -->
