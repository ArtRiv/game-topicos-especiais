# Phase 1: LAN Foundation — Research

**Phase:** 01 — LAN Foundation
**Researched:** 2026-03-27
**Requirements:** NET-01, NET-02, NET-03, NET-04, NET-05, NET-06, CORE-03

---

## RESEARCH COMPLETE

---

## Executive Summary

Phase 1 is greenfield networking on top of a mature single-player Phaser 3 codebase. The work splits cleanly into three independent workstreams that can be planned in parallel:

1. **Server** (`game-server/`) — Node.js 20 + socket.io 4.x dedicated server with lobby and state relay
2. **Lobby UI** — New Phaser `LobbyScene` (ConnectScene + lobby list + waiting room) added to Phaser scene registry
3. **Client Networking** — `NetworkManager` singleton + `RemoteInputComponent` wired into existing `Player`/`GameScene`

The hardest integration point is **room transition sync**: the existing transition is driven by `GameScene` local player door collisions. We need the server to be the authority, broadcasting the transition to all clients (including the triggering one) so they fire in lockstep.

---

## Standard Stack

### Server
| Concern | Choice | Reason |
|---------|--------|--------|
| Runtime | Node.js 20 | Already decided; pinned by Volta |
| Transport | socket.io 4.8.x | Already decided; handles reconnection, namespaces, rooms |
| Server framework | Express + http.createServer | Only needed to host socket.io; no REST routes required for Phase 1 |
| Package manager | pnpm (workspace) | Use pnpm workspaces to allow `game-server/` as a sibling package with own `package.json` |
| TypeScript | Yes, shared tsconfig | Strongly type all socket event payloads; avoids silent type bugs at the network boundary |

### Client
| Concern | Choice | Reason |
|---------|--------|--------|
| Transport client | socket.io-client 4.8.x | Matches server; auto-reconnect, event-based |
| Bundling | Vite (existing) | No change needed — Vite handles ESM fine with socket.io-client |
| Manager pattern | Singleton (`static #instance`) | Matches DataManager/ElementManager conventions already in codebase |

---

## Architecture Decisions

### 1. Server Structure (`game-server/`)

```
game-server/
  package.json        ← own deps: socket.io, typescript
  tsconfig.json       ← extends root tsconfig
  src/
    server.ts         ← entry point: http server + io setup
    lobby-manager.ts  ← manages lobby list: create/list/join
    game-room.ts      ← manages one active match: player slots, state relay
    types.ts          ← shared socket event payload types
```

The server is a **relay + authority** for Phase 1:
- Relays position/state updates from each client to all others
- Is authoritative on: lobby creation, player slot assignment, room transitions
- Does NOT run game physics — clients are authoritative on their own local player movement

### 2. Socket.io Room Model

Leverage socket.io's native **rooms** (not the game concept of "rooms/dungeons") to group lobby participants:
- Each lobby = one socket.io room with ID `lobby:{lobbyId}`
- On match start, same socket.io room is repurposed to `game:{lobbyId}`
- Server broadcasts game events to `game:{lobbyId}`

This avoids manual connection tracking lists.

### 3. Event Protocol (Phase 1 scope)

**Lobby events (client→server):**
```
lobby:create  { playerName }                   → server creates lobby, assigns host slot
lobby:list    {}                               → server emits lobby:list with open lobbies
lobby:join    { lobbyId, playerName }          → server adds player, broadcasts update
lobby:leave   {}                               → server removes player, broadcasts update
lobby:set-mode { gameMode }                    → host only: sets team config
lobby:start   {}                               → host only: starts match, transitions all
```

**Lobby events (server→client):**
```
lobby:created    { lobby }                     → confirmation to creator
lobby:list       { lobbies: Lobby[] }          → list of open lobbies
lobby:updated    { lobby }                     → broadcast when player joins/leaves/mode changes
lobby:started    { matchConfig }               → broadcast to all in lobby: game starts now
```

**Game events (client→server, during play):**
```
game:player-update  { x, y, direction, state, element }   → 20 Hz tick
game:spell-cast     { spellId, element, x, y, direction }
game:room-transition-request { levelName, doorId, roomId } → only door-touching client sends
```

**Game events (server→client):**
```
game:player-update  { playerId, x, y, direction, state, element }  → relay to others
game:spell-cast     { playerId, spellId, element, x, y, direction }
game:room-transition { levelName, doorId, roomId }                  → broadcast after request
game:player-disconnected { playerId }
game:player-reconnected  { playerId }
```

### 4. `NetworkManager` Singleton (Client)

```typescript
// src/networking/network-manager.ts
import { io, Socket } from 'socket.io-client';

export class NetworkManager {
  static #instance: NetworkManager | undefined;
  #socket: Socket;
  #localPlayerId: string = '';
  #isConnected: boolean = false;

  private constructor(serverUrl: string) {
    this.#socket = io(serverUrl, { autoConnect: false });
    this.#setupListeners();
  }

  static getInstance(): NetworkManager {
    if (!NetworkManager.#instance) {
      throw new Error('NetworkManager not initialized. Call NetworkManager.init() first.');
    }
    return NetworkManager.#instance;
  }

  static init(serverUrl: string): NetworkManager {
    if (NetworkManager.#instance) return NetworkManager.#instance;
    NetworkManager.#instance = new NetworkManager(serverUrl);
    return NetworkManager.#instance;
  }
  // ...
}
```

Key design decisions:
- **Lazy init:** `init(serverUrl)` called from `LobbyScene` once user has confirmed server URL
- **EventBus bridge:** On game events, `NetworkManager` emits on `EVENT_BUS` so `GameScene` doesn't import `NetworkManager` directly
- **Ticker for outbound:** A 20 Hz `setInterval` in `NetworkManager.startGameTick()` sends the local player's position. This is started after `lobby:started`.

### 5. `RemoteInputComponent` (Client)

Extends `InputComponent` instead of reading keyboard — gets set externally from network snapshots:

```typescript
// src/components/input/remote-input-component.ts
import { InputComponent } from './input-component';

export class RemoteInputComponent extends InputComponent {
  applySnapshot(snapshot: PlayerSnapshot): void {
    this.isUpDown = snapshot.up;
    this.isDownDown = snapshot.down;
    this.isLeftDown = snapshot.left;
    this.isRightDown = snapshot.right;
    // direction/state applied directly on CharacterGameObject as override
  }
}
```

Alternative approach (simpler for Phase 1): skip recreating individual key states and instead set position **directly** on the remote player's `CharacterGameObject.x/y` from the snapshot. This avoids needing to reverse-engineer from position delta back to input state. The state machine animation can be driven from the `state` field in the snapshot.

**Recommended:** Direct position lerp for Phase 1. `RemoteInputComponent` can be a stub that locks movement (`isMovementLocked = true`) while the position is set externally by `NetworkManager`.

### 6. Phaser Scene — `LobbyScene`

New scene added before `PreloadScene` in the scene chain:

```
LobbyScene (NEW)
  → user enters server IP:port
  → connects to server
  → shows lobby list
  → create/join lobby
  → waiting room (host sets mode, presses Start)
  → on lobby:started → start PreloadScene (if not loaded) OR GameScene
```

Scene flow change in `main.ts`:
```
Current:  start(PRELOAD_SCENE) → GameScene automatically
Planned:  start(LOBBY_SCENE)  → [user connects + joins lobby] → starts PreloadScene → GameScene
```

### 7. Room Transition Sync

Current flow (single-player):
```
Player touches door → GameScene.#handleDoorTransition() → local scene restart
```

New flow (networked):
```
Any player touches door →
  GameScene calls NetworkManager.requestRoomTransition(levelName, doorId, roomId) →
  Server receives game:room-transition-request →
  Server broadcasts game:room-transition to ALL in room →
  All clients (including requester) receive event →
  GameScene.#handleDoorTransition() fires on receipt of event (not on local touch)
```

Critical: the local player must NOT trigger the transition directly. It should only emit the request and wait for the server echo. This prevents race conditions if two players touch different doors simultaneously — server accepts first request, discards second.

---

## Don't Hand-Roll

- **Reconnection logic** — socket.io handles this natively. Set `reconnectionAttempts: 5`, `reconnectionDelay: 1000`. Emit `game:player-disconnected` via server disconnect event.
- **UUID generation** — `crypto.randomUUID()` (available in Node 20 + modern browsers). No extra library needed for lobby/player IDs.
- **setInterval for game tick** — native JS is fine at 20 Hz (50ms). No game loop library needed for the network tick.
- **HTTP server** — `http.createServer(app)` with Express is sufficient. No Fastify/Koa needed.

---

## Common Pitfalls

| Pitfall | Prevention |
|---------|-----------|
| Room transitions triggering twice (local + remote echo) | Never trigger transition locally. Only trigger on server `game:room-transition` echo. |
| Socket ID vs player slot ID confusion | Server assigns a stable `playerId` (UUID) on `lobby:join`. Use that everywhere, not `socket.id`. |
| 20 Hz tick accumulates during scene transition | `NetworkManager.stopGameTick()` during transitions; resume after `game:room-transition` received. |
| `RemoteInputComponent` fighting with direct position set | Lock movement on RemoteInputComponent (`isMovementLocked = true`); set `x/y` + `anims.play` directly. |
| socket.io-client treeshaking issue with Vite | Use `import { io } from 'socket.io-client'` (named export) — avoids CJS bundle issues in Vite ESM. |
| TypeScript strict null checks on socket events | Type all event payloads explicitly in `game-server/src/types.ts`; re-export and import in client too. |
| GameScene singleton DataManager reset issue | Multiplayer needs multiple player states. DataManager currently handles only one player. Phase 1 sidesteps this: remote player state lives in NetworkManager's player map, not DataManager. DataManager remains single-player for now. |
| CORS error if server and client on different origins | Add `cors: { origin: '*' }` to socket.io server options for LAN dev. |
| Phaser WebGL context lost when tab is backgrounded | Not a Phase 1 concern — mention in Phase 2 when remote player state staleness matters. |

---

## Validation Architecture

### What to automate vs what to verify manually

**Automated (unit):**
- `LobbyManager` — create/list/join/leave logic (pure state, no socket needed)
- `GameRoom` — player slot add/remove, room start conditions
- Event payload type round-trips (serialize → deserialize)

**Automated (integration):**
- Socket.io server test: Two mock clients connect, one sends `game:player-update`, verify relay to other client
- Room transition test: Client sends `game:room-transition-request`, verify all clients receive `game:room-transition`

**Manual (UAT):**
- Two real browser tabs; P1 moves and P2 sees position update
- Lobby list appears on P2's screen after P1 creates lobby
- Disconnect one tab — other tab shows error message

### Test framework recommendation
Use **Vitest** (already compatible with Vite/ESM setup) for both unit and integration tests. For socket.io integration tests, use `io` from `socket.io-client` connecting to a real local server spun up in `beforeAll`.

---

## Phase 1 File Map

| File | New / Modified | Purpose |
|------|---------------|---------|
| `game-server/package.json` | NEW | Server package |
| `game-server/src/server.ts` | NEW | Entry point |
| `game-server/src/lobby-manager.ts` | NEW | Lobby CRUD |
| `game-server/src/game-room.ts` | NEW | Active match relay |
| `game-server/src/types.ts` | NEW | Shared payload types |
| `src/networking/network-manager.ts` | NEW | Client singleton |
| `src/networking/types.ts` | NEW | Client-side network types |
| `src/components/input/remote-input-component.ts` | NEW | RemoteInputComponent |
| `src/scenes/lobby-scene.ts` | NEW | Connect/lobby/waiting UI |
| `src/scenes/scene-keys.ts` | MODIFIED | Add LOBBY_SCENE key |
| `src/main.ts` | MODIFIED | Register + start LobbyScene first |
| `src/common/event-bus.ts` | MODIFIED | Add network CUSTOM_EVENTS |
| `src/common/config.ts` | MODIFIED | Add SERVER_URL, SERVER_PORT constants |
| `src/scenes/game-scene.ts` | MODIFIED | Hook room transitions to NetworkManager |

---

## Key Open Questions (Resolved)

**Q: Should the server live in a pnpm workspace or be completely separate?**
A: pnpm workspace at root level. Add `game-server` to `pnpm-workspace.yaml`. Keeps TypeScript types shared easily.

**Q: Should `LobbyScene` load before or after asset preloading?**
A: Before. `PreloadScene` is expensive (loads all sprites). Connect to server first, join lobby, then start `PreloadScene` while the waiting room shows. Assets are ready by the time the host clicks Start.

**Q: What player tint colors?**
A: Server assigns per slot index. Suggested palette (readable on dark backgrounds):
- Slot 0 (local = no tint or white): `0xffffff`
- Slot 1: `0x00aaff` (blue)
- Slot 2: `0xff4444` (red)
- Slot 3: `0x44ff44` (green)
- Slot 4: `0xff44ff` (magenta)
- Slot 5+: cycle

**Q: How does `GameScene` know which player object is local vs remote?**
A: `NetworkManager` exposes `localPlayerId`. `GameScene` checks `player.id === NetworkManager.getInstance().localPlayerId` to decide which player to attach keyboard controls vs `RemoteInputComponent`.
