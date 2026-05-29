# Roadmap — Mages PvP v1.2 (Match Lifecycle & Event Polish)

## Milestone

**v1.2 — Match Lifecycle & Event Polish**

Turn the working PvP foundation into a tournament-grade experience for the college event — a synchronized match lifecycle (LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED), a host-configurable lobby (formats, maps, ready-up, AFK), the in-match feedback loop crowds expect (kill feed, damage numbers, name tags, timer, ping), a real post-match results screen, and resilient reconnect/spectator paths.

## Previous Milestones (Archived)

- **v1.0** — Phase 1: WebRTC P2P signaling, lobby, remote sync, spell relay (NET-01..06)
- **v1.1** — Phases 2–6: multi-player control, asymmetric elements, Ice/Wind/Thunder spells, host-authoritative damage, full match loop, foundation cleanup

## Phases

- [x] **Phase 7: LOADING State + Match FSM Foundation** — Server-side match state machine with LOADING transition; clients see a loading screen with match player list + map preview before everyone enters together (completed 2026-05-16)
- [x] **Phase 8: COUNTDOWN State** — Players locked at spawn during a 3–4s zoom-in cinematic with 3-2-1-FIGHT! overlay; combat unlocks simultaneously (completed 2026-05-16)
- [ ] **Phase 9: Lobby Format & Map Configuration** — Host selects 1v1→10v10 and a map; lobby capacity adjusts; single extensible `GameRoom.config` object broadcast on every change
- [x] **Phase 9.2: UI Motion & Lobby Polish** *(INSERTED)* — Cinematic menu→lobby→match transitions tied to music; final map thumbnail art replaces placeholders (completed 2026-05-21)
- [ ] **Phase 9.3: Cross-Player Combat & Input Polish** *(INSERTED)* — Build the missing v1.1 host-authoritative damage pipeline (PVP-02/04/05/06), add dash on Shift, rebind spell-cycle from Ctrl to hold-Spacebar (Ctrl+W closes browser), fix earth-wall-vs-fireball desync and phantom-2nd-fireball bug
- [ ] **Phase 9.4: Combo System & Spell Roster Expansion** *(INSERTED)* — Audit & fix existing combos that aren't firing; add Dark element (Dark Bolt + 1–2 follow-up spells once assets are sourced); add Water Ball; expand roster to 5+ new spells total
- [ ] **Phase 10: Match End & Results Screen** — Server transitions to ENDED on win condition; full-screen results show winner/kills/damage/MVP; rematch flow remains intact
- [ ] **Phase 11: Reconnect Grace Window** — 15-second slot hold on disconnect; reconnects within window restore active play
- [ ] **Phase 12: In-Match Feedback HUD** — Kill feed, floating damage numbers, name tags + HP bars overhead, match timer, ping indicator
- [ ] **Phase 13: Spectator Mode** — Eliminated players watch the remainder of the match (free cam or follow surviving player)
- [ ] **Phase 14: Core Team Deathmatch Mode** *(ADDED)* — Team kill-score win condition (first team to N), per-map multi-spawnpoints in config.ts, respawn invulnerability, and the upgraded match-intro cinematic (center→player pan, UI reveal, 5→1, banner-timing fix)
- [ ] **Phase 15: Special-Spell Pickups** *(ADDED)* — Void Orb / Dark Bolt / Shield spawn at map spots; server-authoritative single-use claim grants into the special-spell inventory

## Overview

**7 phases** | **28 requirements** | All v1.2 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 7 | LOADING State + Match FSM | 2/2 | Complete   | 2026-05-16 |
| 8 | COUNTDOWN State | 2/2 | Complete   | 2026-05-16 |
| 9 | Lobby Format & Map Config | Host configures match format/map via single extensible config broadcast to all | LBC-01..07 (7) | 4 |
| 10 | Match End & Results Screen | Win condition fires ENDED state; full-screen results breakdown; rematch intact | MER-01, MER-02, MER-07 (3) | 3 |
| 11 | Reconnect Grace Window | 15s slot hold on disconnect; reconnect restores state | MER-05, MER-06 (2) | 2 |
| 12 | In-Match Feedback HUD | Kill feed, damage numbers, name tags+HP, timer, ping | FBK-01..05 (5) | 4 |
| 13 | Spectator Mode | Eliminated players watch rest of match instead of black screen | MER-03, MER-04 (2) | 2 |

---

## Phase Details

### Phase 7: LOADING State + Match FSM Foundation

**Goal**: Players see a synchronized loading screen showing match composition (player names + team colors) and the selected map preview before the game scene starts, and no one enters until everyone has loaded.
**Depends on**: Phase 6 (foundation cleanup complete)
**Requirements**: LFC-01, LFC-02, LFC-03, LFC-04, LFC-05
**Success Criteria** (what must be TRUE):
  1. The host pressing Start in the lobby transitions every connected client to a loading screen simultaneously
  2. The loading screen lists every match participant with their name and team color, plus a preview of the selected map
  3. The game scene does not start for any client until every client has reported "loaded" to the server
  4. The match-state machine on the server has explicit `LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED` transitions and broadcasts every change to all clients
**Plans**: TBD
**UI hint**: yes

---

### Phase 8: COUNTDOWN State

**Goal**: After everyone loads, players see a zoom-in cinematic and a 3-2-1-FIGHT! countdown while locked at their spawn points, then combat unlocks for everyone at the same instant.
**Depends on**: Phase 7
**Requirements**: LFC-06, LFC-07, LFC-08, LFC-09
**Success Criteria** (what must be TRUE):
  1. During COUNTDOWN, no client accepts movement input or spell-cast input — players are visually locked at spawn
  2. The camera animates from a zoomed-out position to the normal play zoom over ~3–4 seconds when COUNTDOWN begins
  3. A `3 → 2 → 1 → FIGHT!` overlay is visible on every client and ticks in sync with the server-driven countdown
  4. Movement and spell casting unlock simultaneously on every client at the COUNTDOWN → ACTIVE transition
**Plans**: 2 plans
Plans:
- [x] 08-01-PLAN.md — Server-side countdown timer + lobby:start idempotency (CR-02) + GameRoom timer handles (WR-07) + Phase 7 STUB removal
- [x] 08-02-PLAN.md — Client cinematic: GameScene #combatLocked + FireBreath/EarthWall guards + camera zoomTo + per-tick overlay text + manual two-window UAT
**UI hint**: yes

---

### Phase 9: Lobby Format & Map Configuration

**Goal**: The host can choose the match format and the map from the lobby; both selections are reflected on every client, and the underlying config is a single object that future fields (time limit, friendly fire, spell modifiers) can extend without protocol changes.
**Depends on**: Phase 7 (server FSM in place; LOADING needs the configured map)
**Requirements**: LBC-01, LBC-02, LBC-03, LBC-04, LBC-05, LBC-06, LBC-07
**Success Criteria** (what must be TRUE):
  1. Host can select a match format from `1v1` through `10v10` and the lobby capacity updates to `format × 2` immediately
  2. Host can select a map from the available pool, and the selected map name is shown to every client in the lobby UI
  3. Every config change (format or map) is broadcast as a single socket.io event to every lobby member
  4. The `GameRoom.config` object holds all lobby config in one place, and adding a new field (e.g., `timeLimit`) requires no new socket.io events or schema renames
**Plans**: 3 plans
Plans:
- [x] 09-01-PLAN.md — Server LobbyConfig + MAP_POOL types, host-gated setConfig, lobby:set-config handler, MatchConfig snapshot
- [x] 09-02-PLAN.md — Map thumbnail assets, assets.json registration, ASSET_KEYS constants
- [x] 09-03-PLAN.md — Client type mirror, NetworkManager helpers, LobbyScene host controls + capacity header + browser row + lobby:error display
**UI hint**: yes

---

### Phase 9.1: Lobby Config Polish

**Goal**: Close the 4 UAT gaps from Phase 9 (thumbnail load, layout overlap, format-label alignment, host transition stall, blurry text) without adding new feature surface.
**Depends on**: Phase 9 (all 3 plans complete; verifies via the 09-UAT.md gap entries)
**Requirements**: LBC-04 (thumbnail visibility — re-satisfies the visual half of LBC-04)
**Type**: gap_closure (decimal phase — polish only)
**Success Criteria** (what must be TRUE):
  1. Map preview cards render the actual thumbnail PNGs (no blue fallback rectangle) — UAT Test 4/8 passes
  2. Host player list does not overlap the map control area; Format label and the format <select> are visually aligned — UAT Test 1b + cosmetic alignment gap pass
  3. Host’s lobby->loading->game transition is smooth (no black-screen flash) — UAT Test 9 passes
  4. Lobby text renders crisply on standard and HiDPI displays — UAT Test 1a passes
**Plans**: 4 plans
Plans:
- [x] 9.1-01-PLAN.md — Explicit MAP_THUMB_* loads in PreloadScene (UAT Test 4/8)
- [x] 9.1-02-PLAN.md — Lobby layout polish: player-list Y push + Format label/select alignment (UAT Test 1b + cosmetic)
- [x] 9.1-03-PLAN.md — Eager DOM/configBlock cleanup in #onLobbyStarted before scene.start (UAT Test 9)
- [x] 9.1-04-PLAN.md — #crispText helper applying setResolution to all LobbyScene Text objects (UAT Test 1a)
**UI hint**: yes

---

### Phase 9.2: UI Motion & Lobby Polish

**Goal**: The pre-match flow (main menu → lobby → match start) feels cinematic and tied to the menu music, and the lobby uses final map art instead of placeholder thumbnails.
**Depends on**: Phase 9.1 (lobby polish baseline complete; this builds on the same scenes/components)
**Requirements**: none formal — polish/UX phase (not tied to LBC/MER IDs)
**Type**: inserted (decimal phase — UX polish, not in original v1.2 plan)
**Success Criteria** (what must be TRUE):
  1. Clicking past the main-menu "click anything to..." screen plays a deliberate animation that visually syncs with the menu music (beat-tied flash / camera move / particle burst / text dissolve — chosen during discuss/UI phase), not an instant cut
  2. When the host clicks Start in the lobby, a short transition plays before the LOADING screen appears (UI panels exit, screen darkens or whooshes, music ducks — exact treatment chosen during discuss/UI phase) — every client sees the same transition
  3. The map preview thumbnails for Open Field and Dungeon are replaced with final pixel-art assets (96×64 PNG, no AA, no baked border/text) — placeholder "W" / "D" colored rectangles no longer appear
**Plans**: 5 plans
Plans:
- [x] 09.2-01-PLAN.md — UI-branch asset & code port + boot-flow change (BitmapText conversion of Splash/MainMenu/stub scenes)
- [x] 09.2-02-PLAN.md — Splash + MainMenu cinematic verification & human-verify checkpoint
- [x] 09.2-03-PLAN.md — Lobby Start→LOADING fade-out + menu-music duck + setMenuVolume(0.03) on Lobby entry
- [x] 09.2-04-PLAN.md — LoadingScene cinematic (typewriter + map preview + tip card) + gameplay-music drop sync
- [x] 09.2-05-PLAN.md — ImageMagick downscale of map backgrounds to 96×64 thumbnails (success criterion #3)
**UI hint**: yes
**Source todos**: `.planning/todos/pending/2026-05-21-menu-and-lobby-motion-transitions.md`, `.planning/todos/pending/2026-05-21-replace-map-thumbnail-placeholders.md`

---

### Phase 9.3: Cross-Player Combat & Input Polish

**Goal**: Make the game actually playable in multiplayer so the project can be tested with real players. Build the cross-player damage pipeline that v1.1 was supposed to ship but never did (REQUIREMENTS.md still has PVP-02 / PVP-04 / PVP-05 / PVP-06 marked Pending), rebind controls so the browser stops hijacking inputs, add a dash, and fix the two known multiplayer desync bugs surfaced during testing.
**Depends on**: Phase 8 (ACTIVE state is reachable; needed for damage to actually fire during combat). Independent of Phase 9.x lobby work — combat code paths don't intersect with lobby UI.
**Requirements**: PVP-02, PVP-04, PVP-05, PVP-06
**Type**: inserted (decimal phase — unblocks playtesting that should have been possible since v1.1)
**Success Criteria** (what must be TRUE):
  1. A spell cast by Player A that visually overlaps Player B's sprite deducts HP from Player B on every connected client (host-authoritative; clients apply damage only after `damage:confirmed` broadcast from the server)
  2. When a player's HP reaches 0, every client sees the elimination at the same instant via an `elimination:broadcast` server message (no client-side guessing)
  3. A friendly-fire toggle in the lobby config (default OFF) is respected by the host's damage validator — same-team hits do not deduct HP when OFF
  4. Pressing `Shift` triggers a short dash in the player's current facing/move direction (cooldown TBD during planning); dash position is broadcast to other clients via the existing position-update channel (no new message type required)
  5. Holding `Spacebar` opens the radial spell-selection menu; releasing `Spacebar` confirms the highlighted spell — `Ctrl` is no longer bound to spell-cycle (eliminates the Ctrl+W browser-close conflict)
  6. The "earth wall stops fireball" outcome is identical for the caster and every observing client — wall-vs-projectile resolution is host-authoritative or deterministic
  7. Casting a fireball never spawns a second phantom projectile — the cause of the ghost-projectile bug is identified via `/gsd-debug` and the root cause is removed (not papered over with a destroy-after call)
**Plans**: 4 plans
Plans:
- [x] 09.3-01-PLAN.md — Phantom fireball + earth-wall vs remote-spell collider + state-machine queue-dispatch bug fixes (D-20, D-21, E10) (completed 2026-05-21)
- [x] 09.3-02-PLAN.md — Damage net protocol + server validator + position mirror (D-01..D-04, D-08, D-12; PVP-04/06) (completed 2026-05-21)
- [ ] 09.3-03-PLAN.md — Client damage application + elimination overlay + respawn restore + cross-player overlaps (PVP-02/05; D-11)
- [x] 09.3-04-PLAN.md — Dash on Shift + CTRL→SPACE rebind + RUNTIME_CONFIG dash tunables (D-13..D-19) (completed 2026-05-21)
**UI hint**: minor (dash visual; spell-select rebind doesn't change radial menu visuals — only the key that opens it)
**Source**: post-Phase-9.2 playtest discovery; PROJECT.md PVP-02 explicitly unchecked

---

### Phase 9.4: Combo System & Spell Roster Expansion

**Goal**: Combos behave as advertised (every spell pair the design says should combo actually triggers the combo effect on every connected client), and the spell roster grows to support deeper play during the event — Dark element introduced (Dark Bolt + 1–2 follow-up spells once assets are sourced), Water Ball added, plus other pickups discussed during planning. Target ≥5 new spells.
**Depends on**: Phase 9.3 (cross-player damage must work — combo damage is impossible to verify if base damage is broken)
**Requirements**: SPL-05 (extended), plus net-new requirements that will be drafted during discuss-phase for the Dark element and combo correctness rules
**Type**: inserted (decimal phase — combat depth needed for tournament feel; scope grew during 9.3 playtest discovery)
**Success Criteria** (what must be TRUE):
  1. An audit document lists every spell pair the design intends to combo and records whether each one currently triggers; every "should combo" pair that wasn't triggering now triggers in multiplayer (verified on at least 2 connected clients)
  2. A new Dark element is registered in `element-manager.ts` with at least one playable spell (Dark Bolt) that has a registered asset, damage value, projectile behavior, and host-authoritative damage path consistent with Phase 9.3
  3. Water Ball is registered as a new Water-element spell with projectile behavior and damage path consistent with Phase 9.3
  4. Total net-new spells added in this phase: ≥5 (exact list locked during discuss-phase based on asset availability)
  5. Combo registry is documented (file lives in repo, single source of truth for "spell A + spell B = effect C") so future spell additions plug into it explicitly rather than being silently dropped
**Plans**: TBD (planning will likely split: combo audit + fixes, Dark element scaffolding + Dark Bolt, additional Dark spells, Water Ball, registry documentation)
**UI hint**: minor (new spells need icons in the radial menu; no new layouts)
**Source**: post-Phase-9.2 playtest discovery (user reported combos missing, wanted Dark element + Water Ball + others)
**Asset prerequisites**: Dark element spell sprites need to be sourced before plans 02+ can execute (Plan 01 = combo audit only, can start anytime)

---

### Phase 10: Match End & Results Screen

**Goal**: When the match ends, every player sees the same full-screen results breakdown (winner, per-player kills, per-player damage, MVP), and the existing rematch flow still returns everyone to the lobby cleanly.
**Depends on**: Phase 8 (ACTIVE state is reachable; needed for ENDED transition)
**Requirements**: MER-01, MER-02, MER-07
**Success Criteria** (what must be TRUE):
  1. When the win condition triggers (last player/team standing), the server transitions to ENDED and every client receives the same broadcast simultaneously
  2. The post-match results screen displays the winner/team, every player's kill count, every player's damage dealt, and an MVP highlight
  3. Pressing "Rematch" from the results screen still tears down the WebRTC mesh and resets the lobby cleanly via the existing `teardownMesh()` + `reset()` flow
**Plans**: TBD
**UI hint**: yes

---

### Phase 11: Reconnect Grace Window

**Goal**: Brief network blips don't eliminate players from a live match.
**Depends on**: Phase 10 (need ENDED/elimination semantics in place to distinguish "graced" from "truly out")
**Requirements**: MER-05, MER-06
**Success Criteria** (what must be TRUE):
  1. When a player disconnects mid-match, their slot is held for 15 seconds before they are treated as eliminated
  2. A player who reconnects within the 15-second grace window is restored to active play with their last-known state (HP, position, team)
**Plans**: TBD

---

### Phase 12: In-Match Feedback HUD

**Goal**: Combat is readable and tournament-ready — the crowd can follow eliminations, players feel hits, and team modes are playable because everyone can see who's who.
**Depends on**: Phase 10 (results screen needs accurate kills/damage data; this phase produces the same telemetry the results screen consumes)
**Requirements**: FBK-01, FBK-02, FBK-03, FBK-04, FBK-05
**Success Criteria** (what must be TRUE):
  1. A scrolling kill feed in a screen corner displays `X eliminated Y` entries in real time during ACTIVE
  2. A floating damage number animates upward from the hit point on every confirmed spell hit and fades out
  3. Every player sprite has a name tag and a small HP bar rendered above it during combat — visible to all clients
  4. The HUD shows the elapsed match time and a per-client ping/latency indicator throughout lobby and match
**Plans**: TBD
**UI hint**: yes

---

### Phase 13: Spectator Mode

**Goal**: Eliminated players stay engaged with the match instead of staring at a black screen.
**Depends on**: Phase 12 (spectator camera needs name tags + HP bars to be useful when following someone)
**Requirements**: MER-03, MER-04
**Success Criteria** (what must be TRUE):
  1. When a player is eliminated, their view transitions to a spectator camera (free cam or following a surviving player) — never a black screen
  2. The spectator can switch which surviving player they're following or toggle to free camera
**Plans**: TBD
**UI hint**: yes

---

### Phase 14: Core Team Deathmatch Mode

**Goal**: A playable team-vs-team deathmatch. Two teams (assignment already shipped — lobby Team A/B toggles + `setPlayerTeam`) fight to a shared team kill total; the first team to N eliminations wins. Players spawn at per-map spawnpoints, respawn protected by brief invulnerability, and the match opens with a polished intro cinematic.
**Depends on**: Phase 9.3 (host-authoritative cross-player damage must work end-to-end before team scoring can be tracked or verified). Phase 8 (COUNTDOWN cinematic is the base the intro upgrades).
**Requirements**: TDM-01, TDM-02, TDM-03, TDM-04, TDM-05, TDM-06 (drafted during discuss-phase)
**Type**: added (post-v1.2-playtest direction — first real game mode)
**Success Criteria** (what must be TRUE):
  1. The server tracks a shared per-team kill score; every enemy elimination by any teammate increments that team's score, and reaching the configured target N transitions the match to ENDED with a single win broadcast every client receives simultaneously
  2. A new `'team-deathmatch'` `MatchMode` variant drives scoring and respawn behavior without breaking the existing `'respawn'` / `'last-standing'` paths
  3. Each map defines MULTIPLE spawnpoints per team in `config.ts` (live-tunable via the debug panel with a COPY VALUES path); the server assigns each player a team spawnpoint on match start and on each respawn (round-robin or farthest-from-enemy)
  4. On respawn, the player is invulnerable (reusing `Player.iFrameUntil`) and the invuln cancels the instant the player moves or casts — enemy spells deal no damage during invuln, and the invuln cannot be carried into an offensive engagement
  5. The match-intro cinematic (replacing the Phase 8 sequence) plays on every client: map-name banner whose reveal animation always completes (duration scaled to name length — fixes the "cut last letters" bug, which is an animation-timing issue not a width clip) → camera at map center zoomed out → smooth pan to the local player's character → zoom to normal play distance → UI (radial menu, mana, HP) reveals → `5 → 4 → 3 → 2 → 1` countdown → movement + spell casting unlock simultaneously on the host-authoritative COUNTDOWN → ACTIVE gate
**Plans**: 4 plans
Plans:
- [ ] 14-01-PLAN.md — Server: team-deathmatch MatchMode + per-team scoring + win condition + ENDED-with-stats broadcast + bus event registry
- [ ] 14-02-PLAN.md — Server: per-map SPAWNPOINTS (debug-tunable, COPY VALUES) + farthest-from-enemy assignment + respawn invuln rejection + 5..1 countdown
- [ ] 14-03-PLAN.md — Client: intro cinematic (banner length-scaled reveal fix, camera center->pan->zoom, HUD_REVEAL, 5..1 render)
- [ ] 14-04-PLAN.md — Client: team-score HUD plate + respawn invuln blink/cancel + minimal results scene (winner, K/D, MVP, return to lobby)
**UI hint**: yes (intro cinematic, UI reveal, team-score display TBD)
**Source**: 2026-05-29 exploration after school playtest — see `.planning/notes/tdm-intro-cinematic-and-banner-bug.md`

---

### Phase 15: Special-Spell Pickups

**Goal**: Single-use special spells (Void Orb, Dark Bolt, Shield) spawn at random spots on the map during a match; the first player to walk over a pickup claims it (server-authoritative), gaining one charge of that spell that they can cast once, after which it's consumed.
**Depends on**: Phase 14 (pickups are a TDM-match feature — they spawn during ACTIVE and need the mode's match loop). Builds on the existing `special-spell-inventory.ts` + `void-orb` / `dark-bolt` configs.
**Requirements**: PCK-01, PCK-02, PCK-03 (drafted during discuss-phase)
**Type**: added (post-v1.2-playtest direction — combat depth / map control)
**Success Criteria** (what must be TRUE):
  1. During ACTIVE, pickups spawn at map spots (per-map spawn list); each pickup is one of Void Orb / Dark Bolt / Shield and is visible to every client at the same location
  2. When a player overlaps a pickup, the server authoritatively decides who claimed it (no double-claim across clients) and the pickup disappears for everyone
  3. The claimant gains a single-use charge in `special-spell-inventory.ts`; casting it consumes the charge, and it cannot be cast again until another pickup is claimed
**Plans**: TBD (planning will likely split: server pickup spawn/claim authority + sync; client pickup sprites + overlap; single-use grant into inventory + cast/consume)
**UI hint**: minor (pickup sprites on map; possible inventory indicator)
**Source**: 2026-05-29 exploration after school playtest

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. LOADING State + Match FSM | 0/? | Not started | — |
| 8. COUNTDOWN State | 0/2 | Not started | — |
| 9. Lobby Format & Map Config | 3/3 | Plans complete (pending verify) | — |
| 9.2. UI Motion & Lobby Polish | 5/5 | Complete | 2026-05-21 |
| 9.3. Cross-Player Combat & Input Polish | 1/4 | In progress | — |
| 9.4. Combo System & Spell Roster | 0/? | Not started | — |
| 10. Match End & Results Screen | 0/? | Not started | — |
| 11. Reconnect Grace Window | 0/? | Not started | — |
| 12. In-Match Feedback HUD | 0/? | Not started | — |
| 13. Spectator Mode | 0/? | Not started | — |
| 14. Core Team Deathmatch Mode | 0/? | Not started | — |
| 15. Special-Spell Pickups | 0/? | Not started | — |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| LFC-01 | 7 | Pending |
| LFC-02 | 7 | Pending |
| LFC-03 | 7 | Pending |
| LFC-04 | 7 | Pending |
| LFC-05 | 7 | Pending |
| LFC-06 | 8 | Pending |
| LFC-07 | 8 | Pending |
| LFC-08 | 8 | Pending |
| LFC-09 | 8 | Pending |
| LBC-01 | 9 | Pending |
| LBC-02 | 9 | Pending |
| LBC-03 | 9 | Pending |
| LBC-04 | 9 | Pending |
| LBC-05 | 9 | Pending |
| LBC-06 | 9 | Pending |
| LBC-07 | 9 | Pending |
| MER-01 | 10 | Pending |
| MER-02 | 10 | Pending |
| MER-07 | 10 | Pending |
| MER-05 | 11 | Pending |
| MER-06 | 11 | Pending |
| FBK-01 | 12 | Pending |
| FBK-02 | 12 | Pending |
| FBK-03 | 12 | Pending |
| FBK-04 | 12 | Pending |
| FBK-05 | 12 | Pending |
| MER-03 | 13 | Pending |
| MER-04 | 13 | Pending |

**28/28 v1.2 requirements mapped ✓ — no orphans, no duplicates** (LBC-08..11 dropped along with the Ready-Up & AFK phase)

---

## Phase Ordering Rationale

Phases are ordered to honor the event-deadline constraint: match-critical features (loading screen, countdown, results) ship before quality-of-life (damage numbers, spectator). If the timeline tightens, Phases 12 and 13 are the safest to defer — combat is still playable without them.

- **7 → 8 → 10**: Core lifecycle (LOADING → COUNTDOWN → ENDED). The match cannot run end-to-end without these.
- **9**: Tournament hosting must-have (format/map config). Can run after lifecycle but before the event.
- **11**: Resilience — already partially designed in Phase 6, low risk. Slots in after the FSM stabilizes.
- **12 → 13**: Polish. The kill feed and damage numbers are the highest-energy crowd features; spectator is heaviest scope.
