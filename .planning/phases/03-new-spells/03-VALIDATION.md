---
phase: 3
slug: new-spells
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test run --reporter=verbose` |
| **Full suite command** | `pnpm test run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test run --reporter=verbose`
- **After every plan wave:** Run `pnpm test run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | SPL-05 | unit | `pnpm test run spell-registry` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | SPL-05 | unit | `pnpm test run spell-casting-component` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | SPL-05 | static | `pnpm tsc --noEmit` | ✅ | ⬜ pending |
| 03-02-01 | 02 | 2 | SPL-01 | unit | `pnpm test run ice-shard` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | SPL-04 | static | `pnpm tsc --noEmit` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | SPL-02 | unit | `pnpm test run wind-bolt` | ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 2 | SPL-04 | static | `pnpm tsc --noEmit` | ✅ | ⬜ pending |
| 03-04-01 | 04 | 2 | SPL-03 | unit | `pnpm test run thunder-strike` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 2 | SPL-04 | static | `pnpm tsc --noEmit` | ✅ | ⬜ pending |
| 03-05-01 | 05 | 3 | PVP-01 | unit | `pnpm test run spell-casting-component` | ❌ W0 | ⬜ pending |
| 03-05-02 | 05 | 3 | PVP-01 | unit | `pnpm test run network-manager` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/game-objects/spells/spell-registry.test.ts` — stubs for SPL-05 (registry completeness + open/closed property)
- [ ] `src/components/game-object/spell-casting-component.test.ts` — stubs for SPL-05 (castSpell dispatches correct factory) + PVP-01 (no element restriction)
- [ ] `src/game-objects/spells/ice-shard.test.ts` — stubs for SPL-01 + SPL-04
- [ ] `src/game-objects/spells/wind-bolt.test.ts` — stubs for SPL-02 + SPL-04
- [ ] `src/game-objects/spells/thunder-strike.test.ts` — stubs for SPL-03 + SPL-04

---

## Test Module Targets

### `spell-registry.test.ts`
- All 6 elements have non-null slot 0 entries in `SPELL_SLOT_REGISTRY`
- Every SpellId in `SPELL_SLOT_REGISTRY` has a corresponding entry in `SPELL_FACTORY_REGISTRY`
- Every SpellId in `SPELL_SLOT_REGISTRY` has a corresponding entry in `SPELL_CONFIG`
- `SPELL_FACTORY_REGISTRY` functions return objects with `gameObject`, `element`, `spellId`, `spellType`

### `spell-casting-component.test.ts`
- `castSpell(0)` creates correct spell for each of 6 elements (spy on factory)
- `castSpell()` returns `undefined` when mana insufficient
- `castSpell()` returns `undefined` when on cooldown
- Cooldown is tracked per-slot, not globally
- No if/else on element in component body (structural test — component imports only registry)

### `ice-shard.test.ts`
- `IceShard.element === ELEMENT.ICE`
- `IceShard.spellId === SPELL_ID.ICE_SHARD`
- `IceShard.spellType === SPELL_TYPE.PROJECTILE`
- Damage value equals `RUNTIME_CONFIG.ICE_SHARD_DAMAGE` (no hardcoded literal)

### `wind-bolt.test.ts`
- `WindBolt.element === ELEMENT.WIND`
- `WindBolt.spellId === SPELL_ID.WIND_BOLT`
- `WindBolt.spellType === SPELL_TYPE.PROJECTILE`
- Damage value equals `RUNTIME_CONFIG.WIND_BOLT_DAMAGE`

### `thunder-strike.test.ts`
- `ThunderStrike.element === ELEMENT.THUNDER`
- `ThunderStrike.spellId === SPELL_ID.THUNDER_STRIKE`
- `ThunderStrike.spellType === SPELL_TYPE.AREA`
- Damage value equals `RUNTIME_CONFIG.THUNDER_STRIKE_DAMAGE`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| IceShard projectile renders and travels towards cursor | SPL-01 | Requires browser + Phaser running | Cast ice shard, confirm animation + movement direction |
| WindBolt renders and travels at correct speed | SPL-02 | Requires browser + Phaser running | Cast wind bolt, confirm faster than fire bolt visually |
| ThunderStrike ground strike appears at cursor position | SPL-03 | Requires browser + Phaser running | Cast thunder strike at map center cursor position |
| Impact animations play on wall collision (Ice/Wind) | SPL-01/02 | Requires browser + collision detection | Fire each projectile at a wall tile |
| Remote player casting a spell renders on local client | PVP-01 | Requires two connected clients | Have remote player cast each new spell; verify visual on local |
| All 6 elements are selectable via radial menu | SPL-01–03 | Requires browser UI | Open radial menu, cycle through all 6 elements |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
