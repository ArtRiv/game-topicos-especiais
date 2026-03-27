# Mages

## Current Milestone: v2.0 — PvP Event Multiplayer

**Goal:** Rebuild the game as a competitive PvP experience for the college event — players create accounts, form lobbies, pick game modes, and fight each other with elemental spells.

**Target features:**
- Google OAuth login (account per player, tied to Google email)
- Lobby creation & joining (session-based matchmaking)
- Multiple game modes: Battle Royale, 2v2 / 3v3 / 4v4 team vs team
- PvP arena gameplay (spell combat, player elimination)
- Ranking system + global leaderboard
- Spell progression / leveling (upgrade cooldown, mana, HP per account)

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

### Out of Scope

- PvE content — no enemies, no bosses, no puzzle rooms, no NPCs; full PvP pivot
- LAN-only mode — server is internet-accessible to support the college event
- Cooperative (co-op) game modes — PvP only for v2.0
- Branching narrative / story — no narrative content
- Mobile / controller support — keyboard per machine is sufficient
- More than 4v4 team size — keeps match design manageable

## Context

- **Existing codebase:** Phaser 3 + TypeScript top-down game with working player, state machines, and single-player spell system. No networking layer yet. The PvE content (enemies, bosses, puzzle rooms) will remain in git history but is not part of v2.0.
- **Pivot from v1.0:** v1.0 was a 2-player LAN co-op PvE design (planned but never executed). v2.0 is a full philosophy pivot to competitive PvP with accounts, lobbies, and progression.
- **Timeline:** College event in ~3-4 months.
- **Team:** 2 developers.
- **Server:** Internet-accessible central server (Node.js + socket.io) with persistent DB for accounts, ranking, and progression.
- **Auth:** Google OAuth — players use their Google email as their identity.

## Constraints

- **Tech stack:** Phaser 3 + TypeScript client — no engine change
- **Timeline:** ~3-4 months to college event
- **Team size:** 2 developers
- **Server:** Internet-facing Node.js server (not LAN-only); needs DB for persistent accounts
- **Auth:** Google OAuth only (no custom password auth — reduces complexity and security risk)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Top-down (not isometric) | Reuses existing code; isometric would require reworking camera, collision, and sprites | Confirmed |
| PvP instead of PvE | Event day experience — watching friends fight each other is more engaging than co-op vs enemies | Confirmed |
| Google OAuth for accounts | Reduces auth complexity; event attendees already have Google accounts | Confirmed |
| Internet-facing server (not LAN) | Event may have mixed network; central server is more reliable for multiple sessions | Confirmed |
| All 6 elements available to all players | PvP requires each player to have a full spell kit; asymmetric split only made sense for co-op | Confirmed |
| Persistent ranking + XP progression | Gives the event a metagame — players care about their rank across multiple matches | Confirmed |

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
*Last updated: 2026-03-27 — v2.0 PvP pivot; v1.0 co-op design fully discarded*
