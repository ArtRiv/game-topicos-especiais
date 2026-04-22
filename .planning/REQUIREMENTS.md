# Requirements — Mages PvP

## v1.0 Requirements (College Event Build — Phase 1 Complete)

### Networking (NET) — ALL COMPLETE (Phase 1)

- [x] **NET-01**: Player can enter server IP on a connect screen to join a LAN session
- [x] **NET-02**: All players must be connected before the game starts (lobby/wait screen)
- [x] **NET-03**: Each player's position and state are visible on all other clients in real time
- [x] **NET-04**: Spell projectiles cast by any player are visible on all clients
- [x] **NET-05**: Room transitions are synchronized across all clients
- [x] **NET-06**: If a player disconnects mid-match, remaining clients are notified immediately (no freeze)

---

## v1.1 Requirements (PvP Team Deathmatch)

### Multi-Player Control (PLR) — ALL COMPLETE (Phase 2)

- [x] **PLR-01**: Each player controls their own character on their own machine via keyboard — no fixed role assignments
- [x] **PLR-02**: Each player has independent health and mana
- [x] **PLR-03**: Remote players are rendered on each client driven by network snapshots
- [x] **PLR-04**: Lobby supports N players with no hard cap enforced in code; teams are configured per lobby session

### HUD & Feedback (HUD) — Phase 2 Complete

- [x] **HUD-01**: Each player sees their own HP bar on their screen
- [ ] **HUD-02**: Player death is visually communicated on all clients (death animation, character removed)

### Spells — New Elements (SPL)

- [ ] **SPL-01**: At least one Ice spell implemented
- [ ] **SPL-02**: At least one Wind spell implemented
- [ ] **SPL-03**: At least one Thunder spell implemented
- [ ] **SPL-04**: Each new spell has config values (damage, mana cost, cooldown) in `config.ts`
- [ ] **SPL-05**: Element/spell system is designed so new elements can be added without refactoring core casting logic

### Player-vs-Player Combat (PVP)

- [ ] **PVP-01**: All players have access to all available spells (no per-player loadout restrictions in v1.1)
- [ ] **PVP-02**: Spells cast by any player can collide with and damage any opponent (cross-player hit detection)
- [ ] **PVP-03**: Client renders spell cast and movement immediately (client-side prediction)
- [ ] **PVP-04**: Host validates hit events and broadcasts confirmed damage + elimination to all clients
- [ ] **PVP-05**: Each client applies damage to the correct player only after receiving host confirmation
- [ ] **PVP-06**: Friendly fire is controlled by a configurable toggle (default: OFF)

### Match Loop (MTH)

- [ ] **MTH-01**: All players are loaded into the same scene before combat begins (synchronized match start)
- [ ] **MTH-02**: A player who reaches 0 HP is eliminated (death state, removed from active play)
- [ ] **MTH-03**: Win condition: last team standing (all opponents eliminated)
- [ ] **MTH-04**: Match-end screen is shown simultaneously on all clients with the result
- [ ] **MTH-05**: Players can return to the lobby from the match-end screen for a rematch
- [ ] **MTH-06**: Match flow is structured to support future modes without refactoring

### Scalability & Stability (SCL)

- [ ] **SCL-01**: A 5v5 match (10 players total) is the minimum stable baseline
- [ ] **SCL-02**: The system scales beyond 10 players with no code changes required
- [ ] **SCL-03**: No crash or freeze when any player disconnects mid-match
- [ ] **SCL-04**: All combat logic works correctly with multiple simultaneous players

### Network Performance (NETPERF) — Phase 02.1 COMPLETE

- [x] **NETPERF-01**: Position tick rate reduced to 20 Hz
- [x] **NETPERF-02**: No position messages sent when player state unchanged (dirty-checking)
- [x] **NETPERF-03**: Network debug metrics available
- [x] **NETPERF-04**: 3+ client test shows all tabs responsive with sub-second latency
- [x] **NETPERF-05**: Remote player interpolation uses delta-time

---

## v1.2 Requirements (Lobby & Game Start Flow)

Requirements for milestone v1.2. Each maps to roadmap phases.

### Foundation Cleanup (FND)

- [ ] **FND-01**: All Phaser scenes use consistent EVENT_BUS bind in create() and unbind in shutdown() — no listener leaks across scene transitions
- [ ] **FND-02**: Host detection is reactive — derived from lobby state, not a static boolean; updates automatically on host migration
- [ ] **FND-03**: All singleton managers (DataManager, InventoryManager, ElementManager) have reset() methods that restore clean state for rematch
- [ ] **FND-04**: WebRTC mesh can be torn down independently of the socket.io signaling connection — enabling rematch without full reconnect

### Lobby Management (LBY)

- [ ] **LBY-01**: Player can create a lobby with a custom name visible in the lobby list
- [ ] **LBY-02**: Player can browse available lobbies with player count, game mode, and a refresh button
- [ ] **LBY-03**: Player can join a lobby from the lobby list
- [ ] **LBY-04**: Lobby owner can set the game mode (1v1, 2v2, ... up to 10v10) before starting
- [ ] **LBY-05**: Each player can toggle their ready status; match cannot start until all players are ready and minimum player count is met
- [ ] **LBY-06**: Lobby owner can kick a player from the lobby
- [ ] **LBY-07**: Lobby owner can auto-balance teams (distribute players evenly) or shuffle teams randomly
- [ ] **LBY-08**: Players can self-assign to a team by clicking the team they want
- [ ] **LBY-09**: All lobby state changes (joins, leaves, team swaps, ready toggles, mode changes) update in real-time for all lobby members
- [ ] **LBY-10**: Lobby owner can set an optional password; joining players must enter the correct password

### Lobby Communication (COM)

- [ ] **COM-01**: Players can send and receive text chat messages within the lobby
- [ ] **COM-02**: Each player's ping/latency is visible to all lobby members

### Pre-Game Flow (PGF)

- [ ] **PGF-01**: After host starts the match, all clients transition to a loading screen showing map preview, player names by team, and game mode
- [ ] **PGF-02**: Match proceeds only when all clients report loaded (with a 15-second timeout fallback)
- [ ] **PGF-03**: Each map has predefined spawn points in Tiled data, tagged by team; server assigns players to spawn positions based on team and game mode
- [ ] **PGF-04**: Players are placed at their assigned spawn points with movement and spell casting locked during a 10-second countdown
- [ ] **PGF-05**: Camera performs a zoom-in effect on the player's spawn position during the countdown, pulling out to normal view on "GO"

### In-Match QoL (QOL)

- [ ] **QOL-01**: A kill feed displays recent elimination events ("X eliminated Y") in the top-right corner with auto-fade
- [ ] **QOL-02**: A server-authoritative match timer is visible to all players, counting down the remaining match time
- [ ] **QOL-03**: Eliminated players enter spectator mode — camera detaches and follows alive players, cycled with arrow keys
- [ ] **QOL-04**: Spectators see a "SPECTATING: [PlayerName]" overlay and cannot interact with the game

### Post-Match (PMT)

- [ ] **PMT-01**: When the match ends, all clients display a results screen showing winner/teams, eliminations, and match stats
- [ ] **PMT-02**: The host can click "Rematch" to return all connected players to the lobby with the same settings
- [ ] **PMT-03**: Lobby state persists across matches — lobby is not destroyed when a match starts

---

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

- **DEF-01**: Map auto-sizing by game mode (small/medium/big maps based on player count)
- **DEF-02**: AFK detection with auto-kick after timeout
- **DEF-03**: Team color tinting on player sprites for visual team identification

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Ranked matchmaking queue | Requires large concurrent player pool; college event has 20-50 players |
| Voice chat | Players are physically in the same room at the event |
| Mid-match player join | State sync too complex; matches are short (5-15 min) |
| Map voting system | Only valuable with 3+ maps; host picks mode, map auto-selected |
| Surrender / forfeit vote | Matches are short enough (15 min max) to finish naturally |
| Replay system | Massive engineering; spectator mode covers live experience |
| Custom game rules | Exponential test matrix; breaks balance assumptions |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NET-01 | Phase 1 (v1.0) | Complete |
| NET-02 | Phase 1 (v1.0) | Complete |
| NET-03 | Phase 1 (v1.0) | Complete |
| NET-04 | Phase 1 (v1.0) | Complete |
| NET-05 | Phase 1 (v1.0) | Complete |
| NET-06 | Phase 1 (v1.0) | Complete |
| PLR-01 | Phase 2 (v1.1) | Complete |
| PLR-02 | Phase 2 (v1.1) | Complete |
| PLR-03 | Phase 2 (v1.1) | Complete |
| PLR-04 | Phase 2 (v1.1) | Complete |
| HUD-01 | Phase 2 (v1.1) | Complete |
| NETPERF-01 | Phase 2.1 (v1.1) | Complete |
| NETPERF-02 | Phase 2.1 (v1.1) | Complete |
| NETPERF-03 | Phase 2.1 (v1.1) | Complete |
| NETPERF-04 | Phase 2.1 (v1.1) | Complete |
| NETPERF-05 | Phase 2.1 (v1.1) | Complete |
| SPL-01 | Phase 3 (v1.1) | Complete |
| SPL-02 | Phase 3 (v1.1) | Complete |
| SPL-03 | Phase 3 (v1.1) | Complete |
| SPL-04 | Phase 3 (v1.1) | Complete |
| SPL-05 | Phase 3 (v1.1) | Complete |
| PVP-01 | Phase 3 (v1.1) | Complete |
| FND-01 | Phase 6 (v1.2) | Pending |
| FND-02 | Phase 6 (v1.2) | Pending |
| FND-03 | Phase 6 (v1.2) | Pending |
| FND-04 | Phase 6 (v1.2) | Pending |
| LBY-01 | Phase 7 (v1.2) | Pending |
| LBY-02 | Phase 7 (v1.2) | Pending |
| LBY-03 | Phase 7 (v1.2) | Pending |
| LBY-04 | Phase 7 (v1.2) | Pending |
| LBY-05 | Phase 7 (v1.2) | Pending |
| LBY-06 | Phase 7 (v1.2) | Pending |
| LBY-07 | Phase 7 (v1.2) | Pending |
| LBY-08 | Phase 7 (v1.2) | Pending |
| LBY-09 | Phase 7 (v1.2) | Pending |
| LBY-10 | Phase 7 (v1.2) | Pending |
| COM-01 | Phase 7 (v1.2) | Pending |
| COM-02 | Phase 7 (v1.2) | Pending |
| PGF-01 | Phase 8 (v1.2) | Pending |
| PGF-02 | Phase 8 (v1.2) | Pending |
| PGF-03 | Phase 8 (v1.2) | Pending |
| PGF-04 | Phase 8 (v1.2) | Pending |
| PGF-05 | Phase 8 (v1.2) | Pending |
| QOL-01 | Phase 9 (v1.2) | Pending |
| QOL-02 | Phase 9 (v1.2) | Pending |
| QOL-03 | Phase 9 (v1.2) | Pending |
| QOL-04 | Phase 9 (v1.2) | Pending |
| PMT-01 | Phase 10 (v1.2) | Pending |
| PMT-02 | Phase 10 (v1.2) | Pending |
| PMT-03 | Phase 10 (v1.2) | Pending |

**Coverage:**
- v1.2 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0

---
*Requirements defined: 2026-04-21*
*Last updated: 2026-04-21 after v1.2 roadmap creation*
