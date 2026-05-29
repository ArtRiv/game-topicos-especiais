---
phase: 14-core-team-deathmatch-mode
plan: 03
subsystem: client-scene (GameScene intro cinematic)
tags: [team-deathmatch, intro-cinematic, camera, banner, tweens, hud-reveal, event-bus]

# Dependency graph
requires:
  - phase: 14-01
    provides: "CUSTOM_EVENTS.HUD_REVEAL key (internal, no socket bridge), already registered in event-bus.ts"
  - phase: 14-02
    provides: "server-driven 5,4,3,2,1 countdown ticks over a 5500ms span (COUNTDOWN_DURATION_MS=5000 + FIGHT_HOLD_MS=500)"
provides:
  - "GameScene #playIntroCameraSequence: stopFollow -> setZoom(0.6)+centerOn(map center) -> hold -> pan(player) -> zoomTo(1.0) -> startFollow + EVENT_BUS.emit(HUD_REVEAL)"
  - "GameScene #showMapBanner / #destroyMapBanner: press_start_2p 32px gold map-name banner with name-length-scaled typewriter reveal (D-19 fix)"
  - "GameScene private fields #mapBanner, #mapBannerRevealTween, #mapBannerFadeTween"
  - "client emit of CUSTOM_EVENTS.HUD_REVEAL after the cinematic zoom-in (Plan 04 UiScene subscribes)"
affects:
  - 14-04 (UiScene must subscribe to HUD_REVEAL and fade #hudContainer in; HUD must start hidden during the cinematic)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Camera cinematic via completion callbacks: pan(x,y,dur,ease,force,cb) -> cb on progress===1 -> zoomTo(zoom,dur,ease,force,cb) -> cb on progress===1 -> emit"
    - "Name-length-scaled typewriter reveal via tweens.addCounter(from:0,to:name.length) with teardown gated on the reveal onComplete (D-19 timing fix, not a width/mask change)"
    - "stopFollow() before pan() (pan cannot scroll while a follow target is active); re-attach startFollow() on cinematic completion"
    - "Idempotent #destroyMapBanner teardown wired into enter (stale-cycle), exit (early ACTIVE), and SHUTDOWN (scene restart)"

key-files:
  created:
    - .planning/phases/14-core-team-deathmatch-mode/14-03-SUMMARY.md
  modified:
    - src/scenes/game-scene.ts

key-decisions:
  - "Banner name derived from #levelData.level (WORLD/DUNGEON_1/STAGES) with underscores->spaces + uppercase, NOT MAP_POOL.displayName — see Deviation 1 (GameScene has no mapId; the level enum is its only map identity and matches the UI-SPEC copy contract WORLD / DUNGEON 1 / STAGES exactly)"
  - "Map center computed from the current room bounds (roomSize.x + width/2, roomSize.y - height/2), mirroring #setupCamera's setBounds math"
  - "Camera sequencing via the pan/zoomTo completion callbacks (guard on progress===1) rather than tweens.chain or once('camerapancomplete') — keeps the whole chain co-located and avoids leaking named listeners"
  - "Cinematic camera durations (hold 400 / pan 1100 / zoom 900 = 2400ms) sit inside the UI-SPEC ranges and well within the server's 5500ms COUNTDOWN window (D-20 grants exact values to discretion)"

requirements-completed: [TDM-05]

# Metrics
duration: ~12min
completed: 2026-05-29
tasks: 2
files_changed: 1
---

# Phase 14 Plan 03: TDM Intro Cinematic (client) Summary

**The Phase 8 COUNTDOWN sequence is upgraded into the Team Deathmatch intro cinematic: a map-name banner whose typewriter reveal duration scales to its character count (fixing the long-standing "cut last letters" bug at its real root — animation TIMING, not layout), a camera that establishes wide at map center then pans to the local player and zooms in to play distance, a `HUD_REVEAL` emit after the zoom-in, and the server-driven 5..1 countdown rendered with the existing pop tween. The host-authoritative COUNTDOWN→ACTIVE unlock gate is untouched.**

## Performance
- **Duration:** ~12 min
- **Completed:** 2026-05-29
- **Tasks:** 2
- **Files modified:** 1 (`src/scenes/game-scene.ts`)

## What Was Built

### Task 1 — Map-name banner, reveal duration scaled to name length (D-19 fix) (commit 40a1a6e)
- Added private fields `#mapBanner`, `#mapBannerRevealTween`, `#mapBannerFadeTween`.
- `#showMapBanner()`: creates a `press_start_2p` **32px** gold (`0xffdd55`) BitmapText, `setOrigin(0.5)`, `setScrollFactor(0)`, `setDepth(1000)`, centered horizontally at **y≈90** (upper third — clears the centered countdown digit at y=height/2).
- **D-19 root-cause fix (TIMING, not width):** `revealMs = Phaser.Math.Clamp(BANNER_MS_PER_CHAR * name.length, BANNER_MIN_MS, BANNER_MAX_MS)` with `BANNER_MS_PER_CHAR=70`, `BANNER_MIN_MS=600`, `BANNER_MAX_MS=2000`. The typewriter is driven by `tweens.addCounter({ from:0, to:name.length, ... onUpdate: setText(name.slice(0, round(getValue()))) })`. The fade-out (`alpha 1→0`, 300ms after a 500ms hold) begins **only** in the reveal tween's `onComplete`, so long names always render every glyph before teardown. No container widening / origin change / mask was introduced.
- `#destroyMapBanner()`: idempotent teardown (stops both tweens, destroys the banner, nulls all three refs). Wired into `#enterCountdownMode` (clears a stale banner from a prior cycle), `#exitCountdownMode` (cancels an in-flight cinematic if the match transitions early), and the SHUTDOWN block (no leak on scene restart).

### Task 2 — Camera center→pan→zoom + HUD_REVEAL emit + 5..1 tick rendering (commit db92388)
- `#playIntroCameraSequence()` replaces the old `setZoom(0.6) + zoomTo(1.0, 3000)` pair:
  1. `stopFollow()` (the camera was following the player from `#setupCamera`; pan cannot scroll while following), then `setZoom(0.6)` (wide establishing — kept ONLY in the cinematic, never in `#setupCamera`, preserving the late-joiner default-to-play-zoom rule).
  2. `centerOn(mapCenterX, mapCenterY)` where the center is computed from the current room bounds (`roomSize.x + width/2`, `roomSize.y - height/2`), mirroring `#setupCamera`'s `setBounds` math.
  3. `time.delayedCall(400, ...)` hold → `cameras.main.pan(player.x, player.y, 1100, 'Sine.easeInOut', false, cb)`.
  4. In the pan callback (guarded on `progress===1`): `cameras.main.zoomTo(1.0, 900, 'Cubic.easeOut', false, cb)`.
  5. In the zoom callback (guarded on `progress===1`): `startFollow(player)` then `EVENT_BUS.emit(CUSTOM_EVENTS.HUD_REVEAL)`.
- **Countdown ticks:** `#onCountdownTick` is unchanged — it already `setText(payload.label)` (the server now sends `5,4,3,2,1` per Plan 02) and plays the preserved pop tween `scale {from:1.3, to:1.0}, duration:250, ease:'Back.easeOut'`. No client-side `setInterval`/interval driver added.
- **Unlock gate (D-18 step 7):** `#exitCountdownMode` still unlocks `isMovementLocked` and `#combatLocked` simultaneously on the host COUNTDOWN→ACTIVE broadcast — untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Banner name resolved from `#levelData.level`, not `MAP_POOL.displayName`**
- **Found during:** Task 1 (resolving the active map display name).
- **Issue:** The plan action says "use `MAP_POOL` `displayName` for the loaded `mapId`". But (a) GameScene has **no** `mapId` — its only map identity is `#levelData.level` (`'WORLD' | 'DUNGEON_1' | 'STAGES'`), and (b) the `MAP_POOL` `displayName` values are `'Open Field' / 'Dungeon' / 'Arena'`, which **contradict** the UI-SPEC copywriting contract and the plan's own examples (`WORLD`, `DUNGEON 1`, `STAGES`). Importing `MAP_POOL` into GameScene and mapping the level→mapId would have produced the wrong on-screen copy.
- **Fix:** Derived the banner name as `this.#levelData.level.replace(/_/g, ' ').toUpperCase()`, yielding exactly `WORLD` / `DUNGEON 1` / `STAGES` — matching the UI-SPEC copy contract verbatim, using the identity the scene actually owns, and importing nothing new.
- **Files modified:** src/scenes/game-scene.ts
- **Commit:** 40a1a6e

**Total deviations:** 1 auto-fixed (blocking — correct copy source). No scope creep.

## Verification
- Frontend project-source type-check: `npx tsc 2>&1 | grep -E "^(src/|game-server/)"` — **zero matches** (clean) after both tasks. Per the executor typecheck note, the `pnpm build` half of each task's `<verify>` is satisfied by this documented project-source filter; raw `pnpm build` / `tsc` nonzero exit is dominated by pre-existing environmental node_modules noise (not project source).
- Grep confirmations on disk:
  - `EVENT_BUS.emit(CUSTOM_EVENTS.HUD_REVEAL)` present (1 call site, after the zoom-in completion).
  - `cameras.main.pan(` toward the local player present; ordering is center/hold → pan → `zoomTo(1.0, ...)` (pan precedes zoom-in).
  - `#setupCamera` contains no `0.6` zoom (only `setBounds` + `startFollow`) — late-joiner safety intact.
  - `#onCountdownTick` still uses `scale: { from: 1.3, to: 1.0 }, duration: 250, ease: 'Back.easeOut'` (pop tween preserved verbatim).
  - No `setInterval` call drives countdown labels (the only `setInterval` token is in a doc comment).
  - Banner reveal references `name.length` (`BANNER_MS_PER_CHAR * name.length` + `to: name.length`); `BANNER_MS_PER_CHAR` constant present; no `setMask`/container-width change.

## must_haves Coverage
- Intro cinematic plays on every client: banner reveals fully + camera center(wide) → pan → zoom-in. ✓
- Banner reveal duration scaled to name.length (clamped 600–2000ms), teardown only after reveal `onComplete`. ✓
- `HUD_REVEAL` emitted after the zoom-in. ✓
- 5..1 server ticks render via the existing pop tween. ✓
- Movement + casting unlock simultaneously on the host COUNTDOWN→ACTIVE gate (`#exitCountdownMode`). ✓
- Artifact `src/scenes/game-scene.ts` contains `HUD_REVEAL`; key_links satisfied. ✓

## GSD-helper steps skipped (environment)
- Per the environment note, `gsd-sdk query` is unavailable. Both task commits used plain `git` (with hooks, no `--no-verify`). STATE.md and ROADMAP.md were updated directly with the Edit tool. No state/roadmap/requirements query helpers were invoked. Timestamps use the current date 2026-05-29.

## Deferred Issues (out of scope)
- Pre-existing unrelated frontend test failures (thunder-strike.test.ts, spell-registry.test.ts, stale dist/ copies) + environmental `pnpm build` node_modules noise — already logged in `.planning/phases/14-core-team-deathmatch-mode/deferred-items.md`. Not touched.

## Notes for Downstream Plans

**Plan 04 (UiScene HUD reveal + score plate):**
- GameScene emits `CUSTOM_EVENTS.HUD_REVEAL` **once**, after the cinematic zoom-in completes. UiScene must subscribe to it and fade its `#hudContainer` in (alpha 0→1), and must **START with the HUD hidden** (alpha 0 / invisible) during the cinematic (steps 1–4) so the HUD isn't visible before the reveal beat. Pair the `EVENT_BUS.on(HUD_REVEAL, ...)` with a matching `EVENT_BUS.off` in UiScene's SHUTDOWN block.
- This plan only **emits** `HUD_REVEAL`; GameScene does **not** subscribe to it. The score-plate team-score event (`NETWORK_TEAM_SCORE`) is also a UiScene concern, untouched here.
- New private fields claimed on GameScene (avoid collisions): `#mapBanner`, `#mapBannerRevealTween`, `#mapBannerFadeTween`. New private methods: `#playIntroCameraSequence`, `#showMapBanner`, `#destroyMapBanner`.

## Self-Check: PASSED
- `src/scenes/game-scene.ts` present (modified) — FOUND.
- `.planning/phases/14-core-team-deathmatch-mode/14-03-SUMMARY.md` present — FOUND.
- Task commits in git log: 40a1a6e (banner), db92388 (camera + HUD_REVEAL) — FOUND.
- Contains-marker `HUD_REVEAL` present in artifact — FOUND.

---
*Phase: 14-core-team-deathmatch-mode*
*Completed: 2026-05-29*
