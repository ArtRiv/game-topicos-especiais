# Phase 14: Core Team Deathmatch Mode - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A playable team-vs-team deathmatch. Two teams (assignment already shipped — lobby Team A/B toggles + `setPlayerTeam`) fight to a shared per-team kill total; the first team to N eliminations wins. Players spawn at per-map team spawnpoints, respawn protected by brief invulnerability, the match opens with a polished intro cinematic, and a minimal results screen shows the outcome.

**In scope:** server team-kill scoring + win condition + `'team-deathmatch'` MatchMode; per-map spawnpoint config + farthest-from-enemy assignment + respawn invuln; the upgraded intro cinematic (replaces the Phase 8 COUNTDOWN sequence) + banner-duration fix; top-center team-score HUD; a minimal results screen.

**Out of scope:** damage-dealt stat tracking, rich/animated results layout, time-cap/tiebreaker mode, death-card upgrades (future seed), special-spell pickups (Phase 15).

</domain>

<decisions>
## Implementation Decisions

### Win condition & match end
- **D-01:** Win target = **first team to 30 team-kills**. Store as a tunable config constant (e.g. `TDM_WIN_TARGET`) surfaced in the debug panel so it can be dialed in from playtests. (Proposal default.)
- **D-02:** **No time cap, no tiebreaker** — the match runs until a team reaches the kill target. (Time-cap + damage-tiebreaker mode is deferred.)
- **D-03:** A new `'team-deathmatch'` variant is added to the server `MatchMode` union (`game-server/src/types.ts`) without breaking the existing `'respawn'` / `'last-standing'` paths. In TDM, respawn behavior follows the existing `'respawn'` semantics (scheduled respawn after `RESPAWN_DELAY_MS`).
- **D-04:** Team scoring is **server-authoritative**. On each confirmed elimination (the existing `result.eliminated` branch in `server.ts spell:hit`), the server attributes the kill to the **caster's team** (caster's team via `#playerInfo`), increments that team's shared score, and broadcasts the updated team scores to every client. Reaching the target transitions the room `ACTIVE → ENDED` and broadcasts a single win result every client receives simultaneously.
- **D-05:** Self-elimination / friendly-fire kills do NOT increment a team's score (FF is already short-circuited in `validateHit`, so this should not occur, but the scoring path must not credit a team for losing its own member).

### Results screen (minimal, this phase)
- **D-06:** On match ENDED, every client shows a **minimal results screen**: winning team (team-colored), a per-player table of **kills** and **deaths**, a highlighted **MVP = most kills**, and a **Return to lobby** button for rematch. No charts, no damage column, no elaborate animations.
- **D-07:** Server tracks per-player **kills** and **deaths** across the match (kills attributed via `casterId`, already present on the hit claim; deaths counted on each elimination). MVP is derived (highest kills; ties broken arbitrarily/by first-to-reach — planner's discretion). **Damage-dealt is NOT tracked** this phase.
- **D-08:** The results screen is its own scene/overlay; the planner will likely make it a separate plan/wave from the core scoring work.

### Spawnpoints
- **D-09:** Per-map team spawnpoints are authored as a **`config.ts` constant** keyed by `mapId` → `{ teamA: [{x,y}, …], teamB: [{x,y}, …] }`, **live-tunable via the debug panel with a COPY VALUES path** (matches the existing `*_TUNING` loop). Maps in play: `WORLD`, `DUNGEON_1`, `STAGES` (`MAP_POOL` in `game-server/src/types.ts`). (Tiled-object-layer authoring is deferred — see Deferred Ideas.)
- **D-10:** Assignment rule on match start AND on every respawn = **farthest-from-enemy**: the server picks the requesting player's team spawnpoint that is farthest from any *living* enemy. Server already has live positions (`#lastPos`, 20 Hz mirror) and HP (`#hp`) to compute "living enemy." This **replaces** the current naive `100 + idx*64` placeholder allocation in `server.ts` (the existing TODO at the `registerPlayer` loop).
- **D-11:** **Overflow = reuse/cycle**: if a team has more players than authored spawnpoints, wrap around the list (players may briefly share a spawnpoint). Never error, never crash.

### Respawn invulnerability
- **D-12:** Invuln **ends on the first of**: player movement, player cast, OR a tunable **max duration (~2–3s)** — whichever comes first. The time cap prevents an idle respawned player from camping invulnerable; the move/cast cancel prevents carrying invuln into an offensive engagement (roadmap success criterion 4).
- **D-13:** Visual cue = **reuse the existing post-hit i-frame blink** (alpha pulse) from `InvulnerableComponent` / `hurt-state`. Near-zero new art, consistent with existing feedback.
- **D-14:** Invuln is **server-authoritative**: the host tracks an invuln-until timestamp per player and **rejects `spell:hit` claims against an invulnerable target** (extend `GameRoom.validateHit` / the `spell:hit` handler). Consistent with the existing host-authoritative damage pipeline — no client can damage a protected player. The client also gates locally for immediate visual correctness, but the server is the source of truth.

### Score HUD
- **D-15:** Team-score plate lives in **`UiScene`**, positioned **top-center** (exact coordinates/styling at implementation discretion, debug-tunable afterward). It must not collide with the existing own-HP and mana HUD.
- **D-16:** Reads as **`[A] 12 – 8 [B]`** — two team scores separated by a dash, each tinted with that team's **lobby team color**. Uses the project-wide `press_start_2p` BitmapText (no ASSET_KEYS export — literal key, per the note).
- **D-17:** Updates **live on every kill broadcast**, with a **scale-pop tween** on the changed number (mirror the existing countdown-tick pop tween shape in `game-scene.ts`).

### Intro cinematic (replaces Phase 8 COUNTDOWN sequence)
- **D-18:** Exact sequence (from `.planning/notes/tdm-intro-cinematic-and-banner-bug.md`), played on every client, players locked at spawn the whole time via existing `#combatLocked` / `#deathLockActive` machinery:
  1. Map-name **banner** appears.
  2. Camera at **map center, zoomed OUT** (wider than play zoom); characters already at spawnpoints.
  3. Camera **smoothly pans** from center toward the local player's character.
  4. Camera **zooms IN** to normal play distance (today's zoom).
  5. **UI reveals** — radial-menu affordance, mana bar, HP fade/slide in (hidden during steps 1–4).
  6. **5 → 4 → 3 → 2 → 1** countdown (replaces 3-2-1-FIGHT).
  7. At 0, **movement + spell casting unlock simultaneously** on every client, keeping the host-authoritative `COUNTDOWN → ACTIVE` gate from Phase 8.
- **D-19:** **Banner bug fix** — the map-name banner "cuts the last letters" because the **reveal (typewriter/tween) animation is too short to finish before teardown**, NOT a container-width / origin / mask-clip issue. Fix = lengthen/re-pace the reveal animation, ideally **scaling its duration to the map name's character count** so long names always complete. **Do not chase a layout/width red herring.**
- **D-20:** Extend the existing Phase 8 cinematic (`#enterCountdownMode` / `#onCountdownTick` / `camera.zoomTo` / per-tick overlay) — **do not rewrite from scratch**. Exact tween durations/easings are Claude's discretion (tune to feel right).

### Claude's Discretion
- Exact tween durations, easings, and camera pan/zoom values for the intro cinematic.
- Exact score-plate coordinates, font sizes, and spacing (top-center region; debug-tunable).
- MVP tie-breaking rule.
- The shape of the team-score broadcast payload (new field on an existing message vs a new `match:score` event) — planner's call, kept consistent with existing payload conventions in `types.ts`.
- How the win result / ENDED payload carries per-player stats to the results screen.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### TDM design & decisions
- `.planning/diagnostics/gameplay-direction-proposal.md` — TDM mode rationale, 30-kill win-target recommendation, spawn-data-layer + score-plate build order, why TDM over Domination/FFA. (Note: written against the OLD roadmap structure that said "fold into Phase 10" — that work is now Phase 14.)
- `.planning/notes/tdm-intro-cinematic-and-banner-bug.md` — exact intro cinematic sequence (D-18), banner-bug root cause + fix (D-19), and reuse notes (i-frames, Phase 8 camera/lock, `press_start_2p` font key).

### Server (host-authoritative match + damage pipeline)
- `game-server/src/game-room.ts` — match FSM (`VALID_NEXT`), `#matchMode`, `registerPlayer` / `#spawnPoints` (single spawn today), `applyDamage` (returns `eliminated`), `scheduleRespawn`, `validateHit` (range/freshness/FF — extend for invuln), `#playerInfo` team lookups, `clearCombatState`.
- `game-server/src/types.ts` — `MatchMode` union (add `'team-deathmatch'`), `EliminationPayload`, `RespawnPayload`, `PlayerInfo.team`, `MAP_POOL`, tunables (`RESPAWN_DELAY_MS`, `MAX_SPELL_DAMAGE`). Mirror of client `src/networking/types.ts` — keep field shapes identical.
- `game-server/src/server.ts` — the `spell:hit` handler (`result.eliminated` branch is where scoring + win-check + kill/death attribution plug in, ~L299), the `registerPlayer` spawn-allocation loop with the naive `100 + idx*64` TODO (~L88-99, replaced by D-10), `broadcastMatchState`.

### Client (scene, HUD, cinematic, respawn)
- `src/scenes/game-scene.ts` — `#onMatchStateChanged` / `#enterCountdownMode` / `#exitCountdownMode` / `#onCountdownTick` (intro cinematic to extend, D-18/D-20), `#onElimination` / `#applyLocalDeath` / `#onRespawn` / `#clearLocalDeath` (respawn flow to add invuln onto, D-12..D-14), `#combatLocked` / `#deathLockActive` locks, match-event `EVENT_BUS` wiring + SHUTDOWN cleanup.
- `src/networking/types.ts` — client mirror of the server protocol; add any new TDM payloads here in lockstep with `game-server/src/types.ts`.
- `src/common/config/` (modular config, e.g. `index.ts`, `dash.ts`) + `src/common/runtime-config.ts` (`RUNTIME_CONFIG`) + `src/debug/debug-panel.ts` — where `TDM_WIN_TARGET`, `SPAWNPOINTS`, and invuln-duration constants live and become debug-tunable (D-01, D-09, D-12).
- `src/components/game-object/invulnerable-component.ts` + `src/components/state-machine/states/character/hurt-state.ts` — existing i-frame + blink to reuse for respawn invuln VFX (D-13).
- `.planning/codebase/ARCHITECTURE.md` — entity-component + state-machine + event-bus + singleton-manager patterns to follow.

### Project-local Phaser 4 skills (read the matching SKILL.md before touching that area)
- `skills/cameras/SKILL.md` + `skills/tweens/SKILL.md` — intro cinematic camera pan/zoom + UI-reveal tweens (D-18, D-20).
- `skills/text-and-bitmaptext/SKILL.md` — banner reveal animation + score plate (D-16, D-19).
- `skills/scenes/SKILL.md` — results screen scene lifecycle (D-06, D-08).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Match FSM + matchMode** (`game-room.ts`): `MatchMode` union + `setMatchMode` already exist; add `'team-deathmatch'` and the scoring/win-check around the existing `ENDED` transition.
- **Elimination + respawn pipeline** (`server.ts spell:hit` → `applyDamage` → `elimination` → `scheduleRespawn` → `respawn`): fully built. TDM scoring + kill/death attribution slot into the `result.eliminated` branch; invuln slots into `validateHit` + the respawn callback.
- **`validateHit`** already does range + freshness + friendly-fire short-circuit — extend with an invuln-until check (D-14).
- **`#lastPos` (20 Hz) + `#hp`**: gives the server live positions + alive-state needed for farthest-from-enemy spawn selection (D-10) with no new plumbing.
- **Phase 8 countdown cinematic** (`#enterCountdownMode`, `camera.zoomTo`, per-tick overlay, `#combatLocked`): the base the intro upgrades (D-18, D-20).
- **Local-death overlay + countdown** (`#applyLocalDeath` / `#deathCountdownText`): the respawn-window UI the invuln cue + (later) death cards attach to.
- **InvulnerableComponent + hurt-state blink**: reuse for respawn-invuln VFX (D-13).
- **Lobby team colors + `PlayerInfo.team` (0/1)**: feed the score plate tints (D-16) and team scoring (D-04).

### Established Patterns
- **Server-authoritative for anything that affects damage/score** — TDM scoring, win condition, and invuln all live server-side; clients render from broadcasts (matches Phase 9.3).
- **`*_TUNING` + debug panel + COPY VALUES loop** — all new tuning constants (win target, spawnpoints, invuln duration) follow this; live-tune then copy back into config.
- **Server `types.ts` ↔ client `networking/types.ts` mirror** — any new payload added in both, identical shapes.
- **`EVENT_BUS` + `CUSTOM_EVENTS`** — new network events bridge to scenes via the bus + SHUTDOWN cleanup (see `#registerCustomEvents`).
- **`press_start_2p` BitmapText** — literal key used across scenes for all text (banner, score, countdown, results).

### Integration Points
- `server.ts spell:hit` `result.eliminated` branch — team score increment, kill/death tally, win-target check → `ENDED`.
- `server.ts` `registerPlayer` loop — replace naive spawn offset with farthest-from-enemy from `SPAWNPOINTS[mapId]`.
- `GameRoom.validateHit` / `spell:hit` — reject hits on invuln targets.
- `GameRoom.scheduleRespawn` callback — pick a fresh farthest-from-enemy spawnpoint (not the original `#spawnPoints` single value) and start invuln.
- `UiScene` — new top-center team-score plate, updated on score broadcast.
- `GameScene` `#enterCountdownMode` / `#onCountdownTick` — replaced/extended by the new intro cinematic; UI reveal coordinates with UiScene.
- New results scene — launched on `ENDED`, reads per-player stats from the win payload, "Return to lobby" wires back to the lobby flow.

</code_context>

<specifics>
## Specific Ideas

- "First team to N kills" framing with a team-colored scoreboard — classic arena-shooter feel.
- Banner reveal must *complete* for long map names — the fix is animation pacing, not layout (D-19). The user was explicit this is not a width clip.
- Respawn invuln must not be carry-able into a fight — it dies the instant you act (D-12), reinforcing fair re-entry.
- Intro cinematic should feel like a richer version of the existing Phase 8 moment, not a from-scratch rebuild (D-20).

</specifics>

<deferred>
## Deferred Ideas

- **Damage-dealt stat tracking + rich/animated results layout** (charts, team totals, polished transitions) — minimal results screen ships this phase; richness is a follow-up.
- **Time cap + damage tiebreaker mode** — kill-target-only this phase.
- **Tiled object-layer spawnpoint authoring** — config.ts constant this phase (keeps the live-tuning loop); migrate to a Tiled `spawns` layer once positions are dialed in.
- **Death-card upgrade system (pick-1-of-3 on death, rubber-banding)** — dormant seed (`.planning/seeds/death-card-upgrade-system.md`), triggers after core TDM is playable end-to-end.
- **Special-spell pickups** — Phase 15 (depends on this phase's match loop).

</deferred>

---

*Phase: 14-core-team-deathmatch-mode*
*Context gathered: 2026-05-29*
