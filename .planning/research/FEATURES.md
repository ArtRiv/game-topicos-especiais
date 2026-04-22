# Feature Research: v1.2 Lobby & Game Start Flow

**Domain:** Competitive multiplayer lobby UX, pre-game flow, in-match QoL for browser-based PvP arena
**Researched:** 2026-04-21
**Confidence:** HIGH (established multiplayer game design patterns; training data only -- no web search available)

> **Scope:** Features NEW to v1.2 only. The following already exist and are NOT covered:
> - WebRTC P2P lobby with join/create (basic version in `lobby-scene.ts`)
> - Remote player spawn and sync
> - Spell combat system (6 elements)
> - HUD with HP/mana/element indicator (`ui-scene.ts`)
> - Team assignment (host-only, Team A/B buttons)
>
> This research covers what needs to be ADDED or UPGRADED on top of that foundation.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any competitive multiplayer lobby. Missing these = product feels broken or amateurish.

| Feature | Why Expected | Complexity | Depends On (Existing) |
|---------|--------------|------------|----------------------|
| **Lobby browser with refresh** | Players who aren't given a code need to discover games; current lobby list exists but lacks refresh UX and filtering | LOW | Existing `sendLobbyList()` + `lobby:list` socket event |
| **Lobby name / custom title** | Distinguishes lobbies in the list ("Arthur's 3v3" vs "Player's lobby"); current code uses host name only | LOW | Existing lobby create flow |
| **Private lobbies with password** | Prevents unwanted joiners at an event where everyone is on the same LAN | LOW | Existing `sendLobbyJoin()` needs password param |
| **Game mode selection (1v1 to 10v10)** | Host must choose format before starting; current `Lobby.mode` exists as nullable string but no UI to set it | LOW | Existing `sendLobbySetMode()` is already wired |
| **Ready-up toggle per player** | Standard pre-match confirmation; prevents host from starting before everyone is set | LOW | New field on `PlayerInfo` |
| **Kick player (host-only)** | Remove AFK or unwanted players from lobby | LOW | New socket event |
| **Auto-balance / shuffle teams** | Quickly distribute players into equal teams without manual assignment for every player | LOW | Existing team assignment buttons |
| **Real-time lobby state (joins, leaves, team swaps)** | Lobby must update for all players when any change happens; partially exists via `lobby:updated` | LOW | Existing event bus wiring |
| **Pre-game loading screen** | Shows map preview, player names, game mode while assets load; current flow jumps from lobby to preload to game with no intermediate screen | MEDIUM | Existing `PreloadScene` |
| **Match countdown (3-2-1 or 10s)** | Standard tension builder; prevents unfair early engagement; movement must be locked during countdown | LOW | New overlay in game scene |
| **Spawn point system per map** | Players must appear at defined positions, not stacked on top of each other; current spawn is ad-hoc | MEDIUM | Existing map/tileset system |
| **Match timer (visible clock)** | Players need to know how much time remains; standard in every competitive game | LOW | New HUD element |
| **Kill feed** | On-screen log of "X eliminated Y" events; genre-standard for competitive games; provides crowd spectacle value | LOW | Existing event bus (damage/elimination events) |
| **Quick rematch** | After match ends, players want to play again without re-creating lobby; current `GameOverScene` only has Continue/Quit | LOW | Existing lobby infrastructure |

### Differentiators (Competitive Advantage)

Features that enhance the college event experience beyond minimum expectations.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Spectator mode** | Eliminated players watch remaining combat instead of staring at a death screen; critical for crowd engagement at a college event | MEDIUM | Camera follows action, no input, UI overlay shows player names |
| **Ping indicators in lobby** | Shows connection quality per player; helps identify potential laggers before match starts on LAN | MEDIUM | Requires RTT measurement over WebRTC data channels |
| **AFK detection** | Auto-kicks players who idle too long in lobby (30s no input) or in-match (15s no movement) | LOW | Timer + input listener; emit warning then kick |
| **Lobby chat** | Text messages between lobby members for coordination; helpful when players are at different stations | LOW | Simple text relay over existing socket connection |
| **Camera zoom-in on spawn** | Dramatic camera effect at match start: starts zoomed in on player, pulls out to normal view during countdown | LOW | Phaser camera zoom tween |
| **Movement lock during countdown** | Players see the arena but cannot move until "GO"; prevents unfair positioning | LOW | Input suppression flag |
| **Map auto-sizing by game mode** | 1v1 uses a small arena, 5v5 uses a large arena; prevents empty-feeling maps or cramped fights | MEDIUM | Multiple map configs tied to mode selection |
| **Team color tinting on player sprites** | Visual team identification beyond the HUD; Team A = blue tint, Team B = red tint on character sprites | LOW | Phaser sprite tint |

### Anti-Features (Do NOT Build These)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Ranked matchmaking queue** | "Match me with similar skill" | Requires large concurrent player pool; college event has 20-50 players; queue times would be unbearable | Use lobby browser; let players self-organize |
| **Voice chat** | "Talk to teammates" | Complex WebRTC audio channel; players are physically in the same room at the event | Players talk in person; add lobby chat text if needed |
| **Mid-match player join** | "Let late players jump in" | State sync for a player joining an active match is extremely complex; unfair spawn advantage/disadvantage | Players wait for next match; matches are short (5-15 min) |
| **Map voting system** | "Let players choose the map" | Only adds value with 3+ maps; over-engineers the lobby flow for v1.2 scope | Host picks mode; map is auto-selected based on mode/player count |
| **Surrender / forfeit vote** | "End hopeless matches early" | Complex voting UX; matches are short enough (15 min max) to finish naturally | Match timer handles stalemates |
| **Replay system** | "Watch the match again" | Requires recording all game state at tick level; massive engineering for a non-core feature | Spectator mode covers the live experience |
| **Custom game rules** | "Adjust HP, mana, spell cooldowns per lobby" | Exponential test matrix; balance becomes impossible to reason about | Fixed balanced settings; debug panel exists for dev testing |

---

## Feature Dependencies

```
[Lobby Browser Enhancement]
    requires: existing lobby:list socket event (DONE)
    requires: lobby name field on Lobby type (NEW)

[Private Lobbies]
    requires: password field on Lobby type (NEW)
    requires: password input on join flow (NEW)

[Game Mode Selection UI]
    requires: existing sendLobbySetMode() (DONE)
    requires: mode enum definition (NEW)
    enables: [Map Auto-Sizing]
    enables: [Spawn Point System]

[Ready-Up System]
    requires: ready field on PlayerInfo (NEW)
    requires: ready toggle socket event (NEW)
    enables: [Match Start Validation] (all players ready + min count)

[Kick Player]
    requires: new socket event lobby:kick (NEW)
    requires: host validation server-side (NEW)

[Auto-Balance Teams]
    requires: existing team assignment (DONE)
    enhances: [Team Management UX]

[Pre-Game Loading Screen]
    requires: [Game Mode Selection] (to display mode info)
    requires: map preview assets (NEW)
    requires: all-clients-loaded sync signal (NEW)
    enables: [Match Countdown]

[Spawn Point System]
    requires: spawn point data in Tiled maps (NEW)
    requires: [Game Mode Selection] (player count determines spawn layout)
    enables: [Movement Lock During Countdown]

[Match Countdown]
    requires: [Pre-Game Loading Screen] (all assets loaded first)
    requires: [Spawn Point System] (players placed before countdown)
    requires: [Movement Lock] (no input during countdown)
    enables: match ACTIVE state

[Kill Feed]
    requires: elimination event on event bus (partially exists)
    enhances: [Spectator Mode] (spectators see the feed too)

[Match Timer]
    requires: match start timestamp sync (NEW)
    enables: match timeout / forced end

[Spectator Mode]
    requires: elimination event (player dies -> enters spectator)
    requires: camera follow system for other players (NEW)
    requires: spectator UI overlay (NEW)
    enhances: [Kill Feed]

[Quick Rematch]
    requires: lobby persistence after match end (NEW)
    requires: return-to-lobby flow from results screen (NEW)

[AFK Detection]
    requires: input activity tracking (NEW)
    requires: kick/warning socket events (NEW)

[Lobby Chat]
    requires: new socket event lobby:chat (NEW)
    requires: chat UI panel in lobby scene (NEW)

[Ping Indicators]
    requires: RTT measurement over data channels (NEW)
    enhances: [Lobby Browser] (show ping in lobby list)
```

### Dependency Notes

- **Pre-Game Loading Screen requires Game Mode Selection:** The loading screen displays the mode, team compositions, and map preview -- all of which come from the mode selected in lobby.
- **Match Countdown requires Spawn Point System:** Players must be placed at spawn positions before the countdown begins, otherwise they see the countdown from an undefined position.
- **Spectator Mode requires elimination events:** When a player dies, they transition from active player to spectator camera. This requires a clean elimination event that the game scene can listen to.
- **Quick Rematch requires lobby persistence:** The lobby must survive match end. Currently, lobby state is abandoned when `lobby:started` fires. The lobby needs to persist in a "post-match" state.
- **Kill Feed and Spectator Mode are independent but synergistic:** Both can be built separately, but spectators benefit greatly from seeing the kill feed.

---

## MVP Definition

### Launch With (v1.2 Core)

The minimum set to have a complete lobby-to-match-to-rematch loop.

- [ ] **Lobby browser with names and refresh** -- without this, players cannot find games
- [ ] **Game mode selection (1v1 through 10v10)** -- host must configure the match
- [ ] **Ready-up system** -- prevents premature match starts
- [ ] **Kick player** -- host needs control over the lobby
- [ ] **Auto-balance teams** -- manual assignment for 10+ players is tedious
- [ ] **Pre-game loading screen** -- smooth transition from lobby to match
- [ ] **Spawn point system** -- players must not stack on top of each other
- [ ] **Match countdown with movement lock** -- genre-standard tension builder
- [ ] **Match timer** -- players need to know time remaining
- [ ] **Kill feed** -- low complexity, high spectacle value for event
- [ ] **Quick rematch** -- keeps the play loop tight

### Add After Core Works (v1.2 Polish)

- [ ] **Spectator mode** -- build after elimination flow is stable; high value for event crowds
- [ ] **Lobby chat** -- useful when players are at separate stations
- [ ] **Private lobbies with password** -- add if unwanted joins become a problem at the event
- [ ] **AFK detection** -- add if idle players become a problem during testing
- [ ] **Ping indicators** -- add if network quality varies across event stations

### Defer to Future (v2.0+)

- [ ] **Camera zoom-in on spawn** -- pure polish; defer unless time permits
- [ ] **Map auto-sizing by mode** -- requires multiple map variants; build after core maps work
- [ ] **Team color tinting** -- nice visual; can be added any time without dependencies

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Rationale |
|---------|------------|---------------------|----------|-----------|
| Game mode selection UI | HIGH | LOW | P1 | Entire match format depends on this; existing socket method ready |
| Ready-up system | HIGH | LOW | P1 | Prevents broken match starts |
| Spawn point system | HIGH | MEDIUM | P1 | Without it, players overlap; requires map data work |
| Match countdown + movement lock | HIGH | LOW | P1 | 30 lines of code, massive UX improvement |
| Kill feed | HIGH | LOW | P1 | Event crowd engagement; simple text overlay |
| Match timer | HIGH | LOW | P1 | Standard competitive feature |
| Quick rematch | HIGH | LOW | P1 | Keeps play sessions flowing |
| Lobby browser enhancement | MEDIUM | LOW | P1 | Current list works but needs names and refresh |
| Kick player | MEDIUM | LOW | P1 | Host control is essential |
| Auto-balance teams | MEDIUM | LOW | P1 | Quality of life for larger lobbies |
| Pre-game loading screen | MEDIUM | MEDIUM | P1 | Prevents jarring scene transition |
| Spectator mode | HIGH | MEDIUM | P2 | High value but requires camera follow system |
| Lobby chat | MEDIUM | LOW | P2 | Useful but not blocking |
| Private lobbies | LOW | LOW | P2 | Only needed if unwanted joins are a problem |
| AFK detection | LOW | LOW | P2 | Only needed if idle players are a problem |
| Ping indicators | LOW | MEDIUM | P3 | Nice to have; LAN should have uniformly low latency |
| Camera zoom-in | LOW | LOW | P3 | Pure polish |
| Map auto-sizing | MEDIUM | MEDIUM | P3 | Requires multiple map variants |
| Team color tinting | MEDIUM | LOW | P3 | Visual polish, no gameplay impact |

**Priority key:**
- P1: Must have for v1.2 launch (11 features)
- P2: Should have, add when core is stable (4 features)
- P3: Nice to have, future consideration (3 features)

---

## Competitor Feature Analysis

| Feature | Brawl Stars (top-down PvP) | ZombsRoyale.io (browser BR) | Among Us (lobby model) | Our Approach |
|---------|---------------------------|----------------------------|----------------------|--------------|
| Lobby join | Auto-matchmaking queue | Quick play + custom rooms | Room code | Lobby browser + lobby code (hybrid) |
| Team assignment | Auto by matchmaker | Auto or host-assigned | Self-select (impostor random) | Host-assigned with auto-balance button |
| Pre-game screen | Character select + loading | Parachute drop animation | Task assignment screen | Loading screen with map preview + player list |
| Countdown | 3-2-1 in arena | Bus path + drop | Shhhhh screen | 10s countdown with movement lock |
| Kill feed | Center-screen elimination popup | Top-right scrolling feed | Emergency meeting report | Top-right scrolling text feed (standard) |
| Spectator | Follow random alive player | Follow killer or free cam | Ghost mode (still play tasks) | Follow alive players, cycle with arrow keys |
| Match timer | 2-3 min hard limit | Zone-based pacing | Voting timer only | Visible countdown clock, 10-15 min max |
| Rematch | Auto-queue next match | "Play again" button | Same lobby, new round | Return to same lobby, host clicks "Start" again |
| Spawn system | Fixed positions per map | Random drop from bus | Fixed spawn table | Predefined spawn points in Tiled map data |

---

## Detailed Feature Specifications

### Kill Feed

**Behavior:** A scrolling list of recent elimination events displayed in the top-right corner of the game screen. Each entry shows "[Killer] eliminated [Victim]" with element icons. Entries fade out after 5 seconds. Maximum 4 visible entries at once. New entries push old ones up.

**Data flow:** Elimination event fires on event bus -> Kill feed UI component catches it -> Renders text with timestamp -> Auto-removes after timeout.

**For team modes:** Include team color coding on names. "BLUE ArthurMage eliminated RED FireWizard".

**Implementation note:** This is a UI-only feature. The elimination events already need to exist for match win-condition detection. The kill feed just visualizes them.

### Spectator Mode

**Behavior:** When a player is eliminated, their controls are disabled and their camera detaches from their character. The camera attaches to a random alive player. Arrow keys (or dedicated buttons) cycle between alive players. A small overlay shows "SPECTATING: [PlayerName]" and "Press LEFT/RIGHT to switch". The spectator sees the full game including kill feed and match timer but cannot interact.

**State transition:** ALIVE -> ELIMINATED -> SPECTATING. On match end, all spectators transition to results screen.

**Implementation note:** Phaser's camera follow can be reassigned at runtime. The main complexity is (1) tracking which players are alive, (2) handling the case where the spectated player also dies (auto-switch to next alive), and (3) ensuring spectator inputs don't leak into game actions.

### Spawn Point System

**Behavior:** Each map has predefined spawn points stored as objects in the Tiled map data (a "spawns" object layer). Spawn points are tagged with a team identifier (team_a, team_b, neutral). At match start, the server assigns each player to a spawn point based on their team and the game mode.

**Rules:**
- 1v1: 2 spawn points on opposite ends of the arena
- Team modes: Team A spawns on one side, Team B on the other
- Battle Royale: All spawn points are neutral, distributed around arena perimeter
- Spawn points must be at least N tiles apart (prevent immediate combat)
- If more players than spawn points, additional points are procedurally placed near existing ones with jitter

**Data format in Tiled:** Object layer "spawns" with point objects. Custom properties: `team` (string: "a", "b", "neutral"), `index` (number: ordering within team).

### Pre-Game Loading Screen

**Behavior:** After host clicks "Start" and server emits `lobby:started`, all clients transition to a loading screen instead of directly to the game. The loading screen shows:
1. Map name and preview image (static asset)
2. Game mode (e.g., "TEAM DEATHMATCH 3v3")
3. Team rosters with player names (Team A left, Team B right; or circular layout for BR)
4. Loading progress bar (asset loading %)
5. Tip text (random gameplay tips)

When all clients report "loaded", the server signals countdown start. If a client takes more than 15 seconds, start anyway (that client catches up).

**Implementation:** New Phaser scene between lobby and game. Listens for a `match:all-loaded` socket event to transition to game scene with countdown.

### Match Countdown

**Behavior:** After all players load into the game scene and are placed at spawn points, a large centered countdown appears: "10... 9... 8..." (or "3... 2... 1... GO!" for a shorter version). During countdown, players can look around (camera is active) but cannot move or cast spells. Input is suppressed via a flag checked in the player controller.

**PROJECT.md specifies 10s countdown.** Use 10s with the last 3 seconds being large animated numbers. The first 7 seconds let players survey the arena.

### Quick Rematch

**Behavior:** After match results screen, the host sees a "REMATCH" button. Clicking it returns all connected players to the lobby waiting room with the same settings (mode, teams). Players who disconnected are removed. Non-host players see "Waiting for host to rematch or leave..."

**Implementation:** The lobby must not be destroyed when the match starts. Instead, lobby status transitions: `waiting -> in-progress -> post-match -> waiting` (on rematch). The server keeps lobby state alive throughout the match. On rematch, the server resets ready states and emits `lobby:updated` to all players.

---

## Sources

- Kill feed patterns: Standard across competitive FPS/arena games (Overwatch, Valorant, Fortnite) -- scrolling top-right corner with fade-out is the universal convention -- HIGH confidence
- Spectator mode patterns: Common in BR games (PUBG, Fortnite, Apex Legends) and MOBAs (League of Legends) -- camera follow with player cycling is standard -- HIGH confidence
- Spawn point systems: Standard in arena shooters (Quake, Halo, TF2) -- predefined spawn positions with team-side separation is universal for team modes -- HIGH confidence
- Lobby UX patterns: Drawn from Among Us (room code), Brawl Stars (quick match), and custom game lobbies in Halo/CoD -- HIGH confidence
- Pre-game loading screen: Universal in multiplayer games; "all clients loaded" sync is standard pattern -- HIGH confidence
- Match countdown: Universal 3-2-1 or 5-4-3-2-1 countdown with input lock is standard across all competitive games -- HIGH confidence
- All findings based on training data (web search unavailable); confidence remains HIGH because these are long-established, stable game design patterns that have not meaningfully changed

---
*Feature research for: v1.2 Lobby & Game Start Flow*
*Researched: 2026-04-21*
