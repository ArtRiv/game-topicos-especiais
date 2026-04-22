# Architecture Research

**Domain:** Lobby system, pre-game flow, and in-match QoL for Phaser 3 PvP game
**Researched:** 2026-04-21
**Confidence:** HIGH (based on direct codebase analysis + Phaser 3 scene architecture patterns)

## System Overview

```
                         EXISTING                              NEW / MODIFIED
 ===================================================================
                      Scene Graph Flow
 -------------------------------------------------------------------

  LobbyScene -----> PreloadScene -----> GameScene + UiScene
  (3 views:          (assets)           (gameplay + HUD)
   connect,
   list,
   waiting room)

                          NEW SCENES / MODIFICATIONS
                          ===========================

  LobbyScene [MODIFY]              LoadingScene [NEW]
  (add: password,                   (map preview, player
   game mode picker,                 names, mode info,
   ready-up, kick,                   asset progress bar)
   auto-balance,                         |
   shuffle, chat,                        v
   AFK detection,                   GameScene [MODIFY]
   ping indicators)                 (add: spawn system,
       |                             countdown, movement
       v                             lock, camera zoom)
  lobby:start                            |
       |                                 v
       v                            MatchHudScene [NEW]
  LoadingScene [NEW]                (kill feed, match
       |                             timer, spectator
       v                             toggle, scoreboard)
  GameScene [MODIFY]                     |
                                         v
                                    PostMatchScene [NEW]
                                    (results, rematch
                                     vote, back to lobby)
```

### Component Responsibilities

| Component | Responsibility | New vs Existing |
|-----------|----------------|-----------------|
| `LobbyScene` | Connection, lobby list, waiting room with team management | MODIFY -- add password, game mode picker, ready-up, kick, auto-balance, shuffle, lobby chat, AFK detection, ping display |
| `LoadingScene` | Pre-game screen: map preview image, player list with teams, game mode label, asset loading progress | NEW |
| `GameScene` | Core gameplay loop, player/spell management, networking | MODIFY -- add spawn point system, countdown overlay, movement lock during countdown, camera zoom-in on spawn |
| `MatchHudScene` | In-match overlay: kill feed, match timer, spectator camera controls, scoreboard | NEW (replaces/extends UiScene for PvP matches) |
| `UiScene` | Health hearts, mana bar, element indicator | KEEP as-is for single-player; PvP matches use MatchHudScene instead |
| `PostMatchScene` | Match results screen, quick rematch voting, return to lobby | NEW |
| `NetworkManager` | Socket.io signaling + WebRTC mesh, lobby methods, game tick | MODIFY -- add new message types for chat, ready-up, kill events, match timer sync, spectator state |
| `LobbyManager` (server) | Lobby CRUD, team assignment, host privileges | MODIFY -- add password, game mode config, ready-up tracking, kick, auto-balance, AFK timeout |
| `GameRoom` (server) | Tracks players in an active match | MODIFY -- add kill tracking, match timer authority, spectator list, rematch vote counting |
| `EVENT_BUS` | Global decoupled event communication | MODIFY -- add new event constants for all new features |

## Recommended Project Structure

```
src/
  scenes/
    lobby-scene.ts              # [MODIFY] Enhanced lobby with all new features
    loading-scene.ts            # [NEW] Pre-game loading screen
    game-scene.ts               # [MODIFY] Spawn points, countdown, spectator hooks
    match-hud-scene.ts          # [NEW] Kill feed, match timer, spectator UI
    post-match-scene.ts         # [NEW] Results + rematch
    ui-scene.ts                 # [KEEP] Existing HUD (used in non-PvP or as base)
    scene-keys.ts               # [MODIFY] Add new scene keys
  networking/
    network-manager.ts          # [MODIFY] New message types
    types.ts                    # [MODIFY] New payload types
  match/                        # [NEW] Match lifecycle management
    match-state.ts              # Client-side match state (timer, scores, alive players)
    spawn-manager.ts            # Spawn point selection from map data
    kill-feed.ts                # Kill event queue + rendering logic
    spectator-controller.ts     # Camera controls for eliminated players
  lobby/                        # [NEW] Lobby feature modules
    lobby-chat.ts               # Chat message handling + UI rendering
    ready-state.ts              # Ready-up state tracking
    afk-detector.ts             # Client-side AFK detection (input idle timer)
    game-mode-config.ts         # Game mode definitions (1v1-10v10, BR, TDM)

game-server/src/
  lobby-manager.ts              # [MODIFY] Password, ready-up, kick, AFK
  game-room.ts                  # [MODIFY] Kill tracking, timer, spectator, rematch
  server.ts                     # [MODIFY] New socket events
  types.ts                      # [MODIFY] New payload types
```

### Structure Rationale

- **`src/match/`:** Isolates match lifecycle logic (timer, kills, spawns, spectating) from scene code. GameScene and MatchHudScene both consume these modules but do not own the state themselves. This prevents GameScene from growing further -- it is already 1700+ lines.
- **`src/lobby/`:** Lobby features (chat, ready-up, AFK) are modular pieces that LobbyScene composes. Each can be developed and tested independently.
- **Server stays minimal:** The server is a thin signaling + authority layer. Match timer ticks come from the server (single source of truth), but kill validation stays host-authoritative via WebRTC (existing pattern).

## Architectural Patterns

### Pattern 1: Parallel Scene Composition (Phaser overlay scenes)

**What:** Phaser 3 supports multiple active scenes simultaneously. The game already uses this: `GameScene` launches `UiScene` as an overlay via `this.scene.launch()`. New HUD/overlay features follow this same pattern.

**When to use:** Any UI that overlays gameplay -- kill feed, match timer, spectator controls, scoreboard.

**Trade-offs:** Scenes have independent update loops (good for separation), but sharing state requires the event bus or a shared singleton (already established via `EVENT_BUS` and `NetworkManager`).

**Example:**
```typescript
// In GameScene.create(), after setting up gameplay:
this.scene.launch(SCENE_KEYS.MATCH_HUD_SCENE);

// MatchHudScene listens to EVENT_BUS for kill events, timer ticks, etc.
// It never imports GameScene directly -- all communication through events.
```

### Pattern 2: Server-Authoritative Timer with Client Prediction

**What:** The match timer runs on the server (GameRoom). The server broadcasts `match:timer-sync` every 5 seconds with the authoritative remaining time. Clients run a local countdown and correct drift on each sync.

**When to use:** Match timer, countdown at match start, AFK timeout enforcement.

**Trade-offs:** Adds a socket.io message channel (not WebRTC, since timer is low-frequency and needs authority). Small complexity, but prevents the desync where different clients see different remaining times.

**Example:**
```typescript
// Server (GameRoom): broadcasts via socket.io
setInterval(() => {
  io.to(`lobby:${lobbyId}`).emit('match:timer-sync', { remainingMs: this.remainingMs });
}, 5000);

// Client (MatchState): corrects local timer
EVENT_BUS.on('NETWORK_MATCH_TIMER_SYNC', ({ remainingMs }) => {
  this.localTimer = remainingMs; // snap to server value
});
```

### Pattern 3: Event-Driven Kill Feed Pipeline

**What:** When a player dies, the host (who validates damage) broadcasts a `match:kill` event through the reliable WebRTC channel. All clients receive it and push it into a local `KillFeed` queue. The `MatchHudScene` renders the queue with auto-fade.

**When to use:** Kill feed, player elimination notifications, any event that all clients must display consistently.

**Trade-offs:** Relies on host-authoritative damage (already exists). If the host disconnects mid-match, the kill feed stops working -- but so does damage validation, so this is an existing limitation.

**Example:**
```typescript
// In NetworkManager, add to DcMessage union:
| { type: 'kill'; killerId: string; victimId: string; spellId: string }

// KillFeed class:
class KillFeed {
  #entries: KillEntry[] = [];
  push(entry: KillEntry) {
    this.#entries.push({ ...entry, timestamp: Date.now() });
    if (this.#entries.length > 5) this.#entries.shift();
  }
  getVisible(): KillEntry[] {
    const now = Date.now();
    return this.#entries.filter(e => now - e.timestamp < 5000);
  }
}
```

### Pattern 4: Spawn Points via Tiled Object Layer

**What:** Define spawn points as a Tiled object layer (`spawn-points`) in each PvP map. Each spawn point has custom properties: `team` (0, 1, or -1 for FFA), `index` (ordering). `SpawnManager` reads these at map load and assigns players to positions based on team and mode.

**When to use:** Match initialization, respawn (if ever added).

**Trade-offs:** Requires adding a new object layer to each Tiled map. Map authors must place spawn points intentionally. The existing map parsing infrastructure (`tiled-utils.ts`) makes this straightforward.

**Example:**
```typescript
// SpawnManager reads from Tiled map:
class SpawnManager {
  static getSpawnPoints(map: Phaser.Tilemaps.Tilemap): SpawnPoint[] {
    const layer = map.getObjectLayer('spawn-points');
    return layer.objects.map(obj => ({
      x: obj.x, y: obj.y,
      team: obj.properties?.find(p => p.name === 'team')?.value ?? -1,
      index: obj.properties?.find(p => p.name === 'index')?.value ?? 0,
    }));
  }

  static assignSpawns(
    points: SpawnPoint[], players: PlayerInfo[]
  ): Map<string, { x: number; y: number }> {
    // Team mode: filter by team, assign round-robin
    // FFA/BR: assign all points round-robin
  }
}
```

### Pattern 5: Spectator Mode as Camera Detach

**What:** When a player is eliminated, their `Player` game object is destroyed but they remain connected. The `SpectatorController` takes over camera control: free-look with WASD or cycle through alive players with Tab. Input events are suppressed for gameplay but active for spectator navigation.

**When to use:** After player elimination, before match ends.

**Trade-offs:** Simple to implement since Phaser cameras are independent of game objects. The player stays in the WebRTC mesh (they still receive position/spell updates for rendering). No new networking needed -- spectators are passive observers.

**Example:**
```typescript
class SpectatorController {
  #scene: Phaser.Scene;
  #alivePlayers: Player[];
  #followIndex = 0;

  enterSpectatorMode(scene: Phaser.Scene, alivePlayers: Player[]) {
    this.#scene = scene;
    this.#alivePlayers = alivePlayers;
    scene.cameras.main.stopFollow();
    this.followNext();
  }

  followNext() {
    this.#followIndex = (this.#followIndex + 1) % this.#alivePlayers.length;
    this.#scene.cameras.main.startFollow(
      this.#alivePlayers[this.#followIndex]
    );
  }
}
```

## Data Flow

### Lobby Phase (Enhanced)

```
Player Input (create/join/chat/ready/team)
    |
    v
LobbyScene --> NetworkManager.sendLobby*()
    |                    |
    v                    v
lobby/*.ts           socket.io --> Server (LobbyManager)
(chat, ready,            |
 AFK modules)            v
    ^              Broadcast to lobby room
    |                    |
    v                    v
EVENT_BUS <-------- NetworkManager.#bindSocketEvents()
    |
    v
LobbyScene re-renders (player list, chat, ready states)
```

### Match Start Flow (NEW)

```
Host clicks START
    |
    v
Server validates (all ready? teams balanced?)
    |
    v
Server broadcasts 'lobby:started' with matchConfig
    |
    v
All clients: LobbyScene.stop() --> LoadingScene.start()
    |
    v
LoadingScene: show map preview, player names, teams, mode
    |  (assets loading in background via PreloadScene logic)
    v
All assets loaded --> Server broadcasts 'match:countdown-start'
    |
    v
GameScene.start() with spawn data
    |
    v
SpawnManager assigns positions from Tiled spawn-points layer
    |
    v
Players rendered at spawn positions, movement LOCKED
    |
    v
10-second countdown overlay (camera zooms in, then out)
    |
    v
Countdown hits 0 --> movement UNLOCKED, match timer starts
    |
    v
MatchHudScene launched as overlay (kill feed, timer, spectator UI)
```

### Kill Event Flow (NEW)

```
Player A's spell hits Player B
    |
    v
Host validates damage (existing pattern)
    |
    v
Player B HP reaches 0
    |
    v
Host broadcasts via reliable WebRTC:
  { type: 'kill', killerId: 'A', victimId: 'B', spellId: 'fire-bolt' }
    |
    v
All clients receive --> EVENT_BUS.emit('MATCH_PLAYER_KILLED', ...)
    |         |
    v         v
KillFeed    GameScene removes Player B sprite
  queue     If Player B is local --> SpectatorController.enter()
    |
    v
MatchHudScene renders kill feed entry (fades after 5s)
```

### Match End Flow (NEW)

```
Last player/team standing OR match timer expires
    |
    v
Host detects win condition --> broadcasts 'match:ended'
    |
    v
All clients: GameScene + MatchHudScene stop
    |
    v
PostMatchScene starts (results, stats, rematch vote)
    |
    v
Players vote rematch --> Server tallies --> if majority:
    |                                          |
    v                                          v
Back to LobbyScene                      Reset match,
(same lobby preserved)                  LoadingScene again
```

### Key Data Flows

1. **Lobby chat:** Client types message --> `NetworkManager.sendLobbyChat(msg)` --> server broadcasts to lobby room --> all clients receive via `lobby:chat` event --> `LobbyChatModule` appends to scrollable text display in LobbyScene.

2. **Ready-up:** Client toggles ready --> `NetworkManager.sendLobbyReady(isReady)` --> server updates player's ready flag in `LobbyManager` --> broadcasts updated lobby --> LobbyScene re-renders player list with ready indicators. Host's START button only enables when all players are ready.

3. **AFK detection:** `AfkDetector` runs a client-side idle timer (reset on any input). After 60s of no input in lobby, client sends `lobby:afk-warning`. After 120s, server auto-kicks. During match, AFK players are marked but not kicked (spectators are naturally idle).

4. **Spectator mode:** Eliminated player's `Player` destroyed --> `SpectatorController` takes camera --> Tab cycles through alive remote players (from `#remotePlayers` map). Spectator can also press Esc to open scoreboard overlay. No network messages needed -- spectators passively receive existing position/spell broadcasts.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2-4 players (1v1, 2v2) | Current WebRTC mesh works perfectly. No changes needed. |
| 6-10 players (3v3 to 5v5) | WebRTC mesh = N*(N-1)/2 connections. At 10 players = 45 connections. Position updates at 20 Hz = 900 msgs/s total. Test on LAN -- likely fine. Monitor browser WebRTC limits. |
| 10-20 players (10v10) | WebRTC mesh becomes strained (~190 connections). Consider selective relay: server relays position updates (already has msgpack path), keep spell events P2P. Or use SFU topology. |

### Scaling Priorities

1. **First bottleneck:** WebRTC mesh connection count at 10+ players. The msgpack relay path in `server.ts` already exists as a fallback. If mesh fails at scale, switch position updates to server-relay (socket.io) while keeping spell events on reliable WebRTC channels.
2. **Second bottleneck:** Phaser rendering with 20 players + their spells on screen simultaneously. Reduce particle effects, cull off-screen sprites, consider viewport-based spell filtering.

## Anti-Patterns

### Anti-Pattern 1: Cramming Match UI into GameScene

**What people do:** Add kill feed text, match timer, scoreboard rendering directly into `GameScene.create()` and `GameScene.update()`.
**Why it's wrong:** GameScene is already 1700+ lines. Adding UI rendering logic makes it unmaintainable and couples display to gameplay logic.
**Do this instead:** Use `MatchHudScene` as a parallel overlay scene (same pattern as existing `UiScene`). Communicate via `EVENT_BUS`.

### Anti-Pattern 2: Client-Authoritative Match Timer

**What people do:** Each client runs its own countdown independently.
**Why it's wrong:** Clock drift between machines means clients disagree on when the match ends. One client's "time's up" message arrives while others still have seconds left.
**Do this instead:** Server owns the timer. Broadcasts periodic sync messages. Clients predict locally between syncs but snap to server value.

### Anti-Pattern 3: Reusing LobbyScene for Pre-Game Loading

**What people do:** Show loading progress inside the waiting room view of LobbyScene.
**Why it's wrong:** Mixing lobby state management (join/leave/team) with asset loading lifecycle creates messy state transitions. If a player disconnects during loading, both lobby and loading state need cleanup in the same scene.
**Do this instead:** Create a dedicated `LoadingScene` that receives `matchConfig` data. Clean separation: LobbyScene handles lobby, LoadingScene handles the transition to gameplay.

### Anti-Pattern 4: Broadcasting Chat Over WebRTC

**What people do:** Send lobby chat messages over WebRTC data channels.
**Why it's wrong:** WebRTC mesh is not established until `lobby:started` fires (the mesh is initialized in `#initWebRTCMesh` which only runs on `lobby:started`). Chat is needed before the match starts, during the lobby phase. Also, chat is low-frequency and reliability matters more than latency.
**Do this instead:** Send chat via socket.io (existing signaling server). Server broadcasts to the lobby room. This works throughout the entire lobby lifecycle.

### Anti-Pattern 5: Sending Full Spawn Data Per-Tick

**What people do:** Include spawn position in every 20 Hz position update.
**Why it's wrong:** Spawn positions are determined once at match start. Sending them continuously wastes bandwidth.
**Do this instead:** Server sends spawn assignments once in `match:countdown-start`. Clients store them locally. Position updates continue using the existing `PlayerUpdatePayload` (no changes needed).

## Integration Points

### New Socket.io Events (Server-Client)

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `lobby:chat` | bidirectional | `{ message: string }` | Lobby text chat |
| `lobby:ready` | client -> server | `{ isReady: boolean }` | Ready-up toggle |
| `lobby:kick` | client -> server | `{ targetPlayerId: string }` | Host kicks player |
| `lobby:set-password` | client -> server | `{ password: string or null }` | Set/remove lobby password |
| `lobby:join` (modify) | client -> server | add `{ password?: string }` | Password-protected join |
| `match:countdown-start` | server -> clients | `{ spawns: Record<string, {x,y}>, durationMs: number }` | Begin pre-match countdown |
| `match:timer-sync` | server -> clients | `{ remainingMs: number }` | Periodic timer correction |
| `match:ended` | server -> clients | `{ winner: string or string[], stats: MatchStats }` | Match conclusion |
| `match:rematch-vote` | bidirectional | `{ vote: boolean }` | Quick rematch voting |

### New WebRTC Data Channel Messages (P2P)

| Message Type | Channel | Payload | Purpose |
|-------------|---------|---------|---------|
| `kill` | reliable | `{ killerId, victimId, spellId }` | Kill feed event |
| `player-eliminated` | reliable | `{ playerId }` | Player removed from play |
| `spectator-enter` | reliable | `{ playerId }` | Notify peers player is spectating |

### Internal Boundaries (Event Bus)

| Event | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `MATCH_COUNTDOWN_START` | NetworkManager | GameScene, MatchHudScene | Begin countdown sequence |
| `MATCH_COUNTDOWN_TICK` | GameScene (local timer) | MatchHudScene | Update countdown display |
| `MATCH_STARTED` | GameScene | MatchHudScene, MatchState | Unlock movement, start timer |
| `MATCH_PLAYER_KILLED` | NetworkManager | KillFeed, GameScene, MatchState | Process kill |
| `MATCH_PLAYER_ELIMINATED` | GameScene | SpectatorController, MatchHudScene | Player exits play |
| `MATCH_TIMER_UPDATE` | MatchState | MatchHudScene | Timer display update |
| `MATCH_ENDED` | NetworkManager/MatchState | GameScene, MatchHudScene, PostMatchScene | End match |
| `LOBBY_CHAT_MESSAGE` | NetworkManager | LobbyChatModule | Display chat message |
| `LOBBY_READY_CHANGED` | NetworkManager | LobbyScene | Update ready indicators |
| `LOBBY_PLAYER_KICKED` | NetworkManager | LobbyScene | Remove kicked player |
| `LOBBY_AFK_WARNING` | AfkDetector | LobbyScene | Show AFK warning |

## Build Order (Dependency-Aware)

Build order is sequenced so each step has its dependencies already in place:

### Phase A: Lobby Enhancements (no match dependency)
1. **Game mode config** (`game-mode-config.ts`) -- data definitions for 1v1 through 10v10, BR, TDM
2. **Ready-up system** -- server `lobby:ready` event + LobbyScene ready indicators + START gating
3. **Lobby chat** -- `lobby:chat` socket event + `LobbyChatModule` UI rendering in LobbyScene
4. **Password protection** -- `lobby:set-password` + modified `lobby:join` with password field
5. **Kick player** -- host-only `lobby:kick` event
6. **Auto-balance / shuffle** -- client-side team balancing algorithm, calls existing `lobby:assign-team`
7. **AFK detection** -- `AfkDetector` client module + server-side timeout enforcement
8. **Ping indicators** -- WebRTC `getStats()` RTT display per player in waiting room

### Phase B: Pre-Game Loading (depends on A for mode config)
1. **`LoadingScene`** -- new scene with map preview, player list, mode display
2. **Spawn point Tiled layer** -- add `spawn-points` object layer to PvP maps
3. **`SpawnManager`** -- reads spawn points, assigns players based on team/mode
4. **Server `match:countdown-start`** -- server sends spawn assignments after all clients report loaded

### Phase C: Match Initialization (depends on B for spawns)
1. **Countdown overlay in GameScene** -- 10s countdown text, movement lock, camera zoom
2. **Spawn player at assigned position** -- modify `#setupPlayer()` to use `SpawnManager` output
3. **Match timer** -- server-authoritative with `match:timer-sync`, `MatchState` client module

### Phase D: In-Match QoL (depends on C for active match)
1. **`MatchHudScene`** -- new overlay scene replacing UiScene for PvP, with match timer display
2. **Kill feed** -- `KillFeed` class + `kill` WebRTC message + MatchHudScene rendering
3. **Player elimination** -- host detects HP=0, broadcasts `player-eliminated`, `GameScene` removes player
4. **Spectator mode** -- `SpectatorController` for eliminated players, camera cycle with Tab
5. **Match end detection** -- host checks win condition, broadcasts `match:ended`

### Phase E: Post-Match (depends on D for match lifecycle)
1. **`PostMatchScene`** -- results display (winner, kills, stats)
2. **Quick rematch** -- `match:rematch-vote` + server tallying + auto-restart or back to lobby

## Sources

- Direct codebase analysis of `src/` and `game-server/src/` (primary source -- HIGH confidence)
- Phaser 3 scene management: parallel scenes via `scene.launch()`, scene lifecycle events (established pattern already used in codebase)
- WebRTC mesh architecture: existing implementation in `network-manager.ts` with reliable/unreliable channels
- Tiled object layer parsing: existing `tiled-utils.ts` infrastructure for custom object layers

---
*Architecture research for: Lobby and Game Start Flow (v1.2 milestone)*
*Researched: 2026-04-21*
