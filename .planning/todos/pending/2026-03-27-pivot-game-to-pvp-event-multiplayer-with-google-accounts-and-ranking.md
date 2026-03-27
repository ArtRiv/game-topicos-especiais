---
created: 2026-03-27T01:48:06.137Z
title: Pivot game to PvP event multiplayer with Google accounts and ranking
area: planning
files: []
---

## Problem

The current game design is a 2-player LAN co-op PvE (cooperative vs enemies). A new direction has been proposed that would fully replace the PvE philosophy with a PvP multiplayer game designed for a live event.

The new vision:
- Multiple players at the event competing against each other simultaneously
- Various game modes: battle royale (last mage standing), team vs team (2v2, 3v3, 4v4, etc.)
- A central persistent server (not LAN-only) that handles all event sessions
- Player accounts tied to Google email (OAuth login)
- Lobby creation + join flow: one player creates a lobby, others join
- Game mode selection inside the lobby before match starts
- Ranking system tied to match results (ELO or points)
- Character progression / leveling: players level up their spell stats (lower cooldown on FireBolt, more max mana, more max HP, etc.)
- No PvE content — no enemies, no bosses, no puzzle rooms, no NPCs

## Solution

This is a full game philosophy pivot. It requires:

1. **Rewrite PROJECT.md** — new core value, new requirements, removed PvE requirements
2. **Rewrite REQUIREMENTS.md** — replace NET/P2/PZL/ENM/BOS/NPC/DSC/CMB sections with PvP-oriented requirements (lobby, matchmaking, game modes, ranking, progression)
3. **Rewrite ROADMAP.md** — new phases entirely:
   - Phase 1: Auth (Google OAuth) + Account system + persistent backend
   - Phase 2: Lobby system + matchmaking + game mode selection
   - Phase 3: PvP arena gameplay (spell-based combat, player vs player hitboxes, elimination)
   - Phase 4: Game modes (Battle Royale, Team vs Team variants)
   - Phase 5: Ranking system + leaderboard
   - Phase 6: Spell progression / leveling system
4. **Architecture change** — from LAN dedicated server to a persistent internet-accessible server with auth, sessions, accounts, and DB (e.g., PostgreSQL or Firebase)
5. **Tech additions likely needed** — Google OAuth (Passport.js or Firebase Auth), persistent DB, HTTP API on top of Socket.io

Consider running `/gsd-new-milestone` or a full `/gsd-new-project` reset after confirming the pivot.

## Notes

- All existing ROADMAP.md phases (1–5) become obsolete
- The existing Phaser 3 + TypeScript client can be reused — engine stays, game world philosophy changes
- Spell system can be reused and extended for PvP balance
- The in-progress Phase 1 discussion (LAN Foundation CONTEXT.md) should be discarded
