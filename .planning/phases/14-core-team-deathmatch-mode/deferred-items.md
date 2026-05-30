# Phase 14 — Deferred Items

Out-of-scope discoveries logged during execution (not caused by this phase's changes).

## Pre-existing frontend test failures (not caused by Plan 01)

Discovered while running `pnpm test` after Plan 01 (which only touched `src/common/event-bus.ts` and `src/networking/network-manager.ts` on the frontend). These failures are unrelated to TDM protocol/bus work:

- `src/game-objects/spells/thunder-strike.test.ts` — 5 failing (element/spellId/spellType/baseDamage/isDamageActive assertions).
- `src/game-objects/spells/spell-registry.test.ts` — `SPELL_CONFIG` entries report `manaCost`/`cooldown` as `undefined`.
- Stale `dist/**/*.test.js` compiled copies are also being collected by vitest and double-counting failures.

Root cause appears to be in the spell config / SPELL_CONFIG shape and a stale `dist/` build being picked up by the test runner — neither is in Plan 01's scope. Left untouched.

## Flaky networking timing tests (discovered during the round-2 playtest fixes, 2026-05-29)

`src/networking/__tests__/mesh-formation.test.ts`, `throughput.test.ts`, and `throughput-hz.test.ts`
fail INTERMITTENTLY — the full-suite failure count varied 15 → 13 → 10 across back-to-back `pnpm test`
runs with NO source change between them. The non-deterministic failure is typically an unsettled
`pendingIceBuffer` / mesh-not-healthy assertion, i.e. an ICE-timing race in the fake-RTC stack rather
than a logic bug. They are NOT a reliable signal; the stable baseline is the thunder-strike (×{src,dist})
+ spell-registry config failures above. The Phase-14 round-2 host-offer stagger (`a0634b5`) was verified
across three consecutive runs that all came back to JUST the stable baseline (networking green), so the
stagger does not worsen — and may slightly reduce — this flakiness. Deflake (await mesh-health instead
of fixed sleeps / isolate the fake-RTC ICE scheduler) is out of scope for the playtest bugfix pass.

## Pre-existing environmental build/typecheck noise (not project source)

`pnpm build` (`tsc && vite build`) fails on node_modules-level type errors only:
- `@vitest/expect` / `@vitest/utils/display`, `vitest/browser`, `rollup/parseAst` moduleResolution errors.
- `lib.dom.d.ts` TextDecoder/TextEncoder vs node:util SharedArrayBuffer incompatibility.

Per the executor's typecheck note, project-source typecheck is verified via `npx tsc 2>&1 | grep -E "^(src/|game-server/)"` (zero matches = clean). These are environmental and out of scope.
