# Stack Research — LAN Co-op Phaser 3 Game

## Domain
2-player LAN cooperative game built on Phaser 3 + TypeScript, requiring real-time synchronization of player positions, spell projectiles, and enemy state across two client machines with a dedicated server.

## Recommended Stack

### Networking Layer

**Option 1: WebSocket + Node.js server (RECOMMENDED)**
- Library: `ws` (Node.js WebSocket) or `socket.io` (3.x/4.x)
- Confidence: HIGH — well-established pattern for browser games
- Server: Small Node.js process running on a third LAN machine
- Clients: Both Phaser clients connect via `WebSocket` browser API
- Rationale: Phaser 3 runs in a browser — WebSocket is the native real-time protocol for browsers. No plugins needed, works on LAN trivially.

```
Server (Node.js + ws):
  - port 3000 (or configurable)
  - Receives input events from both clients
  - Broadcasts authoritative game state back
    OR
  - Acts as relay (peer-to-peer messages via server)

Client (Phaser 3):
  - Sends: player input (keys held, spell cast events)
  - Receives: other player's position, spell events, enemy state changes
```

**Option 2: socket.io (if simpler DX preferred)**
- Version: socket.io 4.x
- Adds: automatic reconnection, room concept, fallback transport
- Tradeoff: heavier (73KB vs ws 5KB), slightly higher latency
- Confidence: HIGH — very popular for small multiplayer browser games

**Option 3: WebRTC data channels (NOT recommended for this scope)**
- More complex setup (signaling server still needed)
- P2P would bypass the dedicated server requirement
- Only benefit is lower latency at scale — overkill for 2 players on LAN

### Recommended: socket.io 4.x + Node.js

```json
// Server dependencies
"socket.io": "^4.7.0",
"express": "^4.18.0"

// Client (already in project)
"phaser": "3.87.0"
// browser built-in WebSocket (no extra client dep if using raw ws)
// OR:
"socket.io-client": "^4.7.0"
```

### Synchronization Model

**Recommended: Input relay (server relays input events, clients simulate)**

```
Client A sends: { type: "INPUT", keys: { up: true, castSpell: 1 }, seq: 42 }
Server broadcasts: same event to Client B
Client B processes input as if it were local, advances simulation
```

Advantages:
- Minimal bandwidth (input events << full state)
- Deterministic simulation stays in sync if physics is authoritative on server
- Fast on LAN (sub-5ms latency typical)

Alternative: Full state sync (server broadcasts all positions every tick)
- Simpler to implement but more bandwidth
- Acceptable for 2 players on LAN with simple Arcade Physics

**Recommendation for 3-4 month deadline: Full state sync, 20 ticks/sec**
- Simpler to implement
- On LAN: 20fps state broadcast is imperceptible
- No complex rollback/prediction needed

### Process Architecture

```
game-server/         (new sub-directory)
  server.ts          Node.js WebSocket server
  game-state.ts      Authoritative game state
  package.json       { "main": "server.ts", deps: ws/socket.io }

src/                 Phaser 3 client (existing)
  common/
    network-manager.ts   WebSocket client wrapper
  scenes/
    lobby-scene.ts   Connect screen (enter server IP)
    game-scene.ts    Extended with multiplayer sync
```

### Build & Run

```bash
# Run server
cd game-server && node server.js

# Run each client (open browser on each LAN machine)
pnpm start  →  opens http://localhost:5173
             →  player enters server IP (e.g., 192.168.1.10:3000)
```

## Versions (2025)

| Package | Version | Notes |
|---------|---------|-------|
| Node.js | 20 LTS | Already pinned via Volta |
| socket.io | 4.7.5 | Latest stable |
| socket.io-client | 4.7.5 | Matches server version |
| express | 4.18.3 | For serving static files from server if needed |

## What NOT to Use

- **Colyseus** — Good framework but adds significant complexity and learning curve; overkill for 2 players
- **WebRTC** — Designed for P2P; adds signaling complexity with no benefit on LAN
- **Firebase Realtime DB** — Requires internet, not LAN-appropriate
- **Multiplayer game engines (Unity Netcode etc.)** — Wrong engine entirely
