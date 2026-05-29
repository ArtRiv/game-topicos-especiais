---
phase: 14-core-team-deathmatch-mode
plan: 04
subsystem: client-scene (UiScene HUD + GameScene respawn cue + TDM results scene)
tags: [team-deathmatch, hud, score-plate, hud-reveal, respawn-invuln, results-scene, tweens, event-bus]

# Dependency graph
requires:
  - phase: 14-01
    provides: "CUSTOM_EVENTS.NETWORK_TEAM_SCORE / NETWORK_MATCH_ENDED (socket-bridged) + HUD_REVEAL (internal); TeamScorePayload / MatchEndedPayload / TdmPlayerStat protocol types"
  - phase: 14-02
    provides: "RESPAWN_INVULN_MAX_MS (=2500) in RUNTIME_CONFIG for sizing the client invuln blink; server #invulnUntil is the sole damage authority (D-14)"
  - phase: 14-03
    provides: "GameScene EMITS CUSTOM_EVENTS.HUD_REVEAL once after the intro zoom-in (does not subscribe); HUD must start hidden during the cinematic"
provides:
  - "ui-scene.ts: exported TEAM_COLORS = [0x44aaff, 0xff5533] (single source of truth for team tints)"
  - "ui-scene.ts: top-center [A] n - m [B] score plate (3 per-tinted BitmapText pieces #scoreTextA/#scoreDash/#scoreTextB) inside #hudContainer + NETWORK_TEAM_SCORE pop tween + digit-growth re-center"
  - "ui-scene.ts: element/radial affordance (#elementGem/#elementLabel/#elementHintText + carousel panel/icons) MOVED into #hudContainer so HUD_REVEAL covers it (D-18 step 5)"
  - "ui-scene.ts: #hudContainer starts alpha 0, HUD_REVEAL fades it in (280ms Quad.easeOut) + 6s late-joiner fallback reveal"
  - "game-scene.ts: respawn invuln alpha-pulse on local player (#invulnPulseTween/#invulnUntil/#startInvulnBlink/#stopInvulnBlink/#updateInvulnBlinkCancel) cancelling on move/cast/timeout"
  - "game-scene.ts: #onMatchEnded launches the TDM results overlay on NETWORK_MATCH_ENDED + pauses GameScene/UiScene"
  - "tdm-results-scene.ts (NEW): winner line + K/D table + MVP highlight + RETURN TO LOBBY; reads MatchEndedPayload via SCENE DATA"
  - "scene-keys.ts: TDM_RESULTS_SCENE; main.ts: TdmResultsScene registered"
affects:
  - 15 (Special-Spell Pickups — same UiScene HUD + GameScene match-end conventions)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-piece-tinted score plate: 3 separate BitmapText pieces (setOrigin(0,0.5)) laid out + re-centered as one unit on digit growth — BitmapText has no per-range tint in this code path, so separate objects carry each team tint"
    - "Single-alpha HUD reveal: ALL HUD (bars + score plate + element/radial affordance) parented into #hudContainer so one alpha tween reveals the whole HUD on HUD_REVEAL (D-18 step 5)"
    - "Cosmetic-only client invuln blink: #invulnUntil is a client mirror for cancel logic; server #invulnUntil stays the damage authority (D-14) — client never reports invuln upstream; also mirrors onto Player.iFrameUntil for the local i-frame gate"
    - "Cheap per-frame cancel guard: #invulnUntil > 0 short-circuits the move/timeout checks so the common (not-invuln) case is a single comparison"
    - "Results overlay via scene.launch + pause(GameScene)+pause(UiScene): payload passed as scene data (no bus subscription in the results scene); dup-guarded against a re-delivered match:ended"

key-files:
  created:
    - src/scenes/tdm-results-scene.ts
    - .planning/phases/14-core-team-deathmatch-mode/14-04-SUMMARY.md
  modified:
    - src/scenes/ui-scene.ts
    - src/scenes/game-scene.ts
    - src/scenes/scene-keys.ts
    - src/main.ts

key-decisions:
  - "TEAM_COLORS hoisted into ui-scene.ts and EXPORTED (consumed by tdm-results-scene.ts). The lobby keeps its own 0x44aaff/0xff5533 literal for now (a comment there is enough) — touching lobby-scene.ts was explicitly out of scope to avoid risking the lobby in this plan."
  - "Cast cancel hooked into #onLocalSpellCast (the single local-cast funnel) rather than each cast call site — this automatically covers dash too (dash routes through SPELL_CAST). Placed before the connectivity early-return so an offline/solo cast still cancels the pulse."
  - "Results scene receives its payload via SCENE DATA (this.scene.launch(KEY, payload) -> create(data)), NOT a NETWORK_MATCH_ENDED subscription. GameScene owns the single bus subscription and forwards the payload, so the results scene needs no EVENT_BUS on/off."
  - "RETURN TO LOBBY does a full window.location.reload() — the established full-reset navigation in this codebase (game-over Quit path). It tears down the WebRTC mesh + all stale match/network singletons cleanly and re-enters the splash->menu->lobby connect flow, the only safe way to start a fresh lobby/rematch after a match ends (LobbyScene.create starts from #showConnectView and would otherwise inherit a stale mesh)."
  - "MVP tag rendered as '* MVP' (asterisk) rather than a Unicode star glyph — the press_start_2p BitmapText atlas is ASCII; a literal star would render as a missing glyph."

requirements-completed: [TDM-06, TDM-04, TDM-03]

# Metrics
duration: ~30min
completed: 2026-05-29
tasks: 3
files_changed: 5
---

# Phase 14 Plan 04: Client TDM HUD + Respawn Invuln Cue + Results Scene Summary

**The remaining Team Deathmatch client UI: a top-center per-team-colored `[A] n - m [B]` score plate that pops the changed number on each broadcast and lives (with the whole HUD) in `#hudContainer` so the cinematic's HUD_REVEAL beat fades in the bars AND the radial-menu/element affordance together (D-18 step 5); a sustained respawn-invulnerability alpha-pulse on the local player that cancels the instant they move, cast, or hit the ~2.5s cap; and a minimal results overlay on match ENDED with a team-colored winner line, a per-player K/D table, an MVP highlight, and a working RETURN TO LOBBY button.**

## Performance
- **Duration:** ~30 min
- **Completed:** 2026-05-29
- **Tasks:** 3
- **Files changed:** 5 (1 created)

## What Was Built

### Task 1 — Team-score HUD plate + HUD_REVEAL fade-in + TEAM_COLORS (commit e97284b)
- Hoisted `export const TEAM_COLORS = [0x44aaff, 0xff5533] as const;` in `ui-scene.ts` (the lobby player-row BADGE tints, NOT the toggle fills) as the single source of truth; the lobby keeps its own literal with a comment (out of scope to change).
- Built the score plate from THREE separate per-tinted `press_start_2p` 16px BitmapText pieces — `#scoreTextA` (`[A] n`, tint TEAM_COLORS[0]), `#scoreDash` (`-`, white), `#scoreTextB` (`m [B]`, tint TEAM_COLORS[1]) — anchored around center-X 240, y≈10 (top-center band, clear of the mana bar and hearts). `#layoutScorePlate()` centers the group as one unit and re-centers on digit growth.
- `#onTeamScore` (NETWORK_TEAM_SCORE): `setText` both numbers, re-center, and pop ONLY `payload.lastScoringTeam`'s number with the countdown-tick shape (`scale {from:1.3,to:1.0}, 250ms, Back.easeOut`).
- **D-18 step 5:** moved `#elementGem` + `#elementLabel` + `#elementHintText` AND the carousel panel + icons into `#hudContainer` (they were added straight to the scene before), so the single HUD alpha reveals the radial/element affordance with the bars. `#updateElementIndicator` still works (only the parent changed).
- `#hudContainer` starts `setAlpha(0)`; `#onHudReveal` (HUD_REVEAL) fades it to 1 (280ms Quad.easeOut), guarded against a double-fade. Added a 6s late-joiner fallback in `update()` so a client that misses the cinematic still reveals the HUD.
- Paired every new `EVENT_BUS.on` (NETWORK_TEAM_SCORE, HUD_REVEAL) with a matching SHUTDOWN `off`.

### Task 2 — Respawn invuln alpha-pulse + cancel on move/cast/timeout (commit 89cd368)
- Added `#invulnPulseTween` + `#invulnUntil` fields (client-side mirror for the cancel logic; server is authority per D-14).
- `#startInvulnBlink()` in the local branch of `#onRespawn` (after `#clearLocalDeath` tears down the death overlay): `#invulnUntil = time.now + RUNTIME_CONFIG.RESPAWN_INVULN_MAX_MS`, mirror onto `Player.iFrameUntil`, `setAlpha(1)`, then a looping pulse `alpha {from:1.0,to:0.35}, duration:150, yoyo:true, repeat:-1` (sustained/slow — reads as "protected" vs the brief one-shot hurt blink).
- `#stopInvulnBlink()`: stop+null the tween, hard `setAlpha(1)`, zero `#invulnUntil` (idempotent).
- Cancel hooks: **cast** in `#onLocalSpellCast` (single funnel, also covers dash); **move + timeout** in `#updateInvulnBlinkCancel()` (called from `update()`) — move = any non-zero WASD this frame, timeout = `time.now >= #invulnUntil`. All guarded on `#invulnUntil > 0` first.
- SHUTDOWN calls `#stopInvulnBlink()` so the looping tween never leaks across scene restarts.

### Task 3 — Minimal TDM results scene + registration + launch (commit 8469103)
- Added `TDM_RESULTS_SCENE` to `scene-keys.ts`; imported + registered `TdmResultsScene` in `main.ts` next to `GAME_OVER_SCENE`.
- New `src/scenes/tdm-results-scene.ts`: full-screen scrim (`0x000000 @0.7`, 200ms fade-in), 32px winner line tinted `TEAM_COLORS[winningTeam]` (`TEAM A/B WINS`; gold `DRAW` if null), 8px `PLAYER / K / D` header, per-player 8px rows sorted team-then-kills-desc and tinted by each player's team, MVP highlight (gold `* MVP` tag + thin gold underline rect on the `mvpPlayerId` row), and a `RETURN TO LOBBY` 16px button copying the main-menu hover pattern verbatim (scale 1.05 / 100ms Quad.Out / gold tint). Reads `MatchEndedPayload` via scene data with a defensive `#normalizePayload` (missing fields → 0 / neutral tint, empty roster still renders — never errors, UI-SPEC error state).
- `GameScene` now subscribes to `NETWORK_MATCH_ENDED` → `#onMatchEnded`: stop any in-flight invuln pulse, `scene.launch(TDM_RESULTS_SCENE, payload)` + `bringToTop`, then `pause()` GameScene and `pause(UI_SCENE)` to freeze the world under the overlay. Dup-guarded against a re-delivered `match:ended`; paired SHUTDOWN `off`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Late-joiner HUD-reveal fallback**
- **Found during:** Task 1.
- **Issue:** If a client never receives HUD_REVEAL (no cinematic ran — e.g. a late joiner that missed COUNTDOWN), `#hudContainer` would stay at alpha 0 forever, leaving the player with no HUD.
- **Fix:** Added a guarded fallback in `UiScene.update()` — after ~6s of scene life with the HUD still hidden, defensively reveal it. 6s comfortably exceeds the server's 5500ms COUNTDOWN span, so a normal client always reveals via the cinematic first. The plan's action step 5 explicitly called for a defensive reveal; this implements it.
- **Files modified:** src/scenes/ui-scene.ts
- **Commit:** e97284b

**2. [Rule 1 - Bug] MVP star glyph → ASCII '* MVP'**
- **Found during:** Task 3.
- **Issue:** The UI-SPEC layout shows a `★` (Unicode star) MVP prefix, but the `press_start_2p` BitmapText atlas is ASCII-only — a literal star would render as a missing/blank glyph.
- **Fix:** Rendered the MVP tag as `* MVP` (asterisk) plus the gold underline rect, preserving the gold highlight intent within the atlas's character set.
- **Files modified:** src/scenes/tdm-results-scene.ts
- **Commit:** 8469103

**Total deviations:** 2 auto-fixed (1 missing-functionality fallback, 1 glyph bug). No scope creep.

## Verification
- Frontend project-source type-check: `npx tsc 2>&1 | grep -E "^(src/|game-server/)"` — **zero matches** (clean) after each task. Per the executor typecheck note, this documented project-source filter satisfies the `pnpm build` half of each `<verify>`; raw `pnpm build` exit is dominated by pre-existing environmental node_modules noise (out of scope).
- Contains-markers verified on disk: `NETWORK_TEAM_SCORE` ×2 in ui-scene.ts; `RESPAWN_INVULN_MAX_MS` in game-scene.ts; `RETURN TO LOBBY` ×3 in tdm-results-scene.ts; `TDM_RESULTS_SCENE` in scene-keys.ts; `TdmResultsScene` ×2 in main.ts.
- `#stopInvulnBlink()` call sites confirmed: cast (`#onLocalSpellCast`), move+timeout (`#updateInvulnBlinkCancel`), match-end (`#onMatchEnded`), start defensive clear (`#startInvulnBlink`), SHUTDOWN — ≥3 cancel sites + SHUTDOWN as required.
- Score-pop tween shape confirmed: `scale: { from: 1.3, to: 1.0 }, duration: 250, ease: 'Back.easeOut'`. `#hudContainer` starts alpha 0 and fades to 1 on HUD_REVEAL.

## must_haves Coverage
- Top-center `[A] n - m [B]` plate, each team's score tinted its lobby team color. ✓
- Changed number pops with the countdown-tick tween shape on every broadcast. ✓
- HUD (score plate AND radial-menu/element affordance) starts hidden during the cinematic and fades in on HUD_REVEAL. ✓
- Respawned local player alpha-pulses while invulnerable; pulse stops on first move / first cast / max-duration cap. ✓
- Match-ENDED results screen: winning team + per-player K/D table + MVP highlight + working RETURN TO LOBBY. ✓
- Artifact markers present (see Verification). ✓

## Known Stubs
None. The score plate is wired to live NETWORK_TEAM_SCORE data, the invuln pulse to the real respawn flow, and the results scene to the real MatchEndedPayload. The results scene's `#normalizePayload` defaults are defensive fallbacks (UI-SPEC error state), not stubs.

## GSD-helper steps skipped (environment)
- Per the environment note, `gsd-sdk query` is unavailable. All three task commits used plain `git` (with hooks, no `--no-verify`). STATE.md and ROADMAP.md were updated directly with the Edit tool. No state/roadmap/requirements query helpers were invoked. Timestamps use the current date 2026-05-29.

## Deferred Issues (out of scope)
- Pre-existing unrelated frontend test failures (thunder-strike.test.ts, spell-registry.test.ts, stale dist/ copies) + environmental `pnpm build` node_modules noise — already logged in `.planning/phases/14-core-team-deathmatch-mode/deferred-items.md`. Not touched.
- A pre-existing unrelated working-copy change to `src/scenes/lobby-scene.ts` (stashed by the orchestrator) was left untouched per the environment note.

## Notes for Downstream Plans / Phase 15 (Special-Spell Pickups)
- **TEAM_COLORS** is exported from `src/scenes/ui-scene.ts` — import from there (do NOT re-hoist). Indexable by `PlayerInfo.team` (0/1).
- **Score-plate field names:** `#scoreTextA` (`[A] n`), `#scoreDash` (`-`), `#scoreTextB` (`m [B]`), score state `#teamScores`; layout via `#layoutScorePlate()`. All inside `#hudContainer`.
- **HUD reveal:** the WHOLE HUD (bars + score plate + element/radial affordance) now lives in `#hudContainer`; one alpha controls it. `#hudRevealed` guards the fade. Any NEW HUD element a future plan adds should be `this.#hudContainer.add(...)` so it reveals with the rest.
- **Invuln cue field names (GameScene):** `#invulnPulseTween`, `#invulnUntil`; methods `#startInvulnBlink`, `#stopInvulnBlink`, `#updateInvulnBlinkCancel`. The client mirror never reports invuln upstream — server `#invulnUntil` is the sole authority.
- **Results scene payload convention:** `TdmResultsScene` reads its `MatchEndedPayload` from SCENE DATA (`this.scene.launch(SCENE_KEYS.TDM_RESULTS_SCENE, payload)` → `create(data)`). GameScene owns the single `NETWORK_MATCH_ENDED` subscription and forwards the payload + freezes GameScene/UiScene. RETURN TO LOBBY = `window.location.reload()` (full mesh/state reset).

## Self-Check: PASSED
- All created/modified files present on disk: src/scenes/tdm-results-scene.ts (FOUND), src/scenes/ui-scene.ts (FOUND), src/scenes/game-scene.ts (FOUND), src/scenes/scene-keys.ts (FOUND), src/main.ts (FOUND).
- All 3 task commits present in git log: e97284b (Task 1), 89cd368 (Task 2), 8469103 (Task 3).
- Contains-markers verified (see Verification).

---
*Phase: 14-core-team-deathmatch-mode*
*Completed: 2026-05-29*
