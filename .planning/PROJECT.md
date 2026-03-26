# Mages Co-op

## What This Is

A 2-player LAN cooperative top-down wizard game built on a Phaser 3 + TypeScript codebase. Two players each control a mage with asymmetric element sets — one wields Fire, Earth, and Water; the other wields Ice, Wind, and Thunder. The core fun is combining spells mid-combat to trigger powerful combo effects, solving environmental puzzles that require cross-player thinking, and encountering bosses that have elemental weaknesses requiring coordinated strategy. Built for a college game event (3-4 months away), targeting ~15-minute play sessions with light narrative and comedy NPCs.

## Core Value

When two players discover a new spell combo that wrecks a tough enemy — that "we did it together" moment — is the reason this game exists.

## Requirements

### Validated

<!-- Capabilities confirmed by existing codebase -->

- ✓ Top-down Phaser 3 game loop with Arcade Physics — existing
- ✓ Tiled map integration (rooms, doors, chests, collision layers) — existing
- ✓ Player movement with state machine (idle, walk, hurt, death) — existing
- ✓ Enemy AI (spider random walk, wisp pulse, Drow boss) — existing
- ✓ Basic spell system: FireBolt, FireArea, FireBreath, EarthBolt, EarthWallPillar, WaterSpike — existing
- ✓ Element manager (active element switching via radial menu) — existing
- ✓ Mana system (pool, consumption, regen) — existing
- ✓ Spell-to-spell combo detection (Fire+Earth, Earth+FireArea, etc.) — existing
- ✓ Room-based level transitions with camera animation — existing
- ✓ HUD (health hearts, mana bar, element indicator) — existing
- ✓ Global event bus for decoupled scene communication — existing
- ✓ Runtime debug panel for live spell tuning — existing

### Active

<!-- New features to build for the event -->

**Networking / Multiplayer**
- [ ] NET-01: Two players can connect on LAN (dedicated server model)
- [ ] NET-02: Player positions, spell projectiles, and enemy states sync across clients
- [ ] NET-03: Both players see the same game state in real time with acceptable latency

**Second Player**
- [ ] P2-01: A second distinct player character exists in the game world
- [ ] P2-02: Player 1 is assigned Fire, Earth, Water elements; Player 2 has Ice, Wind, Thunder
- [ ] P2-03: Each player has independent health, mana, and element state

**Spell Completion (Ice, Wind, Thunder)**
- [ ] SPL-01: Ice spell(s) implemented (at least 1 projectile or area)
- [ ] SPL-02: Wind spell(s) implemented (at least 1 projectile or area)
- [ ] SPL-03: Thunder spell(s) implemented (at least 1 projectile or area)
- [ ] SPL-04: Each new spell has at least 1 cross-player combo with an existing element

**Combo System — Cross-Player**
- [ ] CMB-01: Spells from P1 and P2 can collide and trigger combo effects automatically
- [ ] CMB-02: At least 6 distinct cross-player combos exist (one per new element pairing)
- [ ] CMB-03: Combo journal/UI tracks which combos players have discovered

**Puzzle Rooms**
- [ ] PZL-01: Dedicated puzzle rooms exist (separate from combat rooms)
- [ ] PZL-02: Environmental interactables respond to single spells (e.g., water wets an object)
- [ ] PZL-03: Environmental interactables respond to spell combos (e.g., wet+lightning activates a device)
- [ ] PZL-04: Cooperative puzzles require both players to act simultaneously or in sequence
- [ ] PZL-05: At least 1 timed puzzle with a hard countdown timer
- [ ] PZL-06: Failing a timed puzzle spawns a hard enemy wave instead of a hard reset
- [ ] PZL-07: Sequence puzzles exist where element order matters

**Enemy & Boss Design**
- [ ] ENM-01: At least 2 new enemy types with elemental resistances/weaknesses
- [ ] BOS-01: At least 1 mini-boss per level with an elemental weakness
- [ ] BOS-02: A final boss that requires coordinated combo strategy to defeat
- [ ] BOS-03: Boss weak points are discoverable (via NPC hint, observation, or experimentation)

**Narrative & NPCs**
- [ ] NPC-01: NPCs exist in the world with dialogue (comedy/personality from the devs)
- [ ] NPC-02: Intro narrative sets the premise of the adventure
- [ ] NPC-03: At least 1 NPC hints at spell combos (for discovery guidance)
- [ ] NPC-04: An ending exists after the final boss is defeated

**Combo Discovery UX**
- [ ] DSC-01: Trial-and-error discovery works — combos fire automatically when spells collide
- [ ] DSC-02: In-game combo journal/UI tracks discovered combos

### Out of Scope

- Isometric perspective — staying top-down for speed and to reuse existing code
- Online multiplayer (internet) — LAN only for the event; networking complexity too high
- More than 2 players — keeping scope tight for the event build
- Character progression / XP / leveling — not needed for 15-min sessions
- All 6 elements fully symmetric per player — asymmetric split keeps combos meaningful
- Branching story / dialogue choices — light linear narrative only
- Mobile / controller support — keyboard on each LAN machine is sufficient

## Context

- **Existing codebase:** Phaser 3 + TypeScript Zelda-like with working player, enemies, rooms, state machines, and partial spell system. The networking layer (`src/networking/`) does not yet exist. The radial menu and element system are single-player only.
- **Timeline:** College event in ~3-4 months. Targeting a polished 15-minute experience with the core co-op loop working.
- **Team:** 2 developers; NPCs will carry jokes and personality from both.
- **Confirmed direction:** Top-down (not isometric despite some older doc references).
- **Player split:** P1 = Fire, Earth, Water / P2 = Ice, Wind, Thunder / All 6 in scope for the event build.
- **Failure design:** Timed puzzle failure → spawns enemy wave, not hard reset. Keeps momentum.

## Constraints

- **Tech stack:** Phaser 3 + TypeScript — no engine change
- **Timeline:** 3-4 months to college event
- **Team size:** 2 developers
- **Session length:** ~15 minutes per playthrough
- **Networking:** LAN only (dedicated server on third machine); no WebRTC/internet
- **Dependencies:** Spell combo system must exist before cross-player combos can be built

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Top-down (not isometric) | Reuses existing code; isometric would require reworking camera, collision, and sprites | — Pending |
| LAN co-op via dedicated server | Easier sync model than P2P; one machine hosts state | — Pending |
| Asymmetric elements (not same pool) | Forces real cooperation — P1 literally cannot do what P2 does | — Pending |
| Auto spell-collision combos | More intuitive than activation key; works with existing collision architecture | — Pending |
| Puzzle fail → enemy wave | More fun than reset; adds tension without hard-blocking players | — Pending |
| P1: Fire+Earth+Water / P2: Ice+Wind+Thunder | Natural elemental opposition; water+ice, fire+wind, earth+thunder have obvious combo potential | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-26 after initialization*
