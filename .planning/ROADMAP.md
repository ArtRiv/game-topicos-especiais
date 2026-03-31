# Roadmap — Mages PvP v1.1 (PvP Team Deathmatch)

## Milestone

**v1.1 — PvP Team Deathmatch**

Turn the completed WebRTC P2P networking foundation into a playable multi-player PvP game with fully controllable mages, new spells, direct player-vs-player combat, and a working match loop (start → fight → win/lose → lobby).

## Overview

**5 phases** | **33 requirements** | All v1.0 + v1.1 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|-------------|-----------------|
| 1 | LAN Foundation | WebRTC P2P networking, lobby, remote player sync, spell relay *(COMPLETE)* | NET-01–06 | 5 |
| 2 | Multi-Player Control | 2/4 | In Progress|  |
| 3 | New Spells | Ice, Wind, Thunder spells; config-driven extensible system; all spells open to all players | SPL-01–05, PVP-01 | 4 |
| 4 | PvP Combat | Cross-player hit detection; host-authoritative damage; client-side prediction; elimination | PVP-02–06, MTH-02, HUD-02, SCL-04 | 5 |
| 5 | Match Loop & Scalability | Synchronized match start; win condition; match-end screen; return to lobby; 5v5 minimum stable baseline; scale beyond for stress testing | MTH-01, MTH-03–06, SCL-01–03 | 5 |

---

## Phase Details

### Phase 1: LAN Foundation

**Goal**: WebRTC P2P networking is working — players can connect, form a lobby, and see each other move and cast spells in real time
**Depends on**: Nothing
**Status**: ✓ COMPLETE
**Requirements**: NET-01, NET-02, NET-03, NET-04, NET-05, NET-06
**Success Criteria** (what must be TRUE):
  1. Player opens browser, enters server URL, and joins a lobby waiting room
  2. Remote player's position and direction update in real time on all clients at 20 Hz
  3. Spells cast by any player appear on all other clients at the correct position
  4. Room transitions are synchronized — all clients enter the new room at the same time
  5. Disconnecting one client notifies all remaining clients immediately without freezing
**Plans**: 5 plans — all complete

---

### Phase 2: Multi-Player Control

**Goal**: Every player controls their own mage on their own machine simultaneously; all remote players render correctly for every connected client; the lobby supports team assignment for N players
**Depends on**: Phase 1
**Requirements**: PLR-01, PLR-02, PLR-03, PLR-04, HUD-01
**Success Criteria** (what must be TRUE):
  1. Each player connects, joins a lobby, and controls their own mage via keyboard — no fixed role assignments hardcoded in the client
  2. Every other player's mage moves in real time on all connected clients, driven by `RemoteInputComponent` position snapshots
  3. Each player has independent HP and mana; taking damage on one client does not affect another player's stats
  4. Each player sees their own HP bar on their screen at all times during play
  5. The lobby displays all connected players and supports N players with no hard cap enforced in code; teams are configurable before match start
**Plans**: 4 plans
Plans:
- [x] 02-01-PLAN.md — Type system + server team protocol (`PlayerInfo.team`, `lobby:assign-team` socket event)
- [ ] 02-02-PLAN.md — LobbyScene host detection fix + team assignment UI (host toggle buttons, read-only badges)
- [x] 02-03-PLAN.md — GameScene deterministic tinting via `matchPlayers` getter (team-based color assignment)
- [ ] 02-04-PLAN.md — Phase 2 verification checklist (all 5 success criteria, 3-client smoke test)

---

### Phase 3: New Spells

**Goal**: Ice, Wind, and Thunder spells are fully playable; the spell system is extended without touching core casting logic; all spells are accessible to all players
**Depends on**: Phase 2
**Requirements**: SPL-01, SPL-02, SPL-03, SPL-04, SPL-05, PVP-01
**Success Criteria** (what must be TRUE):
  1. Player can cast at least one Ice spell, one Wind spell, and one Thunder spell — each with a distinct visual projectile or area effect
  2. Every new spell has its damage, mana cost, and cooldown defined exclusively in `config.ts` — no magic numbers in spell class bodies
  3. Adding a fourth new element requires only a new spell class and a config entry; no modifications to `SpellCastingComponent`, `ElementManager`, or core casting pipeline
  4. All spells (new and existing) are available to every player — no per-player loadout restrictions enforced in v1.1
**Plans**: TBD

---

### Phase 4: PvP Combat

**Goal**: Players can deal damage to each other; hit detection and damage are validated by the host and applied on all clients; players are eliminated at 0 HP
**Depends on**: Phase 3
**Requirements**: PVP-02, PVP-03, PVP-04, PVP-05, PVP-06, MTH-02, HUD-02, SCL-04
**Success Criteria** (what must be TRUE):
  1. A spell cast by one player immediately appears on that player's screen (client-side prediction) without waiting for host acknowledgment
  2. The host validates the hit event, broadcasts `game:damage-confirmed`, and all clients apply damage to the correct target only after receiving it
  3. Friendly fire is OFF by default; toggling the `friendlyFire` flag on `GameRoom` enables it without any code changes beyond the flag
  4. A player reaching 0 HP enters the death animation on all clients simultaneously, triggered by `game:player-eliminated` broadcast from the host
  5. Dead players are removed from active play on every client; combat logic produces consistent results under 5+ simultaneous players
**Plans**: TBD
**UI hint**: yes

---

### Phase 5: Match Loop & Scalability

**Goal**: A full match runs from lobby through combat to match-end and back to lobby; 5v5 is the minimum stable baseline (not a cap); the system scales beyond that for stress testing; the match state machine supports future modes without refactoring
**Depends on**: Phase 4
**Requirements**: MTH-01, MTH-03, MTH-04, MTH-05, MTH-06, SCL-01, SCL-02, SCL-03
**Success Criteria** (what must be TRUE):
  1. All players finish loading into the same game scene before combat is enabled; no player can cast or move until the synchronized `match:start` signal is received
  2. When the last opponent is eliminated, every client simultaneously receives `game:match-end` and displays the correct win or lose result screen
  3. Players can press a rematch button from the match-end screen and return to the lobby for a new session
  4. A 10-player (5v5) match is the minimum stable baseline — runs for at least 5 minutes with no desyncs, crashes, or freezes; the system allows scaling beyond 10 players with no code changes; any degradation above that is observable and documented
  5. The match flow is structured as a state machine (Lobby → Match Start → Combat → Win Condition → Match End → Lobby) so future modes (FFA, battle royale) can extend it without refactoring the base loop; mid-match disconnects do not freeze remaining clients
**Plans**: TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. LAN Foundation | 5/5 | ✓ Complete | 2026-03-30 |
| 2. Multi-Player Control | 0/4 | Planned | — |
| 3. New Spells | 0/? | Not started | — |
| 4. PvP Combat | 0/? | Not started | — |
| 5. Match Loop & Scalability | 0/? | Not started | — |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| NET-01 | 1 | ✓ Complete |
| NET-02 | 1 | ✓ Complete |
| NET-03 | 1 | ✓ Complete |
| NET-04 | 1 | ✓ Complete |
| NET-05 | 1 | ✓ Complete |
| NET-06 | 1 | ✓ Complete |
| PLR-01 | 2 | Pending |
| PLR-02 | 2 | Pending |
| PLR-03 | 2 | Pending |
| PLR-04 | 2 | Pending |
| HUD-01 | 2 | Pending |
| SPL-01 | 3 | Pending |
| SPL-02 | 3 | Pending |
| SPL-03 | 3 | Pending |
| SPL-04 | 3 | Pending |
| SPL-05 | 3 | Pending |
| PVP-01 | 3 | Pending |
| PVP-02 | 4 | Pending |
| PVP-03 | 4 | Pending |
| PVP-04 | 4 | Pending |
| PVP-05 | 4 | Pending |
| PVP-06 | 4 | Pending |
| MTH-02 | 4 | Pending |
| HUD-02 | 4 | Pending |
| SCL-04 | 4 | Pending |
| MTH-01 | 5 | Pending |
| MTH-03 | 5 | Pending |
| MTH-04 | 5 | Pending |
| MTH-05 | 5 | Pending |
| MTH-06 | 5 | Pending |
| SCL-01 | 5 | Pending |
| SCL-02 | 5 | Pending |
| SCL-03 | 5 | Pending |

**33/33 v1.0 + v1.1 requirements mapped ✓ (6 Phase 1 complete + 27 Phases 2–5 pending)**

## Milestone: College Event Build (v1.0)

All 5 phases complete = event-ready.

**Definition of Done:**
- Both players can sit at separate LAN machines and complete a full ~15-minute session
- At least 6 cross-player combos work and appear in the combo journal
- At least 3 puzzle rooms exist (1 timed, 1 cooperative, 1 environmental combo)
- A mini-boss and final boss exist with discoverable weaknesses
- An intro and ending exist
- Comedy NPCs are present

---

## Phase Schedule (Rough, 3-Month Window)

```
Month 1:  Phase 1 (LAN Foundation) + Phase 2 (Two Players)
Month 2:  Phase 3 (Spell Sync & Combos)
Month 3:  Phase 4 (Puzzles) + Phase 5 (Bosses & NPCs)
Buffer:   Last 2 weeks — playtest, polish, bug fixes
```
