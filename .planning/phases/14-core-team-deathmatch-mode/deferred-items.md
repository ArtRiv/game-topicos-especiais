# Phase 14 — Deferred Items

Out-of-scope discoveries logged during execution (not caused by this phase's changes).

## Pre-existing frontend test failures (not caused by Plan 01)

Discovered while running `pnpm test` after Plan 01 (which only touched `src/common/event-bus.ts` and `src/networking/network-manager.ts` on the frontend). These failures are unrelated to TDM protocol/bus work:

- `src/game-objects/spells/thunder-strike.test.ts` — 5 failing (element/spellId/spellType/baseDamage/isDamageActive assertions).
- `src/game-objects/spells/spell-registry.test.ts` — `SPELL_CONFIG` entries report `manaCost`/`cooldown` as `undefined`.
- Stale `dist/**/*.test.js` compiled copies are also being collected by vitest and double-counting failures.

Root cause appears to be in the spell config / SPELL_CONFIG shape and a stale `dist/` build being picked up by the test runner — neither is in Plan 01's scope. Left untouched.

## Pre-existing environmental build/typecheck noise (not project source)

`pnpm build` (`tsc && vite build`) fails on node_modules-level type errors only:
- `@vitest/expect` / `@vitest/utils/display`, `vitest/browser`, `rollup/parseAst` moduleResolution errors.
- `lib.dom.d.ts` TextDecoder/TextEncoder vs node:util SharedArrayBuffer incompatibility.

Per the executor's typecheck note, project-source typecheck is verified via `npx tsc 2>&1 | grep -E "^(src/|game-server/)"` (zero matches = clean). These are environmental and out of scope.
