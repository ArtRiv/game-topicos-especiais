---
phase: 14-core-team-deathmatch-mode
verified: 2026-05-29T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Two-client team-deathmatch match to the win target"
    expected: "Each enemy elimination by either teammate increments that team's shared score on BOTH clients simultaneously; reaching the target N (30, or a debug-lowered value) ends the match and every client sees the results overlay at the same time."
    why_human: "Requires a live 2-client WebRTC mesh + server; cross-client simultaneity and real score sync cannot be exercised by static code inspection or the single-process server unit tests."
  - test: "Intro cinematic feel on a real client"
    expected: "Map-name banner reveals every glyph for long names (e.g. 'DUNGEON 1') with no cut letters; camera establishes wide at map center, pans smoothly to the local player, zooms to play distance; HUD (bars + score plate + radial/element affordance) fades in together; 5-4-3-2-1 digits pop; movement + casting unlock together at the end."
    why_human: "Animation timing, banner glyph completeness, camera smoothness, and the simultaneous unlock are visual/temporal qualities only assessable by running the client."
  - test: "Respawn invulnerability visual + cancel"
    expected: "A respawned local player visibly alpha-pulses while protected; enemy spells deal no damage during the window; the pulse stops the instant the player moves, casts, or hits the ~2.5s cap (hard alpha reset to 1)."
    why_human: "The on-screen pulse and the move/cast/timeout cancel are real-time interactive behaviors; server-side hit rejection is unit-verified but the end-to-end cosmetic + gameplay feel needs a live client."
  - test: "Spawn fairness across maps"
    expected: "On match start and each respawn, players appear at sensible per-team spawnpoints far from living enemies on WORLD / DUNGEON_1 / STAGES, with no overlap/crash when a team has more players than authored spawnpoints."
    why_human: "Farthest-from-enemy selection depends on live player positions; on-map placement quality is a playtest judgement (COPY VALUES tuning loop exists for this)."
---

# Phase 14: Core Team Deathmatch Mode Verification Report

**Phase Goal:** A playable team-vs-team deathmatch. Two teams fight to a shared team kill total; the first team to N eliminations wins. Players spawn at per-map spawnpoints, respawn protected by brief invulnerability, and the match opens with a polished intro cinematic.
**Verified:** 2026-05-29
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria + PLAN must_haves)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Server tracks a shared per-team kill score; each enemy elimination by any teammate increments that team's score; reaching target N transitions ACTIVE→ENDED with a single win broadcast (SC1 / TDM-01) | ✓ VERIFIED | `game-room.ts:50,322-327` `#teamScores`+`addTeamKill` (team-guarded, FF no-op at L324); `server.ts:333-360` eliminated branch records death, attributes kill on `!isSameTeam`, emits `match:team-score`, and on `>= TDM_WIN_TARGET` snapshots stats BEFORE `transitionTo('ENDED')` then emits a single `match:ended`. `TDM_WIN_TARGET=30` (types.ts:220). Unit-proven in `game-room.test.ts:215-297`. |
| 2   | A new `'team-deathmatch'` MatchMode drives scoring/respawn without breaking `'respawn'`/`'last-standing'` (SC2 / TDM-02) | ✓ VERIFIED | `MatchMode` union extended in BOTH `game-server/src/types.ts:134` and `src/networking/types.ts:194`. TDM logic gated on `room.matchMode === 'team-deathmatch'` (server.ts:333); existing modes untouched; `scheduleRespawn` still honors `'last-standing'` (game-room.ts:280). Room is actually set at lobby:start (`server.ts:198 setMatchMode`) so branches are live, not dead code. 79/79 server tests pass. |
| 3   | Each map defines MULTIPLE spawnpoints per team in config (live-tunable, COPY VALUES); server assigns a team spawnpoint at start and each respawn, farthest-from-enemy (SC3 / TDM-03) | ✓ VERIFIED | `config/tdm.ts:8-12` SPAWNPOINTS for WORLD/DUNGEON_1/STAGES, 2 per team each; mirrored in RUNTIME_CONFIG (`runtime-config.ts:268`) + server copy (`game-room.ts:16`). Debug panel TDM section + COPY VALUES emits a SPAWNPOINTS literal (`debug-panel.ts:40-41,288-300`). `pickSpawn` (game-room.ts:186-222) picks max nearest-enemy distance, overflow/empty/unknown-map safe; wired into match-start two-pass loop (server.ts:104-110) and respawn callback (server.ts:324). |
| 4   | On respawn the player is server-tracked invulnerable; the server rejects spell:hit on protected targets; the invuln cancels on move/cast/cap (SC4 / TDM-04) | ✓ VERIFIED | Server: `#invulnUntil` + `startInvuln`/`clearInvuln` (game-room.ts:54,299-306); `validateHit` rejects hits while protected (game-room.ts:250); started on respawn (server.ts:325) and match start (server.ts:109). Client cue: alpha-pulse on local respawn (game-scene.ts:3613-3628), cancel on move+timeout (`#updateInvulnBlinkCancel` L361-377) and cast (`#onLocalSpellCast` L5029), hard alpha reset + SHUTDOWN cleanup. |
| 5   | Intro cinematic plays on every client: length-scaled banner reveal (no cut letters) → wide map-center → pan to player → zoom to play → HUD reveal → 5..1 countdown → simultaneous movement+cast unlock on host COUNTDOWN→ACTIVE (SC5 / TDM-05) | ✓ VERIFIED | Server: TICKS `5,4,3,2,1` (server.ts:62-66), `COUNTDOWN_DURATION_MS=5000` / 5500ms span (types.ts:119-122). Client: `#showMapBanner` reveal `Clamp(BANNER_MS_PER_CHAR*name.length,600,2000)`, teardown only in reveal onComplete (game-scene.ts:3871-3930, D-19 timing fix, no width/mask change); `#playIntroCameraSequence` stopFollow→setZoom(0.6)→centerOn→hold→pan→zoomTo(1.0)→startFollow+`HUD_REVEAL` (L3818-3852); `#onCountdownTick` renders labels w/ pop tween (L3792-3802); UiScene starts `#hudContainer` alpha 0 and fades on HUD_REVEAL incl. radial/element affordance (ui-scene.ts:236-267,452); unlock gate preserved in `#exitCountdownMode`. |

**Score:** 5/5 truths verified (code-level). All 5 carry live-playtest confirmation items — see Human Verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `game-server/src/types.ts` | MatchMode + TDM payloads + TDM_WIN_TARGET + COUNTDOWN_DURATION_MS=5000 + RESPAWN_INVULN_MAX_MS | ✓ VERIFIED | All present (L119,134,137,146,152,220,225); TDM_WIN_TARGET server-only. |
| `src/networking/types.ts` | mirror of MatchMode + TDM payloads (no TDM_WIN_TARGET) | ✓ VERIFIED | Identical shapes (L194-216); no TDM_WIN_TARGET (server authority). |
| `game-server/src/game-room.ts` | scoring state + methods + SPAWNPOINTS + pickSpawn + invuln + clearCombatState reset | ✓ VERIFIED | All methods present + clearCombatState resets all TDM state (L371-386). |
| `game-server/src/server.ts` | setMatchMode at lobby:start; scoring/win-check; two-pass spawn; respawn invuln; 5..1 ticks | ✓ VERIFIED | All wired (L62-66,104-110,198,316-360). Snapshot-before-transition bug avoided. |
| `src/common/event-bus.ts` | NETWORK_TEAM_SCORE, NETWORK_MATCH_ENDED, HUD_REVEAL | ✓ VERIFIED | L55-58; HUD_REVEAL marked internal (no bridge). |
| `src/networking/network-manager.ts` | bridge match:team-score + match:ended; no HUD_REVEAL bridge | ✓ VERIFIED | L554-558; HUD_REVEAL intentionally not bridged. |
| `src/common/config/tdm.ts` | SPAWNPOINTS + TDM_WIN_TARGET + RESPAWN_INVULN_MAX_MS | ✓ VERIFIED | Created; 2+ per team ×3 maps. |
| `src/common/config/index.ts` | barrel re-export | ✓ VERIFIED | `export * from './tdm'` (L24). |
| `src/common/runtime-config.ts` | RUNTIME_CONFIG mirror | ✓ VERIFIED | imports + group (L96-98,266-270). |
| `src/debug/debug-panel.ts` | TDM section + COPY VALUES SPAWNPOINTS literal | ✓ VERIFIED | L40-41,283-300. |
| `src/scenes/game-scene.ts` | cinematic + invuln pulse + results launch | ✓ VERIFIED | banner/camera/HUD_REVEAL/invuln/onMatchEnded all present. |
| `src/scenes/ui-scene.ts` | TEAM_COLORS + score plate + HUD reveal | ✓ VERIFIED | 3-piece plate in #hudContainer; HUD starts alpha 0. |
| `src/scenes/tdm-results-scene.ts` | winner + K/D table + MVP + RETURN TO LOBBY | ✓ VERIFIED | Full impl + defensive normalization (never blank/error). |
| `src/scenes/scene-keys.ts` | TDM_RESULTS_SCENE | ✓ VERIFIED | L10. |
| `src/main.ts` | TdmResultsScene registered | ✓ VERIFIED | L20 import, L116 register. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| server.ts lobby:start | GameRoom.setMatchMode(lobby.mode) | `setMatchMode((lobby.mode ?? 'team-deathmatch'))` server.ts:198 | ✓ WIRED |
| server.ts eliminated branch | addTeamKill + team-score broadcast + win-check | direct calls L334-358 | ✓ WIRED |
| server.ts win-check | transitionTo('ENDED') + match:ended | snapshot-then-transition-then-emit L347-358 | ✓ WIRED |
| network-manager | EVENT_BUS NETWORK_TEAM_SCORE / NETWORK_MATCH_ENDED | socket.on bridges L554-558 | ✓ WIRED |
| server registerPlayer loop | pickSpawn(team,mapId) | two-pass L104-110 | ✓ WIRED |
| game-room validateHit | #invulnUntil rejection | `now < invulnUntil → return false` L250 | ✓ WIRED |
| server scheduleRespawn callback | fresh pickSpawn + startInvuln | L324-325 | ✓ WIRED |
| game-scene #playIntroCameraSequence | setZoom→centerOn→pan→zoomTo→emit HUD_REVEAL | completion callbacks L3826-3851 | ✓ WIRED |
| game-scene banner | revealMs scaled to name.length | `Clamp(BANNER_MS_PER_CHAR*name.length,...)` L3901 | ✓ WIRED |
| ui-scene | NETWORK_TEAM_SCORE + HUD_REVEAL | EVENT_BUS.on + SHUTDOWN off L280-294 | ✓ WIRED |
| game-scene #onRespawn local | invuln pulse + cancel hooks | start L3593, cancels L375/L5029, timeout L364 | ✓ WIRED |
| tdm-results-scene | MatchEndedPayload → render | scene data via launch (game-scene.ts:3662) | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| ui-scene score plate | `#teamScores` | NETWORK_TEAM_SCORE ← socket `match:team-score` ← server `getTeamScores()` (real `#teamScores` mutated by addTeamKill) | Yes | ✓ FLOWING |
| tdm-results-scene | `data` (MatchEndedPayload) | scene.launch payload ← NETWORK_MATCH_ENDED ← server `getMatchStats()`/`getMvpPlayerId()` (real per-player tallies) | Yes | ✓ FLOWING |
| game-scene invuln pulse | `#invulnUntil` | `time.now + RUNTIME_CONFIG.RESPAWN_INVULN_MAX_MS` on real `#onRespawn` | Yes | ✓ FLOWING |
| game-scene banner | map name | `#levelData.level` (real loaded map identity) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| game-server type-check | `npx tsc --noEmit` (game-server) | exit 0 | ✓ PASS |
| game-server test suite (incl. TDM scoring) | `npm test` (game-server) | 4 files, 79/79 passing | ✓ PASS |
| frontend project-source type-check | `npx tsc 2>&1 \| grep -E "^(src/\|game-server/)"` | zero matches (baseline clean) | ✓ PASS |
| TDM scoring proven against explicit mode | inspect `game-room.test.ts:230-297` | tests call `setMatchMode('team-deathmatch')` before asserting; cover FF/no-team no-op, MVP, reset | ✓ PASS |

### Requirements Coverage

TDM-01..TDM-06 are phase-local requirement IDs (drafted in discuss-phase; per the environment note they are NOT rows in REQUIREMENTS.md and their absence there is expected, not a gap). Traceability is via plan frontmatter `requirements:` + must_haves.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TDM-01 | 14-01 | shared per-team scoring + win condition + ENDED-with-stats | ✓ SATISFIED | Truth 1 |
| TDM-02 | 14-01 | 'team-deathmatch' MatchMode without breaking existing modes | ✓ SATISFIED | Truth 2 |
| TDM-03 | 14-02 / 14-04 | per-map multi-spawnpoints (tunable) + farthest-from-enemy assignment | ✓ SATISFIED | Truth 3 |
| TDM-04 | 14-02 / 14-04 | respawn invuln (server-authoritative) + client cue cancel on move/cast | ✓ SATISFIED | Truth 4 |
| TDM-05 | 14-02 / 14-03 | intro cinematic (server 5..1 + client banner/camera/HUD/unlock) | ✓ SATISFIED | Truth 5 |
| TDM-06 | 14-04 | team-score HUD plate + results screen (winner/K-D/MVP/return) | ✓ SATISFIED | ui-scene plate + tdm-results-scene |

No orphaned requirements.

### Anti-Patterns Found

None blocking. Notable benign items:
- `GameRoom.getSpawnPoint` kept though `server.ts` no longer calls it (documented out-of-scope; harmless public accessor) — ℹ️ Info.
- Defensive empty fallbacks in `tdm-results-scene.#normalizePayload` and `pickSpawn` `{100,100}` guard are intentional error-state handling, NOT stubs (each has a real primary data path). — ℹ️ Info.
- Client `#invulnUntil` mirror is cosmetic-only by design; server `#invulnUntil` is the sole damage authority (D-14) — correct trust boundary, not a stub.

### Human Verification Required

This is a multiplayer + visual phase. All wiring is correct and unit-tested at the code level (5/5 truths VERIFIED), but four behaviors can only be confirmed on a live 2-client session — see the `human_verification` frontmatter:

1. **Two-client match to win target** — cross-client score sync + simultaneous ENDED/results.
2. **Intro cinematic feel** — banner glyph completeness, camera smoothness, HUD reveal, 5..1, simultaneous unlock.
3. **Respawn invulnerability** — visible pulse, no-damage window, cancel on move/cast/cap.
4. **Spawn fairness across maps** — sensible farthest-from-enemy placement, no overlap/crash on overflow.

### Gaps Summary

No code-level gaps. Server-authoritative scoring, win condition, MatchMode gating, per-map spawnpoints with farthest-from-enemy assignment, server + client respawn invulnerability, the length-scaled intro cinematic, the team-score HUD plate, and the results screen are all present, substantively implemented, wired end-to-end, and fed by real data. game-server type-check and the 79-test suite (including explicit team-deathmatch scoring tests) pass; the frontend project-source type-check is clean at baseline. The only outstanding work is human playtest confirmation of the live multiplayer + visual behaviors, which is the appropriate verification mode for this phase rather than a code gap.

---

_Verified: 2026-05-29_
_Verifier: Claude (gsd-verifier)_
