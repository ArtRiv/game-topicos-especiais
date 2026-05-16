---
phase: 8
slug: countdown-state
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.x (game-server) |
| **Config file** | `game-server/vitest.config.ts` |
| **Quick run command** | `cd game-server && npx vitest run src/game-room.test.ts` |
| **Full suite command** | `cd game-server && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

Client-side (browser-rendered scenes, camera, input) is exercised via a manual two-window UAT — automated coverage on the Phaser side is intentionally out of scope for this milestone.

---

## Sampling Rate

- **After every task commit:** Run the quick command (game-room.test.ts only) — under 1s
- **After every plan wave:** Run the full suite — 31+ tests, under 5s
- **Before `/gsd:verify-work`:** Full suite must be green AND manual two-window smoke test must pass
- **Max feedback latency:** ~5 seconds (server side); manual UAT for client side

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | LFC-01 (FSM table) | — | Countdown ticks only valid when room is in COUNTDOWN; throws on misuse | unit | `npx vitest run src/game-room.test.ts -t countdown-tick` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 1 | LFC-08 (overlay sync) | T-08-01 (timer leak on disconnect) | Countdown interval cleared when room is removed mid-countdown | unit | `npx vitest run src/game-room.test.ts -t countdown-cleanup` | ❌ W0 | ⬜ pending |
| 8-01-03 | 01 | 1 | CR-02 fix (idempotency) | T-08-02 (double-start) | Repeated lobby:start is a no-op when room already past LOBBY | unit | `npx vitest run src/game-room.test.ts -t lobby-start-idempotent` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 2 | LFC-06 (input lock) | — | Movement + spell input ignored while client matchState != ACTIVE | manual | two-window UAT (no keys move player during 3-2-1) | — | ⬜ pending |
| 8-02-02 | 02 | 2 | LFC-07 (camera zoom) | — | Camera zoom tween from start zoom → 1.0 over ~3s on COUNTDOWN | manual | two-window UAT (visual confirm zoom-in) | — | ⬜ pending |
| 8-02-03 | 02 | 2 | LFC-08 (overlay) | — | 3→2→1→FIGHT! overlay renders per server tick, dismisses on ACTIVE | manual | two-window UAT (overlay text + timing) | — | ⬜ pending |
| 8-02-04 | 02 | 2 | LFC-09 (sync unlock) | — | Both tabs accept input at the same instant when ACTIVE arrives | manual | two-window UAT (press at countdown end on both tabs) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Extend `game-server/src/game-room.test.ts` with countdown FSM cases (LOADING→COUNTDOWN tick cascade, ACTIVE transition timing, cleanup on removePlayer mid-countdown)
- [ ] No new test files required — vitest harness already configured in Phase 7

---

## Risks

- **Background-tab clock throttling** — same lesson as LFC-04: client tabs in background pause `requestAnimationFrame`, so server-driven tick broadcast (not client `setInterval`) is the only correct approach. Server is the clock; client just renders the broadcast it most recently received.
- **Phase 7 STUB deletion** — `server.ts:121-131` setTimeout MUST be removed when the real countdown lands, or two timers race. Verifier should grep for `Phase 7 STUB` and require zero matches.
- **FireBreath / EarthWall input-lock gap** — `isMovementLocked` is honored by `idle-state.ts:31`, `move-state.ts:18` for Spell 1/2 only; FireBreath (`game-scene.ts:209`) and EarthWall (`game-scene.ts:506`) read `controls.isSpell3Key*` directly and ignore the lock. A new `#combatLocked` GameScene flag must gate both handlers.
- **CR-02 (non-idempotent lobby:start) interaction** — Phase 7 review flagged this; with a real 3s timer in Phase 8, double-clicking Start would spawn two countdown intervals. Plan should fix idempotency in Wave 1 before adding the timer.
