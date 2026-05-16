# Roadmap — Mages PvP v1.2 (Match Lifecycle & Event Polish)

## Milestone

**v1.2 — Match Lifecycle & Event Polish**

Turn the working PvP foundation into a tournament-grade experience for the college event — a synchronized match lifecycle (LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED), a host-configurable lobby (formats, maps, ready-up, AFK), the in-match feedback loop crowds expect (kill feed, damage numbers, name tags, timer, ping), a real post-match results screen, and resilient reconnect/spectator paths.

## Previous Milestones (Archived)

- **v1.0** — Phase 1: WebRTC P2P signaling, lobby, remote sync, spell relay (NET-01..06)
- **v1.1** — Phases 2–6: multi-player control, asymmetric elements, Ice/Wind/Thunder spells, host-authoritative damage, full match loop, foundation cleanup

## Phases

- [x] **Phase 7: LOADING State + Match FSM Foundation** — Server-side match state machine with LOADING transition; clients see a loading screen with match player list + map preview before everyone enters together (completed 2026-05-16)
- [ ] **Phase 8: COUNTDOWN State** — Players locked at spawn during a 3–4s zoom-in cinematic with 3-2-1-FIGHT! overlay; combat unlocks simultaneously
- [ ] **Phase 9: Lobby Format & Map Configuration** — Host selects 1v1→10v10 and a map; lobby capacity adjusts; single extensible `GameRoom.config` object broadcast on every change
- [ ] **Phase 10: Ready-Up & AFK Detection** — Per-player ready toggle gates host's Start; idle players flagged AFK with one-click host kick
- [ ] **Phase 11: Match End & Results Screen** — Server transitions to ENDED on win condition; full-screen results show winner/kills/damage/MVP; rematch flow remains intact
- [ ] **Phase 12: Reconnect Grace Window** — 15-second slot hold on disconnect; reconnects within window restore active play
- [ ] **Phase 13: In-Match Feedback HUD** — Kill feed, floating damage numbers, name tags + HP bars overhead, match timer, ping indicator
- [ ] **Phase 14: Spectator Mode** — Eliminated players watch the remainder of the match (free cam or follow surviving player)

## Overview

**8 phases** | **32 requirements** | All v1.2 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|--------------|------------------|
| 7 | LOADING State + Match FSM | 2/2 | Complete   | 2026-05-16 |
| 8 | COUNTDOWN State | 1/2 | In Progress|  |
| 9 | Lobby Format & Map Config | Host configures match format/map via single extensible config broadcast to all | LBC-01..07 (7) | 4 |
| 10 | Ready-Up & AFK Detection | Lobby gates start on all-ready + min count; AFK detection + kick | LBC-08..11 (4) | 3 |
| 11 | Match End & Results Screen | Win condition fires ENDED state; full-screen results breakdown; rematch intact | MER-01, MER-02, MER-07 (3) | 3 |
| 12 | Reconnect Grace Window | 15s slot hold on disconnect; reconnect restores state | MER-05, MER-06 (2) | 2 |
| 13 | In-Match Feedback HUD | Kill feed, damage numbers, name tags+HP, timer, ping | FBK-01..05 (5) | 4 |
| 14 | Spectator Mode | Eliminated players watch rest of match instead of black screen | MER-03, MER-04 (2) | 2 |

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
- [ ] 08-02-PLAN.md — Client cinematic: GameScene #combatLocked + FireBreath/EarthWall guards + camera zoomTo + per-tick overlay text + manual two-window UAT
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
**Plans**: TBD
**UI hint**: yes

---

### Phase 10: Ready-Up & AFK Detection

**Goal**: The lobby prevents accidental starts and surfaces idle players to the host.
**Depends on**: Phase 9 (config object exists; min-count comes from format)
**Requirements**: LBC-08, LBC-09, LBC-10, LBC-11
**Success Criteria** (what must be TRUE):
  1. Each player has a visible "Ready" toggle, and the host's Start button is disabled until every player is ready AND the format-required minimum is met
  2. A player who has been idle in the lobby past the configured timeout is visibly flagged as AFK on every client
  3. The host has a one-click action to kick any AFK-flagged player from the lobby
**Plans**: TBD
**UI hint**: yes

---

### Phase 11: Match End & Results Screen

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

### Phase 12: Reconnect Grace Window

**Goal**: Brief network blips don't eliminate players from a live match.
**Depends on**: Phase 11 (need ENDED/elimination semantics in place to distinguish "graced" from "truly out")
**Requirements**: MER-05, MER-06
**Success Criteria** (what must be TRUE):
  1. When a player disconnects mid-match, their slot is held for 15 seconds before they are treated as eliminated
  2. A player who reconnects within the 15-second grace window is restored to active play with their last-known state (HP, position, team)
**Plans**: TBD

---

### Phase 13: In-Match Feedback HUD

**Goal**: Combat is readable and tournament-ready — the crowd can follow eliminations, players feel hits, and team modes are playable because everyone can see who's who.
**Depends on**: Phase 11 (results screen needs accurate kills/damage data; this phase produces the same telemetry the results screen consumes)
**Requirements**: FBK-01, FBK-02, FBK-03, FBK-04, FBK-05
**Success Criteria** (what must be TRUE):
  1. A scrolling kill feed in a screen corner displays `X eliminated Y` entries in real time during ACTIVE
  2. A floating damage number animates upward from the hit point on every confirmed spell hit and fades out
  3. Every player sprite has a name tag and a small HP bar rendered above it during combat — visible to all clients
  4. The HUD shows the elapsed match time and a per-client ping/latency indicator throughout lobby and match
**Plans**: TBD
**UI hint**: yes

---

### Phase 14: Spectator Mode

**Goal**: Eliminated players stay engaged with the match instead of staring at a black screen.
**Depends on**: Phase 13 (spectator camera needs name tags + HP bars to be useful when following someone)
**Requirements**: MER-03, MER-04
**Success Criteria** (what must be TRUE):
  1. When a player is eliminated, their view transitions to a spectator camera (free cam or following a surviving player) — never a black screen
  2. The spectator can switch which surviving player they're following or toggle to free camera
**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. LOADING State + Match FSM | 0/? | Not started | — |
| 8. COUNTDOWN State | 0/2 | Not started | — |
| 9. Lobby Format & Map Config | 0/? | Not started | — |
| 10. Ready-Up & AFK Detection | 0/? | Not started | — |
| 11. Match End & Results Screen | 0/? | Not started | — |
| 12. Reconnect Grace Window | 0/? | Not started | — |
| 13. In-Match Feedback HUD | 0/? | Not started | — |
| 14. Spectator Mode | 0/? | Not started | — |

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
| LBC-08 | 10 | Pending |
| LBC-09 | 10 | Pending |
| LBC-10 | 10 | Pending |
| LBC-11 | 10 | Pending |
| MER-01 | 11 | Pending |
| MER-02 | 11 | Pending |
| MER-07 | 11 | Pending |
| MER-05 | 12 | Pending |
| MER-06 | 12 | Pending |
| FBK-01 | 13 | Pending |
| FBK-02 | 13 | Pending |
| FBK-03 | 13 | Pending |
| FBK-04 | 13 | Pending |
| FBK-05 | 13 | Pending |
| MER-03 | 14 | Pending |
| MER-04 | 14 | Pending |

**32/32 v1.2 requirements mapped ✓ — no orphans, no duplicates**

---

## Phase Ordering Rationale

Phases are ordered to honor the event-deadline constraint: match-critical features (loading screen, countdown, results) ship before quality-of-life (damage numbers, spectator). If the timeline tightens, Phases 13 and 14 are the safest to defer — combat is still playable without them.

- **7 → 8 → 11**: Core lifecycle (LOADING → COUNTDOWN → ENDED). The match cannot run end-to-end without these.
- **9 → 10**: Tournament hosting must-haves (format/map config, ready-up). Can run after lifecycle but before the event.
- **12**: Resilience — already partially designed in Phase 6, low risk. Slots in after the FSM stabilizes.
- **13 → 14**: Polish. The kill feed and damage numbers are the highest-energy crowd features; spectator is heaviest scope.
