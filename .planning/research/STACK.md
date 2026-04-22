# Stack Research: v1.2 Lobby & Game Start Flow

**Domain:** Multiplayer PvP game — lobby system, matchmaking, chat, spectator mode, game start flow
**Researched:** 2026-04-21
**Confidence:** HIGH (recommendations build entirely on existing validated stack; no new dependencies)

---

## Executive Finding

**Zero new npm packages are needed for v1.2.** The existing stack (Phaser 3.87.0, socket.io 4.8.3, TypeScript 5.7.3, Express 4.21.0, @msgpack/msgpack 3.1.3) already provides every capability required for lobby creation/browsing, private lobbies, game mode selection, team management, ready-up, chat, pre-game loading, spawn points, countdown, kill feed, spectator mode, quick rematch, AFK detection, and ping indicators. This is a pure feature-layer milestone — no infrastructure changes.

---

## Current Stack (Validated — DO NOT CHANGE)

| Technology | Version | Location | Status |
|------------|---------|----------|--------|
| Phaser | 3.87.0 | Client `dependencies` | Installed, working |
| TypeScript | 5.7.3 | Both client + server `devDependencies` | Installed, working |
| Vite | 6.0.7 | Client `devDependencies` | Installed, working |
| socket.io-client | 4.8.3 | Client `dependencies` | Installed, working |
| socket.io | 4.8.3 | Server `dependencies` | Installed, working |
| Express | 4.21.0 | Server `dependencies` | Installed, working |
| @msgpack/msgpack | 3.1.3 | Server `dependencies` | Installed, working |
| tsx | 4.19.0 | Server `devDependencies` | Installed, working |
| WebRTC (browser API) | N/A | Browser native | Implemented in NetworkManager |

---

## Feature-to-Existing-Tech Mapping

Every v1.2 feature maps directly to already-installed technology:

### Lobby Features (socket.io 4.8.3)

| Feature | Implementation | Existing Code to Extend |
|---------|---------------|------------------------|
| Lobby creation with custom name | Add `lobbyName` field to `lobby:create` payload | `LobbyManager.createLobby()` — add name param |
| Lobby browsing with refresh | Already implemented — `lobby:list` event exists | `LobbyScene.#showLobbyListView()` — add refresh button + auto-refresh timer |
| Private lobbies (password) | Add `password` field to Lobby type; validate on join | `LobbyManager.joinLobby()` — add password check |
| Game mode selection (1v1–10v10) | Extend `lobby:set-mode` with structured mode object | `LobbyManager.setMode()` — parse mode into team size + player cap |
| Team management (kick) | New `lobby:kick` socket event, host-only | `LobbyManager` — new `kickPlayer()` method |
| Team auto-balance / shuffle | New `lobby:shuffle` socket event | `LobbyManager` — new `shuffleTeams()` method |
| Ready-up system | Add `ready: boolean` to PlayerInfo, new `lobby:ready` event | `LobbyManager` — new `setReady()` + `allReady()` methods |
| Real-time lobby state | Already implemented — `lobby:updated` broadcasts full state | No change needed; just add new fields to Lobby type |
| Lobby chat | New `lobby:chat` socket event, broadcast to room | `server.ts` — 5-line handler: receive, sanitize, broadcast |
| Ping indicators | socket.io built-in latency measurement | Access via `socket.io` ping/pong — emit latency in lobby updates |
| AFK detection | Client tracks `Date.now()` of last input, server kicks after timeout | Client: input timestamp tracking. Server: `setInterval` check per lobby |

### Game Start Flow (Phaser 3.87.0)

| Feature | Implementation | Phaser API |
|---------|---------------|------------|
| Pre-game loading screen | New `LoadingScene` — map preview, player names, mode info | `this.load.image()` for map thumbnail, `this.add.text()` for info |
| Map preview | Render a pre-captured tilemap screenshot as Phaser image | `this.add.image()` from preloaded asset |
| Spawn points per map | Tiled object layer with spawn point markers per team | Already using Tiled; add "spawns" object layer with `team` property |
| Movement lock during countdown | Disable player input component temporarily | Set a `locked: boolean` flag on KeyboardComponent |
| Camera zoom-in animation | Tween the camera zoom from wide to gameplay zoom | `this.cameras.main.setZoom()` + `this.tweens.add()` |
| 10-second countdown | Phaser timer with text overlay | `this.time.addEvent({ delay: 1000, repeat: 9 })` + large centered text |

### In-Match QoL (Phaser 3.87.0 + socket.io 4.8.3)

| Feature | Implementation | Key Decision |
|---------|---------------|-------------|
| Kill feed | Phaser text container overlay in MatchHUDScene | Use Phaser GameObjects, NOT DOM — consistent with existing UI style |
| Match timer | Phaser timed event displayed in HUD | `this.time.addEvent()` with callback each second |
| Spectator mode | Camera follows living player, input disabled, cycle targets | `camera.startFollow(target)`, arrow keys to switch |
| Quick rematch | socket.io `game:rematch` vote event, server resets lobby | Server sets lobby `status: 'waiting'`, players skip connect screen |

---

## Critical Architecture Decision: Spectator Data Path

**Spectators MUST receive game state via socket.io, NOT WebRTC.**

Reason: When a player dies, their WebRTC peer connections become stale — they are no longer sending position data, and the mesh was designed for active players only. Dead/spectating players need to observe the remaining players' positions and kills.

**Implementation approach:**
1. When a player dies, the host (or server) continues sending match events (kills, eliminations) via socket.io to the lobby room — all sockets stay connected to the lobby room
2. For spectator position data, two options (recommend Option A):
   - **Option A (simpler):** Spectators see the last-known positions from their still-open WebRTC channels. The WebRTC channels don't close immediately on death — they stay open as long as the browser tab is open. The dead player just stops *sending* but keeps *receiving*. This works because WebRTC `ondatachannel` listeners are still active.
   - **Option B (if Option A proves unreliable):** Server relays a reduced-rate position stream (5 Hz instead of 20 Hz) to spectators via socket.io.

**Start with Option A** — it requires zero new code for position relay. Only kill events and match-end events need socket.io broadcast (which is already the pattern for `game:player-disconnected`).

---

## Server-Side Extensions (No New Packages)

### LobbyManager New Methods

| Method | Purpose | Complexity |
|--------|---------|------------|
| `createLobby(socketId, playerName, lobbyName, password?)` | Extend existing with name + optional password | Low — add 2 fields |
| `joinLobby(lobbyId, socketId, name, password?)` | Extend existing with password validation | Low — add conditional check |
| `kickPlayer(hostSocketId, targetPlayerId)` | Host removes a player from lobby | Low — filter + re-emit |
| `setReady(socketId, ready: boolean)` | Player toggles ready state | Low — set field on PlayerInfo |
| `allReady(lobbyId): boolean` | Check if all players are ready | Low — `every()` check |
| `shuffleTeams(hostSocketId)` | Randomly assign balanced teams | Low — Fisher-Yates shuffle + split |
| `autoBalance(hostSocketId)` | Even out team sizes | Low — move excess players |
| `getSpawnPoints(mode, mapId): SpawnPoint[]` | Return spawn coords for the map/mode | Med — needs map-to-spawn data |

### New Socket Events in server.ts

| Event | Direction | Purpose |
|-------|-----------|---------|
| `lobby:kick` | Client -> Server | Host kicks a player |
| `lobby:ready` | Client -> Server -> Room | Player toggles ready, broadcast updated lobby |
| `lobby:shuffle` | Client -> Server -> Room | Host shuffles teams |
| `lobby:chat` | Client -> Server -> Room | Chat message (text + playerName + timestamp) |
| `lobby:ready-to-play` | Client -> Server | Client finished loading assets |
| `game:all-loaded` | Server -> Room | All clients loaded, begin countdown |
| `game:kill` | Client -> Server -> Room | Kill event for feed + spectators |
| `game:match-end` | Server -> Room | Match over, results payload |
| `game:rematch-vote` | Client -> Server | Player votes for rematch |
| `game:rematch-start` | Server -> Room | Enough votes, resetting lobby |

---

## Type Extensions

Extend existing types in both `src/networking/types.ts` and `game-server/src/types.ts`:

```typescript
// --- Extend existing types ---

export type PlayerInfo = {
  id: string;
  name: string;
  socketId: string;
  element?: string;
  team?: number;
  ready?: boolean;          // NEW: lobby ready-up
  alive?: boolean;          // NEW: alive status in match
};

export type Lobby = {
  id: string;
  hostPlayerId: string;
  players: PlayerInfo[];
  mode: string | null;
  status: 'waiting' | 'loading' | 'in-progress' | 'finished';  // NEW: loading, finished
  name?: string;            // NEW: custom lobby name
  password?: string;        // NEW: private lobby (server-only, never sent to clients)
  maxPlayers?: number;      // NEW: derived from game mode (2 for 1v1, 20 for 10v10)
  mapId?: string;           // NEW: selected map identifier
};

// --- New types ---

export type ChatMessage = {
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
};

export type KillEvent = {
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  spellElement: string;
};

export type SpawnPoint = {
  x: number;
  y: number;
  team?: number;            // undefined = FFA spawn
};

export type GameMode = {
  type: 'ffa' | 'team';    // ffa = Battle Royale, team = team deathmatch
  teamSize: number;         // 1 for ffa/1v1, 2 for 2v2, etc.
  teamCount: number;        // 2 for team modes, N for ffa
  maxPlayers: number;       // teamSize * teamCount
};

export type MatchResult = {
  winnerId?: string;
  winningTeam?: number;
  placements: { playerId: string; placement: number; kills: number }[];
  duration: number;         // seconds
};
```

---

## New Phaser Scenes

| Scene Key | Purpose | Lifecycle |
|-----------|---------|-----------|
| `LOADING_SCENE` | Pre-game: map preview, player list, mode info, asset loading progress | After `lobby:started`, before `GAME_SCENE` |
| `MATCH_HUD_SCENE` | Kill feed, match timer, spectator UI (overlay) | Launched parallel with `GAME_SCENE` via `this.scene.launch()` |

The existing `LobbyScene` should be **extended in-place** for: custom lobby name input, password field, game mode dropdown, ready-up buttons, chat panel, kick buttons, shuffle/balance buttons.

The existing `GameOverScene` should be **extended** for: match results display, kill/death stats, quick rematch button.

---

## New Event Bus Events

Add to `CUSTOM_EVENTS` in `src/common/event-bus.ts`:

```typescript
// Lobby phase
NETWORK_LOBBY_CHAT: 'NETWORK_LOBBY_CHAT',
NETWORK_LOBBY_KICK: 'NETWORK_LOBBY_KICK',
NETWORK_LOBBY_READY: 'NETWORK_LOBBY_READY',

// Game start flow
NETWORK_ALL_LOADED: 'NETWORK_ALL_LOADED',
MATCH_COUNTDOWN_TICK: 'MATCH_COUNTDOWN_TICK',
MATCH_STARTED: 'MATCH_STARTED',

// In-match
MATCH_KILL: 'MATCH_KILL',
MATCH_TIMER_TICK: 'MATCH_TIMER_TICK',
MATCH_ENDED: 'MATCH_ENDED',
SPECTATOR_TARGET_CHANGED: 'SPECTATOR_TARGET_CHANGED',

// Rematch
MATCH_REMATCH_VOTE: 'MATCH_REMATCH_VOTE',
MATCH_REMATCH_START: 'MATCH_REMATCH_START',
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any UI framework (React, Vue, DOM overlays) | Project uses Phaser-native UI throughout; DOM mixing breaks pixel-art aesthetic and adds bundle size | Phaser text, containers, rectangles (existing pattern in LobbyScene) |
| Chat library (Stream Chat, Sendbird) | Chat is lobby-scoped, ephemeral, max 20 players; socket.io handles this in 10 lines | `socket.emit('lobby:chat', { text })` |
| Matchmaking library/service | LAN-based with manual lobby join; no MMR queue needed for v1.2 | LobbyManager with mode/team config |
| Redis | Single-server, single-process, <100 players; in-memory `Map` is fine | Existing `Map<string, Lobby>` in LobbyManager |
| State management library (Zustand, MobX) | Phaser EventEmitter pattern is working; second state system = two sources of truth | EVENT_BUS + scene-local state (existing pattern) |
| Colyseus / geckos.io / other game framework | Would require rewriting the entire networking layer that is already validated | Extend existing server.ts + NetworkManager |
| Database (for v1.2) | Lobbies are ephemeral; no persistence needed until v2.0 adds accounts/ranking | In-memory Map (defer DB to v2.0) |
| Express 5 upgrade | Server works on Express 4.21.0; upgrading mid-milestone adds risk for zero benefit | Stay on Express 4.21.0 for v1.2 |
| Additional WebRTC libraries | WebRTC mesh is fully implemented; spectator mode works via existing channels | Existing NetworkManager WebRTC implementation |

---

## Chat Implementation (No Library)

Server-side (add to `server.ts`):

```typescript
// Rate limit: Map<socketId, lastMessageTimestamp>
const chatRateLimit = new Map<string, number>();

socket.on('lobby:chat', ({ text }: { text: string }) => {
  const now = Date.now();
  const last = chatRateLimit.get(socket.id) ?? 0;
  if (now - last < 1000) return; // 1 msg/sec rate limit
  chatRateLimit.set(socket.id, now);

  const lobby = lobbyManager.getLobbyBySocketId(socket.id);
  if (!lobby) return;
  const player = lobby.players.find(p => p.socketId === socket.id);
  if (!player) return;

  const sanitized = text.slice(0, 200).trim();
  if (!sanitized) return;

  const msg: ChatMessage = {
    playerId: player.id,
    playerName: player.name,
    text: sanitized,
    timestamp: now,
  };
  io.to(`lobby:${lobby.id}`).emit('lobby:chat', msg);
});
```

No XSS risk because Phaser `Text` objects do not render HTML. No profanity filter needed for a college event (players know each other).

---

## AFK Detection Design

| Phase | Timeout | Action |
|-------|---------|--------|
| Lobby (waiting) | 60s no input | Server emits `lobby:afk-warning` at 45s, auto-kicks at 60s |
| Lobby (loading) | No AFK check | Players are passively loading assets |
| In-match (alive) | 30s no input | Broadcast "[Player] is AFK" via chat; no auto-kick (they lose by dying) |
| In-match (spectating) | No AFK check | Spectators are passively watching |

Client implementation: track `Date.now()` on any keyboard/mouse event. Send `lobby:heartbeat` every 15s with `lastInputTime`. Server compares timestamps.

---

## Spawn Point System

Use Tiled object layers (already integrated via existing map system):

1. Add a `spawns` object layer to each Tiled map
2. Each spawn point is a Tiled point object with custom properties: `team` (number), `index` (number)
3. Server stores spawn point data per map (loaded from a JSON config, or hardcoded initially)
4. `matchConfig` payload (already sent on `lobby:started`) includes spawn assignments per player

```typescript
// Extend existing MatchConfig
export type MatchConfig = {
  lobbyId: string;
  players: PlayerInfo[];
  mode: string;
  spawns: Record<string, SpawnPoint>;  // NEW: playerId -> spawn position
  mapId: string;                        // NEW: which map to load
};
```

---

## Version Compatibility (All Verified from Installed Packages)

| Package | Installed Version | Compatible With | Notes |
|---------|------------------|-----------------|-------|
| socket.io | 4.8.3 | socket.io-client 4.8.3 | Major versions must match; already matched |
| Phaser | 3.87.0 | TypeScript 5.7.3 | Ships proper .d.ts since 3.80+ |
| Vite | 6.0.7 | TypeScript 5.7.3 | No issues |
| Node.js | 20.11.0 (volta) | All server deps | LTS, fully supported through 2026 |
| Express | 4.21.0 | socket.io 4.8.3 | Standard integration, verified in existing server.ts |

---

## Installation

```bash
# No new packages needed for v1.2.
# Verify existing installs:
cd /c/Users/Arthu/Desktop/code/game-topicos-especiais && pnpm install
cd game-server && npm install
```

---

## Sources

| Source | What Was Verified | Confidence |
|--------|------------------|------------|
| Installed `node_modules/socket.io/package.json` | Version 4.8.3, rooms/broadcasting are core features | HIGH |
| Installed `node_modules/phaser/package.json` | Version 3.87.0, Scene/Camera/Timer APIs | HIGH |
| Existing `game-server/src/server.ts` | socket.io room pattern already working for lobbies | HIGH |
| Existing `game-server/src/lobby-manager.ts` | Lobby CRUD already implemented, just needs extensions | HIGH |
| Existing `src/networking/network-manager.ts` | WebRTC mesh fully implemented, channels stay open after death | HIGH |
| Existing `src/scenes/lobby-scene.ts` | Phaser-native UI pattern established (text, containers, rectangles) | HIGH |
| Existing `src/common/event-bus.ts` | EventEmitter pattern for decoupled communication | HIGH |
| Training data for socket.io rooms/chat patterns | Well-established patterns, stable since socket.io 2.x | MEDIUM |
| Training data for Phaser camera.startFollow() | Documented in Phaser 3 API since 3.0 | MEDIUM |

---
*Stack research for: v1.2 Lobby & Game Start Flow*
*Researched: 2026-04-21*
