# Roadmap — Mages PvP

## Milestones

- :white_check_mark: **v1.0 MVP** - Phase 1 (shipped 2026-03-30)
- :white_check_mark: **v1.1 PvP Team Deathmatch** - Phases 2-5 (shipped)
- :construction: **v1.2 Lobby & Game Start Flow** - Phases 6-10 (in progress)
- :clipboard: **v2.0 PvP Event Multiplayer** - Planned

## Phases

<details>
<summary>v1.0 MVP (Phase 1) - SHIPPED 2026-03-30</summary>

### Phase 1: LAN Foundation
**Goal**: WebRTC P2P networking — players can connect, form a lobby, see each other move and cast spells in real time
**Status**: Complete
**Requirements**: NET-01, NET-02, NET-03, NET-04, NET-05, NET-06
**Plans**: 5 plans — all complete

</details>

<details>
<summary>v1.1 PvP Team Deathmatch (Phases 2-5) - SHIPPED</summary>

### Phase 2: Multi-Player Control
**Goal**: Every player controls their own mage on their own machine; remote players render correctly; lobby supports N-player teams
**Status**: Complete
**Requirements**: PLR-01, PLR-02, PLR-03, PLR-04, HUD-01
**Plans**: 4 plans — all complete

### Phase 02.1: Network Stability & Performance (INSERTED)
**Goal**: Networking is stable and performant with 3+ clients — sub-second latency, smooth interpolation
**Status**: Complete
**Requirements**: NETPERF-01, NETPERF-02, NETPERF-03, NETPERF-04, NETPERF-05
**Plans**: 2 plans — all complete

### Phase 3: New Spells
**Goal**: Ice, Wind, Thunder spells playable; spell system extensible without core changes
**Status**: Complete
**Requirements**: SPL-01, SPL-02, SPL-03, SPL-04, SPL-05, PVP-01

### Phase 4: PvP Combat
**Goal**: Cross-player hit detection; host-authoritative damage; client-side prediction; elimination
**Status**: Complete
**Requirements**: PVP-02, PVP-03, PVP-04, PVP-05, PVP-06, MTH-02, HUD-02, SCL-04

### Phase 5: Match Loop & Scalability
**Goal**: Full match loop (lobby -> combat -> match-end -> lobby); 5v5 minimum stable baseline
**Status**: Complete
**Requirements**: MTH-01, MTH-03, MTH-04, MTH-05, MTH-06, SCL-01, SCL-02, SCL-03

</details>

---

### :construction: v1.2 Lobby & Game Start Flow (In Progress)

**Milestone Goal:** Build the complete lobby-to-game-start pipeline — players can create/browse/join lobbies, configure game modes, manage teams, and launch into matches with pre-game flow, in-match QoL, and post-match rematch.

**Phase Numbering:**
- Integer phases (6, 7, 8, 9, 10): Planned milestone work
- Decimal phases (e.g. 7.1): Urgent insertions if needed

- [ ] **Phase 6: Foundation Cleanup** - Fix critical architectural debt (listener leaks, host detection, singleton resets, mesh lifecycle) before feature work
- [ ] **Phase 7: Lobby Enhancements** - Full-featured lobby with game mode selection, ready-up, kick, teams, chat, password, ping
- [ ] **Phase 8: Pre-Game Flow & Spawn System** - Loading screen, spawn point placement, countdown with movement lock, camera zoom-in
- [ ] **Phase 9: In-Match QoL** - Kill feed, match timer, spectator mode for eliminated players
- [ ] **Phase 10: Post-Match & Rematch** - Results screen, quick rematch, lobby persistence across matches

## Phase Details

### Phase 6: Foundation Cleanup
**Goal**: The game architecture is clean enough to support adding new scenes and features without cascading bugs from listener leaks, stale singletons, broken host detection, or coupled mesh/socket lifecycle
**Depends on**: Phase 5
**Requirements**: FND-01, FND-02, FND-03, FND-04
**Success Criteria** (what must be TRUE):
  1. Transitioning between scenes multiple times produces no duplicate event listeners — verified by checking EVENT_BUS listener count before and after scene restarts
  2. When the original host disconnects, the new host's client automatically gains host privileges (kick, start match) without any page reload or manual action
  3. After a match ends and players return to lobby, all game state (health, mana, element selection, inventory) is fully reset — a second match starts with clean defaults
  4. Players can return to the lobby after a match without a full WebRTC reconnect — the signaling connection stays alive while the mesh is torn down and rebuilt for the next match
**Plans**: TBD

### Phase 7: Lobby Enhancements
**Goal**: Players have a complete lobby experience — create, browse, join, configure game mode, manage teams, ready up, chat, and control access with passwords
**Depends on**: Phase 6
**Requirements**: LBY-01, LBY-02, LBY-03, LBY-04, LBY-05, LBY-06, LBY-07, LBY-08, LBY-09, LBY-10, COM-01, COM-02
**Success Criteria** (what must be TRUE):
  1. A player can create a named lobby and another player can find it in the lobby browser, see its player count and game mode, and join it
  2. The lobby owner can select a game mode (1v1 through 10v10), and the match cannot start until the minimum player count is met and all players have toggled ready
  3. Players can self-assign to teams, the host can kick players, and the host can auto-balance or shuffle teams — all changes appear instantly for every lobby member
  4. Players can send and receive text chat messages in the lobby, and each player's ping latency is visible to all members
  5. The lobby owner can set an optional password; players attempting to join a password-protected lobby must enter the correct password
**Plans**: TBD
**UI hint**: yes

### Phase 8: Pre-Game Flow & Spawn System
**Goal**: After the host starts a match, all players see a loading screen, get placed at team-appropriate spawn points, and experience a countdown before combat begins
**Depends on**: Phase 7
**Requirements**: PGF-01, PGF-02, PGF-03, PGF-04, PGF-05
**Success Criteria** (what must be TRUE):
  1. After the host clicks start, all clients transition to a loading screen that shows the map preview, player names grouped by team, and the selected game mode
  2. The match does not begin until all clients report loaded (or a 15-second timeout elapses for unresponsive clients)
  3. Each player spawns at a team-appropriate predefined spawn point on the map — no two players share the same position
  4. During the 10-second countdown, players cannot move or cast spells; the camera zooms in on the player's spawn and pulls out to normal view on "GO"
**Plans**: TBD
**UI hint**: yes

### Phase 9: In-Match QoL
**Goal**: Eliminated players and spectators have a good experience; all players have essential match information (kill feed, timer) visible during gameplay
**Depends on**: Phase 8
**Requirements**: QOL-01, QOL-02, QOL-03, QOL-04
**Success Criteria** (what must be TRUE):
  1. When a player eliminates another, a "X eliminated Y" message appears in the top-right corner of all clients and fades out after a few seconds
  2. A server-authoritative match timer counts down and is visible to all players — when it reaches zero, the match ends
  3. An eliminated player's camera detaches from their character and follows an alive player; pressing arrow keys cycles between alive players
  4. Spectators see a "SPECTATING: [PlayerName]" overlay and cannot move, cast spells, or interact with the game world
**Plans**: TBD
**UI hint**: yes

### Phase 10: Post-Match & Rematch
**Goal**: After a match ends, players see results and can quickly rematch without losing their lobby
**Depends on**: Phase 9
**Requirements**: PMT-01, PMT-02, PMT-03
**Success Criteria** (what must be TRUE):
  1. When the match ends, all clients display a results screen showing the winning player/team, individual elimination counts, and match duration
  2. The host can click "Rematch" and all connected players return to the lobby with the same game mode and team settings preserved
  3. The lobby is not destroyed when a match starts — it persists so players return to the same lobby after each match without needing to recreate or rejoin
**Plans**: TBD
**UI hint**: yes

---

## Progress

**Execution Order:**
Phases execute in numeric order: 6 -> 7 -> 8 -> 9 -> 10

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. LAN Foundation | v1.0 | 5/5 | Complete | 2026-03-30 |
| 2. Multi-Player Control | v1.1 | 4/4 | Complete | 2026-03-31 |
| 2.1. Network Stability | v1.1 | 2/2 | Complete | - |
| 3. New Spells | v1.1 | -/- | Complete | - |
| 4. PvP Combat | v1.1 | -/- | Complete | - |
| 5. Match Loop & Scalability | v1.1 | -/- | Complete | - |
| 6. Foundation Cleanup | v1.2 | 0/? | Not started | - |
| 7. Lobby Enhancements | v1.2 | 0/? | Not started | - |
| 8. Pre-Game Flow & Spawn | v1.2 | 0/? | Not started | - |
| 9. In-Match QoL | v1.2 | 0/? | Not started | - |
| 10. Post-Match & Rematch | v1.2 | 0/? | Not started | - |

---

## Coverage (v1.2)

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | 6 | Pending |
| FND-02 | 6 | Pending |
| FND-03 | 6 | Pending |
| FND-04 | 6 | Pending |
| LBY-01 | 7 | Pending |
| LBY-02 | 7 | Pending |
| LBY-03 | 7 | Pending |
| LBY-04 | 7 | Pending |
| LBY-05 | 7 | Pending |
| LBY-06 | 7 | Pending |
| LBY-07 | 7 | Pending |
| LBY-08 | 7 | Pending |
| LBY-09 | 7 | Pending |
| LBY-10 | 7 | Pending |
| COM-01 | 7 | Pending |
| COM-02 | 7 | Pending |
| PGF-01 | 8 | Pending |
| PGF-02 | 8 | Pending |
| PGF-03 | 8 | Pending |
| PGF-04 | 8 | Pending |
| PGF-05 | 8 | Pending |
| QOL-01 | 9 | Pending |
| QOL-02 | 9 | Pending |
| QOL-03 | 9 | Pending |
| QOL-04 | 9 | Pending |
| PMT-01 | 10 | Pending |
| PMT-02 | 10 | Pending |
| PMT-03 | 10 | Pending |

**28/28 v1.2 requirements mapped**
