---
plan: 03-03
phase: 3
status: complete
completed_at: 2026-04-01
commit: 7656008
---

# Summary: Plan 03-03 — Wind Spell (WindBolt)

## What Was Built
`WindBolt` — a faster directed projectile for `ELEMENT.WIND` slot 0. Moves at 900px/s, deals 2 damage, plays a 6-frame loop animation, explodes on wall/enemy impact.

## Tasks Completed
- **03-03-00**: Created `wind-bolt.test.ts` — 4 tests (RED until implementation)
- **03-03-01**: WIND_BOLT assets added in Plan 03-02 (combined batch)
- **03-03-02**: Implemented `wind-bolt.ts` — identical structure to IceShard, different element/asset/config refs

## Verification
- `wind-bolt.test.ts`: 4/4 tests pass
