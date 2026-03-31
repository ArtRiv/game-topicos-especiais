# Requirements — Mages PvP

## v1.0 Requirements (College Event Build — Phase 1 Complete)

### Networking (NET) — ✓ ALL COMPLETE (Phase 1)

- [x] **NET-01**: Player can enter server IP on a connect screen to join a LAN session
- [x] **NET-02**: All players must be connected before the game starts (lobby/wait screen)
- [x] **NET-03**: Each player's position and state are visible on all other clients in real time
- [x] **NET-04**: Spell projectiles cast by any player are visible on all clients
- [x] **NET-05**: Room transitions are synchronized across all clients
- [x] **NET-06**: If a player disconnects mid-match, remaining clients are notified immediately (no freeze)

---

## v1.1 Requirements (PvP Team Deathmatch)

### Multi-Player Control (PLR)

- [x] **PLR-01**: Each player controls their own character on their own machine via keyboard — no fixed role assignments (Player[i], not P1/P2)
- [x] **PLR-02**: Each player has independent health and mana
- [x] **PLR-03**: Remote players are rendered on each client driven by network snapshots (existing `RemoteInputComponent`)
- [x] **PLR-04**: Lobby supports N players with no hard cap enforced in code; teams are configured per lobby session

### Spells — New Elements (SPL)

- [ ] **SPL-01**: At least one Ice spell implemented (~3 spells per element target; start with 1, design for extensibility)
- [ ] **SPL-02**: At least one Wind spell implemented
- [ ] **SPL-03**: At least one Thunder spell implemented
- [ ] **SPL-04**: Each new spell has config values (damage, mana cost, cooldown) in `config.ts`
- [ ] **SPL-05**: Element/spell system is designed so new elements can be added without refactoring core casting logic

### Player-vs-Player Combat (PVP)

- [ ] **PVP-01**: All players have access to all available spells (no per-player loadout restrictions in v1.1)
- [ ] **PVP-02**: Spells cast by any player can collide with and damage any opponent (cross-player hit detection)
- [ ] **PVP-03**: Client renders spell cast and movement immediately (client-side prediction) without waiting for host confirmation
- [ ] **PVP-04**: Host validates hit events and broadcasts confirmed damage + elimination to all clients
- [ ] **PVP-05**: Each client applies damage to the correct player only after receiving host confirmation
- [ ] **PVP-06**: Friendly fire is controlled by a configurable toggle (default: OFF); if complex, friendly fire disabled by default

### Match Loop (MTH)

- [ ] **MTH-01**: All players are loaded into the same scene before combat begins (synchronized match start)
- [ ] **MTH-02**: A player who reaches 0 HP is eliminated (death state, removed from active play)
- [ ] **MTH-03**: Win condition: last team standing (all opponents eliminated)
- [ ] **MTH-04**: Match-end screen is shown simultaneously on all clients with the result
- [ ] **MTH-05**: Players can return to the lobby from the match-end screen for a rematch
- [ ] **MTH-06**: Match flow (Lobby → Match Start → Combat → Win Condition → Match End → Lobby) is structured to support future modes (battle royale, FFA) without refactoring

### HUD & Feedback (HUD)

- [x] **HUD-01**: Each player sees their own HP bar on their screen
- [ ] **HUD-02**: Player death is visually communicated on all clients (death animation, character removed)

### Scalability & Stability (SCL)

- [ ] **SCL-01**: A 5v5 match (10 players total) is the minimum stable baseline — no desync, freeze, or crash; this is a floor, not a ceiling
- [ ] **SCL-02**: The system scales beyond 10 players for stress testing with no code changes required; real performance limits are determined empirically
- [ ] **SCL-03**: No crash or freeze when any player disconnects mid-match (relies on existing disconnect detection)
- [ ] **SCL-04**: All combat logic (hits, damage, elimination) works correctly with multiple simultaneous players, not just 1v1

### Network Performance (NETPERF) — Phase 02.1 (INSERTED)

- [x] **NETPERF-01**: Position tick rate reduced to 20 Hz — per-client outbound bandwidth reduced by ~66% vs 60 Hz
- [x] **NETPERF-02**: No position messages sent when player state (x, y, direction, state, element) is unchanged since last send (dirty-checking)
- [x] **NETPERF-03**: Network debug metrics available: messages sent/sec, messages received/sec — togglable via config flag
- [ ] **NETPERF-04**: 10+ client test shows all clients responsive with sub-second latency (no multi-second delay on any client)
- [ ] **NETPERF-05**: Remote player interpolation uses delta-time — movement is smooth and animation/spell sync remain correct at 20 Hz
- [ ] **NETPERF-06**: Each client connects to the server via a single WebRTC data channel — no peer-to-peer mesh connections
- [ ] **NETPERF-07**: Server accepts and forwards WebRTC data channel messages using node-datachannel (SFU relay)
- [ ] **NETPERF-08**: All data channel messages (position, spell, transition) use MessagePack binary serialization instead of JSON
- [ ] **NETPERF-09**: Server batches outbound updates per tick (20 Hz) — one aggregated message per client per tick instead of forwarding each message individually
- [ ] **NETPERF-10**: Grid-based spatial interest management on server — nearby players receive full-rate updates, distant players receive throttled updates (~5 Hz)
- [ ] **NETPERF-11**: Server validates damage and player-eliminated events before broadcasting — no client can unilaterally declare damage on another player

---

## Out of Scope (v1.1)

- Cooperative puzzle rooms — deferred
- Bosses / final boss — deferred
- NPCs and narrative — deferred
- Combo journal UI — not in scope
- Per-player element/spell restrictions (loadouts, classes) — system designed for it but not enforced in v1.1
- Free-for-all / battle royale mode — MTH-06 enables it; not building the mode in v1.1
- Full multi-player HUD (all players' HP visible) — HUD shows own HP only in v1.1; expandable later
- WebRTC redesign — networking layer is complete; building on top only

---

## Traceability

| Req ID | Phase | Status |
|--------|-------|--------|
| NET-01 | Phase 1 | ✓ Complete |
| NET-02 | Phase 1 | ✓ Complete |
| NET-03 | Phase 1 | ✓ Complete |
| NET-04 | Phase 1 | ✓ Complete |
| NET-05 | Phase 1 | ✓ Complete |
| NET-06 | Phase 1 | ✓ Complete |
| PLR-01 | Phase 2 | Complete |
| PLR-02 | Phase 2 | Complete |
| PLR-03 | Phase 2 | Complete |
| PLR-04 | Phase 2 | Complete |
| HUD-01 | Phase 2 | Complete |
| SPL-01 | Phase 3 | Pending |
| SPL-02 | Phase 3 | Pending |
| SPL-03 | Phase 3 | Pending |
| SPL-04 | Phase 3 | Pending |
| SPL-05 | Phase 3 | Pending |
| PVP-01 | Phase 3 | Pending |
| PVP-02 | Phase 4 | Pending |
| PVP-03 | Phase 4 | Pending |
| PVP-04 | Phase 4 | Pending |
| PVP-05 | Phase 4 | Pending |
| PVP-06 | Phase 4 | Pending |
| MTH-02 | Phase 4 | Pending |
| HUD-02 | Phase 4 | Pending |
| SCL-04 | Phase 4 | Pending |
| MTH-01 | Phase 5 | Pending |
| MTH-03 | Phase 5 | Pending |
| MTH-04 | Phase 5 | Pending |
| MTH-05 | Phase 5 | Pending |
| MTH-06 | Phase 5 | Pending |
| SCL-01 | Phase 5 | Pending |
| SCL-02 | Phase 5 | Pending |
| SCL-03 | Phase 5 | Pending |


### Second Player (P2)

- [ ] **P2-01**: A second distinct player character (visually different from Player 1) exists in the game world
- [ ] **P2-02**: Player 1 is assigned Fire, Earth, and Water elements; Player 2 is assigned Ice, Wind, and Thunder
- [ ] **P2-03**: Player 2 has independent health, mana, and element switching state
- [ ] **P2-04**: Player 2 can be controlled from a separate keyboard on a separate machine
- [ ] **P2-05**: Both players share the same game world and room progression simultaneously

### Spells — New Elements (SPL)

- [ ] **SPL-01**: At least one Ice spell is implemented (projectile or area effect) for Player 2
- [ ] **SPL-02**: At least one Wind spell is implemented (projectile or area effect) for Player 2
- [ ] **SPL-03**: At least one Thunder spell is implemented (projectile or area effect) for Player 2
- [ ] **SPL-04**: Each new element has distinct visual identity (color-coded particles/effects)
- [ ] **SPL-05**: New spells have mana costs, cooldowns, and damage values defined in `config.ts`

### Cross-Player Combo System (CMB)

- [ ] **CMB-01**: When Player 1's spell and Player 2's spell collide, a combo effect triggers automatically
- [ ] **CMB-02**: At least 6 distinct cross-player combo effects exist (covering both players' element pairings)
- [ ] **CMB-03**: Combo effects deal more damage or have a greater area than individual spells
- [ ] **CMB-04**: A visual effect clearly communicates that a combo was triggered (distinct from regular hits)
- [ ] **CMB-05**: The server confirms the combo event so both clients execute the same effect at the same time

### Environmental Puzzle Rooms (PZL)

- [ ] **PZL-01**: At least 3 dedicated puzzle rooms exist in the game (clearly separate from combat rooms)
- [ ] **PZL-02**: Environmental interactable objects exist that respond to individual spell elements (e.g., water spell wets an object)
- [ ] **PZL-03**: Environmental interactable objects respond to spell combos (e.g., wet surface + thunder spell = device activated)
- [ ] **PZL-04**: At least 1 cooperative puzzle requires both players to act simultaneously to solve it
- [ ] **PZL-05**: At least 1 puzzle is sequence-based (elements must be applied in a specific order)
- [ ] **PZL-06**: At least 1 puzzle room has a hard countdown timer visible to both players
- [ ] **PZL-07**: Failing a timed puzzle spawns a hard enemy wave in the room instead of a hard reset
- [ ] **PZL-08**: Solving a puzzle has clear visual/audio feedback (door opens, device lights up, etc.)

### Enemy & Boss Design (ENM / BOS)

- [ ] **ENM-01**: At least 2 new enemy types exist with elemental resistances (resistant to some elements, weak to others)
- [ ] **ENM-02**: Enemy elemental weakness can be discovered through experimentation or NPC hints
- [ ] **BOS-01**: At least 1 mini-boss exists per game level with a telegraphed elemental weakness
- [ ] **BOS-02**: A final boss exists that requires coordinated cross-player combo strategy to defeat
- [ ] **BOS-03**: The final boss has multiple phases or attacks that change during the fight
- [ ] **BOS-04**: Defeating the final boss triggers the game's ending sequence

### Narrative & NPCs (NPC)

- [ ] **NPC-01**: An intro sequence presents the premise before gameplay starts
- [ ] **NPC-02**: At least 3 NPCs exist in the world with interactive dialogue
- [ ] **NPC-03**: At least 1 NPC hints at or explains a spell combo to the players
- [ ] **NPC-04**: NPCs have personality and comedy — written with the devs' voices
- [ ] **NPC-05**: An ending sequence plays after the final boss is defeated

### Discovery UX (DSC)

- [ ] **DSC-01**: A combo journal/UI exists that tracks which cross-player combos the players have discovered
- [ ] **DSC-02**: Newly discovered combos are added to the journal automatically on first trigger

### Core Game Loop (CORE)

- [ ] **CORE-01**: Both players share a health system — if either player dies, there is a penalty (respawn or game over)
- [ ] **CORE-02**: Players can progress through at least 2 levels with escalating enemy difficulty
- [ ] **CORE-03**: Room transitions work for both players simultaneously (camera sync)
- [ ] **CORE-04**: Players can switch active elements via the existing radial menu, with their selection visible to the other player on the HUD

---

## v2 Requirements (Post-Event, If Time Allows)

- "Ghost preview" of ally's active charging spell shown on screen
- Controller/gamepad support
- AI companion stub for solo testing sessions
- 3+ levels instead of 2
- More than 6 cross-player combos
- Additional NPC dialogue and lore
- Leaderboard / score system for the event

---

## Out of Scope

- Isometric perspective — staying top-down; isometric requires reworking camera, collision, and all assets
- Internet multiplayer — LAN only; online netcode is a separate engineering effort
- More than 2 players — scope control for the 3-4 month deadline
- Character progression / XP / leveling — 15-min sessions don't benefit from this
- Branching dialogue / dialogue choices — linear light narrative only
- Mobile or controller support (v1) — keyboard per machine is sufficient for the event

---

## Traceability

| Req ID | Phase | Status |
|--------|-------|--------|
| NET-01 to NET-06 | Phase 1 | — |
| P2-01 to P2-05 | Phase 2 | — |
| SPL-01 to SPL-05 | Phase 3 | — |
| CMB-01 to CMB-05 | Phase 3 | — |
| PZL-01 to PZL-08 | Phase 4 | — |
| ENM-01 to ENM-02 | Phase 5 | — |
| BOS-01 to BOS-04 | Phase 5 | — |
| NPC-01 to NPC-05 | Phase 4–5 | — |
| DSC-01 to DSC-02 | Phase 3–4 | — |
| CORE-01 to CORE-04 | Phase 1–2 | — |
