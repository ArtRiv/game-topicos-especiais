# Roadmap — Mages v2.0 PvP Event Multiplayer

## Overview

**7 phases** | **33 requirements** | All v2.0 requirements covered ✓

## Phases

- [ ] **Phase 1: Auth + Server Scaffold** — Google OAuth login, persistent accounts, JWT-gated Phaser boot
- [ ] **Phase 2: Lobby & Networking Foundation** — lobby rooms with invite codes, socket.io sync, reconnection grace
- [ ] **Phase 3: PvP Arena Core** — 8-player arena, server-authoritative damage, match result reporting
- [ ] **Phase 4: Game Modes** — Battle Royale (shrinking zone, spectator) + Team vs Team (2v2/3v3/4v4)
- [ ] **Phase 5: Ranking & Leaderboard** — ELO ranking (K=32), global leaderboard, rank on main menu
- [ ] **Phase 6: Spell Progression & Leveling** — XP system, level-ups, upgrade points, ≤15% stat cap
- [ ] **Phase 7: Infrastructure + Pre-Event QA** — HTTPS deployment, prod OAuth, 8-player load test, PM2

---

## Phase Details

### Phase 1: Auth + Server Scaffold
**Goal**: Players can authenticate with Google and have a persistent account; Phaser boots only after auth
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. Player visits the game URL, sees a login page, and can authenticate with their Google account
  2. After login, player's display name, rank score, level, and upgrade points are stored in the DB
  3. Phaser client boots only after a valid JWT is confirmed — unauthenticated users cannot enter game
  4. Player can log out from the main menu and return cleanly to the login screen
**Plans**: TBD
**UI hint**: yes

### Phase 2: Lobby & Networking Foundation
**Goal**: Players can form lobbies with invite codes and have synchronized real-time game sessions
**Depends on**: Phase 1
**Requirements**: LBY-01, LBY-02, LBY-03, LBY-04, LBY-05, LBY-06, NET-01, NET-02, NET-03, NET-04
**Success Criteria** (what must be TRUE):
  1. A player can create a lobby and share a 6-character invite code with others
  2. Another player can join using the code and see all lobby members with their ready status in real time
  3. Lobby owner can select the game mode; match cannot start without minimum player count
  4. If the host disconnects, lobby ownership transfers automatically to another player
  5. A 15-second reconnection grace window prevents immediate elimination on brief disconnect
**Plans**: TBD
**UI hint**: yes

### Phase 3: PvP Arena Core
**Goal**: Up to 8 players fight in a shared arena with server-authoritative damage resolution
**Depends on**: Phase 2
**Requirements**: PVP-01, PVP-02, PVP-03, PVP-04, PVP-05, PVP-06
**Success Criteria** (what must be TRUE):
  1. Up to 8 player characters appear and move simultaneously in the dedicated PvP arena map
  2. A player's spell hits another player and their HP decreases as broadcast by the server (not self-reported)
  3. When a player's HP reaches 0 they are eliminated and removed from the active match
  4. All 6 elements (Fire, Earth, Water, Ice, Wind, Thunder) are available to every player from match start
  5. Match result (winner, elimination order) is sent to the server at match end
**Plans**: TBD
**UI hint**: yes

### Phase 4: Game Modes
**Goal**: Battle Royale and Team vs Team modes are fully operational with correct win conditions
**Depends on**: Phase 3
**Requirements**: GM-01, GM-02, GM-03, GM-04, GM-05
**Success Criteria** (what must be TRUE):
  1. A Battle Royale match runs with a visible shrinking safe zone; the last mage standing wins
  2. Eliminated BR players can spectate surviving players from their perspective
  3. 2v2, 3v3, and 4v4 team matches complete with the last-team-standing win condition
  4. Team colors are clearly visible on player sprites and HUD
  5. Teammates cannot damage each other in team modes (friendly fire is off)
**Plans**: TBD
**UI hint**: yes

### Phase 5: Ranking & Leaderboard
**Goal**: ELO rankings update after every match and a global leaderboard is accessible in-game
**Depends on**: Phase 4
**Requirements**: RNK-01, RNK-02, RNK-03, RNK-04
**Success Criteria** (what must be TRUE):
  1. A player's ELO score (K=32, base 1000) updates correctly after every match — wins up, losses down
  2. A global leaderboard screen displays top-ranked players sorted by score
  3. Player can view their own current rank score and level from the main menu
**Plans**: TBD
**UI hint**: yes

### Phase 6: Spell Progression & Leveling
**Goal**: Players earn XP, level up, and can spend upgrade points on stat improvements that persist across matches
**Depends on**: Phase 5
**Requirements**: PRG-01, PRG-02, PRG-03, PRG-04, PRG-05
**Success Criteria** (what must be TRUE):
  1. XP is awarded after each match with bonus XP for wins, kills, and high placement
  2. Accumulating XP levels up the player's account (visible on profile/menu screen)
  3. Level-ups grant 1 upgrade point each, spendable on cooldown reduction, max mana, and max HP
  4. Stat upgrades (capped at ≤15% total delta across all stats) are applied at match start in subsequent matches
**Plans**: TBD

### Phase 7: Infrastructure + Pre-Event QA
**Goal**: Game is deployed on HTTPS, Google OAuth works in production, and the server passes load testing
**Depends on**: Phase 6
**Requirements**: INF-01, INF-02, INF-03, INF-04
**Success Criteria** (what must be TRUE):
  1. Game is accessible via HTTPS at a public URL and Google OAuth login completes end-to-end on the production URL
  2. An 8-player simultaneous session load test passes with acceptable latency
  3. Server can be restarted via PM2 without any player account data being lost
  4. All infrastructure is verified on campus WiFi at least one week before the event
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Auth + Server Scaffold | 0/? | Not started | - |
| 2. Lobby & Networking Foundation | 0/? | Not started | - |
| 3. PvP Arena Core | 0/? | Not started | - |
| 4. Game Modes | 0/? | Not started | - |
| 5. Ranking & Leaderboard | 0/? | Not started | - |
| 6. Spell Progression & Leveling | 0/? | Not started | - |
| 7. Infrastructure + Pre-Event QA | 0/? | Not started | - |

---

## Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| LBY-01 | Phase 2 | Pending |
| LBY-02 | Phase 2 | Pending |
| LBY-03 | Phase 2 | Pending |
| LBY-04 | Phase 2 | Pending |
| LBY-05 | Phase 2 | Pending |
| LBY-06 | Phase 2 | Pending |
| NET-01 | Phase 2 | Pending |
| NET-02 | Phase 2 | Pending |
| NET-03 | Phase 2 | Pending |
| NET-04 | Phase 2 | Pending |
| PVP-01 | Phase 3 | Pending |
| PVP-02 | Phase 3 | Pending |
| PVP-03 | Phase 3 | Pending |
| PVP-04 | Phase 3 | Pending |
| PVP-05 | Phase 3 | Pending |
| PVP-06 | Phase 3 | Pending |
| GM-01 | Phase 4 | Pending |
| GM-02 | Phase 4 | Pending |
| GM-03 | Phase 4 | Pending |
| GM-04 | Phase 4 | Pending |
| GM-05 | Phase 4 | Pending |
| RNK-01 | Phase 5 | Pending |
| RNK-02 | Phase 5 | Pending |
| RNK-03 | Phase 5 | Pending |
| RNK-04 | Phase 5 | Pending |
| PRG-01 | Phase 6 | Pending |
| PRG-02 | Phase 6 | Pending |
| PRG-03 | Phase 6 | Pending |
| PRG-04 | Phase 6 | Pending |
| PRG-05 | Phase 6 | Pending |
| INF-01 | Phase 7 | Pending |
| INF-02 | Phase 7 | Pending |
| INF-03 | Phase 7 | Pending |
| INF-04 | Phase 7 | Pending |

**Total: 37 mapped / 33 v2.0 requirements ✓** *(33 active + 4 Infrastructure = 37 rows; all 33 v2.0 requirements covered)*

**Success Criteria:**
1. Developer opens two browser tabs; P1 moves on Tab A and Tab B shows P1 moving
2. Both tabs transition to the same room at the same time when a door is triggered
3. A spell cast by P1 appears on Tab B's screen at the correct position
4. Disconnecting one tab shows an error/reconnect message on the other
**UI hint**: no

---

### Phase 2: Two Players Playing

**Goal:** Both players are fully playable on separate machines with asymmetric elements — P1 has Fire/Earth/Water, P2 has Ice/Wind/Thunder. Each has independent health and mana.

**Requirements:** P2-01, P2-02, P2-03, P2-04, P2-05, CORE-01, CORE-04

**Plans:**
1. Spawn second `Player` instance in `GameScene` for P2
2. Implement `RemoteInputComponent` (drives P2 from network snapshots on P1's client; drives P1 from network on P2's client)
3. Assign element sets: P1 `[FIRE, EARTH, WATER]`, P2 `[ICE, WIND, THUNDER]` from server assignment
4. Add P2 health + mana to HUD overlay (both players' stats visible)
5. Sync radial menu element selection over network (each player's active element shown on both HUDs)

**Success Criteria:**
1. Two real keyboards on two machines control two distinct characters simultaneously
2. P1's radial menu only shows Fire/Earth/Water; P2's only shows Ice/Wind/Thunder
3. P2's health bar on the HUD goes down when P2 takes damage (visible to both players)
4. Both players see the same active element indicator for both characters
5. If either player dies, both screens respond (shared death state)
**UI hint**: yes

---

### Phase 3: Spell Sync & Cross-Player Combos

**Goal:** Ice, Wind, and Thunder spells are implemented. All spells sync over the network. At least 6 cross-player combo effects trigger automatically when opposing spells collide — confirmed by the server.

**Requirements:** SPL-01, SPL-02, SPL-03, SPL-04, SPL-05, CMB-01, CMB-02, CMB-03, CMB-04, CMB-05, DSC-01, DSC-02

**Plans:**
1. Implement IceSpell (projectile: IceShard or area: FrostZone) for P2
2. Implement WindSpell (projectile: WindBolt or area: WindVortex) for P2
3. Implement ThunderSpell (projectile: ThunderBolt or area: ThunderStrike) for P2
4. Sync spell positions and active spells over network (server tracks all live spells)
5. Implement cross-player combo detection: server checks spell overlaps, emits COMBO_TRIGGERED
6. Implement 6 combo effects (see table below) with distinct visuals
7. Build combo journal UI scene/overlay — fills as combos are discovered

**Cross-Player Combo Table:**
| P1 Spell | P2 Spell | Combo Effect |
|----------|----------|-------------|
| FireBolt | IceShard | Steam Burst (area blind + knockback) |
| FireArea | WindVortex | Inferno Vortex (spinning AoE fire) |
| FireBreath | ThunderBolt | Storm Flare (chain lightning + fire DoT) |
| EarthBolt | FrostZone | Permafrost (frozen pillar, blocks enemies) |
| WaterSpike | WindVortex | Typhoon (expanded water tornado) |
| WaterSpike | ThunderBolt | Electric Surge (expanded AoE shock) |

**Success Criteria:**
1. P2 can cast Ice, Wind, and Thunder spells from their respective element
2. Spell projectiles from either player appear on both screens simultaneously
3. When P1 fires FireBolt into P2's IceWall, a Steam Burst triggers on both screens
4. The combo journal unlocks the Steam Burst entry after its first trigger
5. Combo damage exceeds individual spell damage on its own
**UI hint**: yes

---

### Phase 4: Puzzle Rooms

**Goal:** At least 3 dedicated puzzle rooms exist with environmental interactables that respond to individual spells and combos. One room has a countdown timer; failing it spawns an enemy wave. One NPC hints at a combo solution.

**Requirements:** PZL-01, PZL-02, PZL-03, PZL-04, PZL-05, PZL-06, PZL-07, PZL-08, NPC-03

**Plans:**
1. Define Tiled property schema for puzzle rooms (`roomType`, `timerSeconds`, `failureSpawn`, interactable object types)
2. Implement `ElementalInteractable` game object (responds to elements, tracks state transitions)
3. Implement `PuzzleRoomManager` (tracks interactable states, success condition, timer)
4. Build Puzzle Room 1: cooperative simultaneous cast (both players aim spell at same target)
5. Build Puzzle Room 2: timed sequence puzzle (apply elements in order within countdown) + failure wave
6. Build Puzzle Room 3: water+thunder environmental combo (wet object → electrify → activate device)
7. Add NPC in or near a puzzle room that hints at the solution

**Success Criteria:**
1. 3 puzzle rooms exist and are reachable during a playthrough
2. Casting Water on the device in Room 3 changes its visual state (wet) and calling Thunder activates it
3. The countdown timer is visible to both players; reaching zero spawns a hard enemy wave
4. Both players must act for the cooperative puzzle to solve — one player alone cannot complete it
5. NPC dialogue references at least one cross-element combination as a hint
**UI hint**: yes

---

### Phase 5: Bosses, NPCs & Narrative

**Goal:** Two new enemy types with elemental weaknesses, a mini-boss per level, a final boss requiring cross-player combos, an intro/ending sequence, and 2+ NPCs with personality dialogue.

**Requirements:** ENM-01, ENM-02, BOS-01, BOS-02, BOS-03, BOS-04, NPC-01, NPC-02, NPC-04, NPC-05, CORE-02

**Plans:**
1. Implement 2 new enemy types with elemental resistance/weakness system (extend `CharacterGameObject`)
2. Build Level 1 mini-boss with an exploitable elemental weakness (state machine: vulnerable window after specific combo)
3. Build final boss with 2 phases + cross-player combo requirement (Phase 2 only triggered by specific combo)
4. Write and implement intro NPC dialogue (premise + light comedy)
5. Write and implement 2 in-world NPCs with personality dialogue
6. Build ending sequence triggered by final boss defeat event
7. Wire 2 game levels with escalating difficulty (Level 1 → Level 2 → Boss arena)

**Success Criteria:**
1. New Enemy Type A takes extra damage from one of P2's elements; spam-casting P1's elements deals reduced damage
2. Mini-boss enters a vulnerable phase only after a specific combo is used (discoverable by experimentation)
3. Final boss Phase 2 only triggers when players use the correct cross-player combo
4. Intro dialogue plays before Level 1 starts; ending sequence plays after final boss dies
5. At least 2 NPCs have character — players laugh or recognize the devs' voices
6. A full ~15-minute playthrough can be completed start to finish
**UI hint**: no

---

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
