---
plan: 03-01
phase: 3
status: complete
completed_at: 2026-04-01
commit: d68b8ed
---

# Summary: Plan 03-01 — Spell Registry Refactor

## What Was Built
A centralized `spell-registry.ts` as the single source of truth for spell-to-element mapping and costs. `SpellCastingComponent` was fully refactored to look up everything from the registry — adding a new spell element now requires zero changes to the component.

## Tasks Completed
- **03-01-00**: Created `spell-registry.test.ts` with 4 failing tests (RED confirmed)
- **03-01-01**: Added ICE_SHARD, WIND_BOLT, THUNDER_STRIKE constants to `config.ts`, `runtime-config.ts`, and 3 new `SPELL_ID` entries in `common.ts`
- **03-01-02**: Created `spell-registry.ts` with `SPELL_SLOT_REGISTRY`, `SPELL_CONFIG`, `SPELL_FACTORY_REGISTRY`, and `registerSpell()` function
- **03-01-03**: Rewrote `SpellCastingComponent` to use registry; appended `registerSpell()` calls to all 6 existing spell files (fire-bolt, fire-area, earth-bolt, earth-bump, water-spike, water-tornado)

## Key Files Created/Modified
- `src/game-objects/spells/spell-registry.ts` (created)
- `src/game-objects/spells/spell-registry.test.ts` (created)
- `src/components/game-object/spell-casting-component.ts` (rewritten)
- `src/common/config.ts`, `runtime-config.ts`, `common.ts` (modified)
- 6 existing spell files (appended registerSpell)

## Verification
- `pnpm tsc --noEmit`: clean (no src/ errors)
- `spell-registry.test.ts`: 4/4 tests pass
