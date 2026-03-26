# Requirements — Mages Co-op

## v1 Requirements (College Event Build)

### Networking (NET)

- [ ] **NET-01**: Player can enter server IP and port on a connect screen to join a LAN session
- [ ] **NET-02**: Both players must be connected before the game starts (lobby/wait screen)
- [ ] **NET-03**: Player 1's character position and state are visible on Player 2's screen in real time (and vice versa)
- [ ] **NET-04**: Spell projectiles cast by either player are visible on both screens
- [ ] **NET-05**: Enemy positions and health are synchronized — both players see the same enemy state
- [ ] **NET-06**: If one player disconnects, the game displays a reconnect/error message

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
