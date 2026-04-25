# Mages

## Current Milestone: v1.2 — Match Lifecycle & Event Polish

**Goal:** Turn the working PvP foundation into a tournament-grade experience for the college event — a synchronized match lifecycle (loading → countdown → active), a configurable host-only lobby (formats, maps, ready-up), and the in-match feedback loop (kill feed, damage numbers, name tags, results screen) that crowd-driven competitive play needs.

**Target features:**
- Match lifecycle FSM: LOBBY → LOADING → COUNTDOWN → ACTIVE
- Pre-match loading screen with player list + map preview (all-clients sync barrier)
- Match intro: spawn lock + camera zoom-in + 3-2-1-FIGHT countdown
- Host-only lobby configuration: match format selector (1v1 → 10v10) + map selection
- Extensible single-config-object architecture (future-proof: time limit, friendly fire, spell modifiers)
- Ready-up system (host start gated on all-ready + min count)
- AFK detection + one-click host kick
- In-match feedback: kill feed, floating damage numbers, name tags + HP bars overhead, match timer, ping indicator
- Post-match results screen (winner, per-player kills/damage, MVP)
- Spectator mode after elimination (free cam or follow surviving player)
- Reconnect grace window (15s slot hold)

## What This Is

A competitive top-down wizard PvP game built on Phaser 3 + TypeScript. Players at the event create an account with their Google email, join or create a lobby, choose a game mode (Battle Royale or team vs team), and fight using asymmetric elemental spells — Fire, Earth, Water, Ice, Wind, Thunder. The core loop is spell combat: cast, dodge, combo, and outplay opponents. A persistent ranking system and spell progression make each session matter beyond the single match. Built for a college game event, targeting quick matches with instant replayability.

## Core Value

When a player lands a perfectly timed spell combo that eliminates an opponent in front of a crowd — that "I outplayed everyone" moment — is the reason this game exists.

## Requirements

### Validated

<!-- Capabilities confirmed by existing codebase -->

- ✓ Top-down Phaser 3 game loop with Arcade Physics — existing
- ✓ Top-down Phaser 3 game loop with Arcade Physics — existing
- ✓ Tiled map integration (rooms, doors, chests, collision layers) — existing
- ✓ Player movement with state machine (idle, walk, hurt, death) — existing
- ✓ Basic spell system: FireBolt, FireArea, FireBreath, EarthBolt, EarthWallPillar, WaterSpike — existing
- ✓ Element manager (active element switching via radial menu) — existing
- ✓ Mana system (pool, consumption, regen) — existing
- ✓ HUD (health hearts, mana bar, element indicator) — existing
- ✓ Global event bus for decoupled scene communication — existing
- ✓ Runtime debug panel for live spell tuning — existing

### Active

<!-- New features to build for v2.0 PvP event -->

**Authentication & Accounts**
- [ ] AUTH-01: Players can log in with their Google account (Google OAuth)
- [ ] AUTH-02: Each player has a persistent account tied to their Google email
- [ ] AUTH-03: Account stores player name, rank, level, and spell stats

**Lobby & Matchmaking**
- [ ] LBY-01: A player can create a lobby session from the main menu
- [ ] LBY-02: Other players can join a lobby using a lobby code or session list
- [ ] LBY-03: Lobby owner can choose the game mode before starting
- [ ] LBY-04: All players in lobby see each other before the match starts

**Game Modes**
- [ ] GM-01: Battle Royale mode — all players fight, last mage standing wins
- [ ] GM-02: Team vs Team modes — 2v2, 3v3, and 4v4 supported
- [ ] GM-03: Team assignment is shown to all players at match start

**PvP Gameplay**
- [ ] PVP-01: Multiple player characters exist in the same arena simultaneously
- [ ] PVP-02: Player spells deal damage to other players (not enemies)
- [ ] PVP-03: Eliminated players are removed from the match; last standing (or team) wins
- [ ] PVP-04: All 6 elements available to players (Fire, Earth, Water, Ice, Wind, Thunder)
- [ ] PVP-05: Match results (winner, placements) sent to server for ranking update

**Ranking & Leaderboard**
- [ ] RNK-01: Each player has a rank score that updates after every match
- [ ] RNK-02: Wins increase rank score; losses decrease it
- [ ] RNK-03: A global leaderboard shows top-ranked players
- [ ] RNK-04: Players can view their own current rank and score

**Spell Progression & Leveling**
- [ ] PRG-01: Players earn XP after each match (more for wins / kills)
- [ ] PRG-02: Accumulating XP levels up the player's account
- [ ] PRG-03: Level-ups grant upgrade points to spend on spell stats
- [ ] PRG-04: Upgradeable stats include: spell cooldown, max mana, max HP
- [ ] PRG-05: Upgraded stats are applied to the player in every subsequent match

## Past Milestones

**v1.0 — College Event Build (LAN Foundation)** — shipped Phase 1 (NET-01..06): WebRTC P2P signaling, lobby, remote player sync, spell relay.

**v1.1 — PvP Team Deathmatch** — shipped Phases 2 → 6: multi-player control, asymmetric elements, Ice/Wind/Thunder spells, host-authoritative damage, full match loop (start → fight → win/lose → rematch), foundation cleanup (listener leaks, mesh teardown, singleton resets).

- Cooperative puzzle rooms — deferred
- Bosses / final boss — deferred
- NPCs and narrative — deferred
- Combo journal UI — not in scope
- Isometric perspective — staying top-down for speed and to reuse existing code
- Full WebRTC redesign — networking layer is complete and working; build on top of it
- Character progression / XP / leveling — not needed for event sessions
- Mobile / controller support — keyboard per machine is sufficient

## Context

- **Existing codebase:** Phaser 3 + TypeScript top-down game with player, enemies, rooms, state machines, and spell system. WebRTC P2P networking fully implemented in `src/networking/` — socket.io signaling, reliable/unreliable data channels, LobbyScene, remote player spawn/sync, spell relay, fast disconnect detection.
- **Timeline:** College event in ~3 months. Targeting a playable PvP experience with multiple match sizes.
- **Team:** 2 developers.
- **Pivot:** Project direction changed from 2-player co-op to N-player team PvP. Phases 2–5 of v1.0 roadmap are obsolete and replaced by v1.1 roadmap.
- **Player split:** P1 = Fire, Earth, Water / P2 = Ice, Wind, Thunder / P3+ = assigned from combined pool or duplicated elements.
- **Match size:** No hard cap — 1v1, 2v2, 3v3, 4v4, 5v5+ all supported; empirically test WebRTC mesh limits.

## Constraints

- **Tech stack:** Phaser 3 + TypeScript — no engine change
- **Timeline:** ~3 months to college event
- **Team size:** 2 developers
- **Session length:** ~15 minutes per match
- **Networking:** WebRTC P2P via socket.io signaling (LAN); architecture complete
- **Match size:** No predefined cap — scale until performance degrades

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Top-down (not isometric) | Reuses existing code | Confirmed |
| WebRTC P2P via socket.io signaling | Lower latency than relay server; direct peer communication | Implemented (Phase 1) |
| Asymmetric elements (not same pool) | Forces real PvP variety; each player has distinct identity | Confirmed |
| Host-authoritative damage only | Reduces desync without full server sim; simple for event scale | Confirmed |
| No hard player cap | Test WebRTC mesh limits empirically rather than constrain prematurely | Confirmed |
| Auto spell-collision combos | More intuitive than activation key; works with existing collision architecture | Confirmed |

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
*Last updated: 2026-04-24 — v1.2 milestone started (Match Lifecycle & Event Polish)*
