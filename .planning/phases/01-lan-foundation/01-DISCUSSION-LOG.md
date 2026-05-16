# Phase 1: LAN Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 01 — LAN Foundation

---

## Gray Areas Presented

The following areas were identified and presented for discussion:

1. **Lobby & IP Discovery** — Manual IP entry vs LAN broadcast discovery; wait screen UX
2. **Player Role Assignment** — How P1/P2 roles are determined
3. **Remote Player Visualization** — Ghost rendering approach for other clients
4. **Room Transition Sync** — Who triggers, what if one player is busy

---

## Discussion Log

### Lobby & IP Discovery

**Q:** Which areas do you want to discuss for Phase 1 — LAN Foundation?

**A (free text):** "I want the player to be able to create a lobby, like in most games, and then this lobby appears for the other players that are looking for lobbies, then the users can join this lobby"

**Captured:** Lobby-based connection flow (create → list → join), not raw IP-per-session entry.

---

### Player Role Assignment

**Q:** How are Player 1 / Player 2 roles assigned?

**Options presented:**
- Creator = P1, Joiner = P2 (Recommended)
- Players choose role in lobby
- Server assigns randomly

**A (free text):** "The game now is going to be pvp focused so I think the players can choose role in lobby"

**Note:** This response introduced a significant design direction change. Flagged for clarification.

---

### PvP Direction Clarification

**Q:** When you said 'PvP focused' — what did you mean for the game direction?

**Options presented:**
- Fully PvP — players fight each other
- PvP elements added to the co-op game
- Still co-op — just wanted role choice in lobby

**Selected:** Fully PvP — players fight each other

**Impact:** This is a full project pivot from the original 2-player co-op vision. Flagged scope change.

---

### PvP Arena Design

**Q:** In PvP, do both players share the same rooms/map?

**Options presented:**
- Shared map — same rooms (Recommended for Phase 1)
- Single arena room — no map navigation
- Separate maps with portal interaction

**A (free text):** "Now the game is going to work like this: You can create a lobby and select a game mode, like if there's 6 people in the lobby the host could choose to make it a 3v3, or if there's two a 1v1, or even more players like a 5v5. Something like that."

**Note:** User expanded scope to N-player team PvP (dynamic modes). Flagged as project-level scope change requiring roadmap rebuild.

---

### Event Scope

**Q:** What's the target for the college event build?

**Options presented:**
- 2-player 1v1 PvP — college event scope
- Redesign for N-player team PvP — full pivot
- Let me reconsider the project scope first

**Selected:** Redesign for N-player team PvP — full pivot

**Captured:** Full pivot confirmed. Roadmap needs to be rebuilt after Phase 1.

---

### PvP Core Loop

**Q:** What is the core PvP win condition and loop?

**Options presented:**
- Team deathmatch — last team standing wins (Recommended)
- Objective-based — capture zones, carry the flag, etc.
- Other

**Selected:** Team deathmatch — last team standing wins

---

### Player Count / Dynamic Modes

**Q:** How many players should the college event build support?

**Options presented:**
- Dynamic modes (Recommended) — host picks based on players in lobby
- Fixed 1v1 only
- Fixed team size — pick the max

**Selected:** Dynamic modes (Recommended) — host picks based on players in lobby

---

### Remote Player Visualization

**Q:** How should remote players (other clients) look on your screen?

**Options presented:**
- Color-tinted sprite per player (Recommended)
- Same sprite, no visual distinction
- Distinct character per player

**Selected:** Color-tinted sprite per player (Recommended)

---

## Deferred Ideas Captured

- N-player redesign of ROADMAP.md Phases 2–5 — full rebuild needed
- Dynamic mode selection UX polish (auto-suggest, mode voting)
- Matchmaking / skill-based pairing
- Spectator mode
- Original co-op content (puzzle rooms, final boss, NPC combo hints)

---

*Phase: 01-lan-foundation*
*Log created: 2026-03-27*
