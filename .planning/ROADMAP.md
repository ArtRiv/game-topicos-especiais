# Roadmap — Mages Co-op

## Overview

**5 phases** | **38 requirements** | All v1 requirements covered ✓

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|-------------|-----------------|
| 1 | LAN Foundation | Two players connected and visible on each other's screens | NET-01–06, CORE-03 | 4 |
| 2 | Two Players Playing | P2 fully playable with asymmetric elements, both clients controlled | P2-01–05, CORE-01, CORE-04 | 5 |
| 3 | Spell Sync & Combos | All 6 elements implemented; cross-player combos fire and sync across clients | SPL-01–05, CMB-01–05, DSC-01–02 | 5 |
| 4 | Puzzle Rooms | Dedicated puzzle rooms with environmental interactables, timers, and combo solutions | PZL-01–08, NPC-03 | 5 |
| 5 | Bosses, NPCs & Narrative | Mini-bosses, final boss, NPCs, story intro/ending, enemy weaknesses | ENM-01–02, BOS-01–04, NPC-01–02, NPC-04–05, CORE-02 | 6 |

---

## Phase Details

### Phase 1: LAN Foundation

**Goal:** Two Phaser clients can connect to a dedicated Node.js server over LAN. Both players see each other's position moving in real time. Room transitions are synchronized.

**Requirements:** NET-01, NET-02, NET-03, NET-04, NET-05, NET-06, CORE-03

**Plans:** 5 plans

Plans:
- [ ] 01-01-PLAN.md — Game server bootstrap (game-server/ package, LobbyManager, GameRoom, socket.io handlers)
- [ ] 01-02-PLAN.md — Client networking types + RemoteInputComponent
- [ ] 01-03-PLAN.md — NetworkManager singleton (EventBus bridge, 20 Hz tick, config constants)
- [ ] 01-04-PLAN.md — LobbyScene UI (connect → lobby list → waiting room) + main.ts wiring
- [ ] 01-05-PLAN.md — GameScene integration (room transition sync, remote player spawn/update/remove, spell sync)

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
