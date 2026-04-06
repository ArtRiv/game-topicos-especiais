# Architecture Patterns — v2.0 PvP Integration

**Project:** Mages — PvP Multiplayer
**Researched:** 2026-03-26
**Confidence:** HIGH (based on direct codebase analysis + established socket.io + Phaser 3 patterns)

---

## 1. Auth Flow — Where OAuth Fits in Phaser's Scene Structure

### Decision: Pre-Phaser HTML Login Page → JWT in SessionStorage

Do NOT embed Google OAuth inside a Phaser scene. Google Sign-In requires a browser redirect or popup flow that is simpler to handle in plain HTML. Phaser loads only after auth is complete.

```
User opens browser
  → index.html detects no JWT in sessionStorage
  → redirect to /login.html
      → Google Sign-In button
      → OAuth redirect → backend /auth/google/callback
      → backend issues JWT, redirects to /game.html?token=<jwt>
  → /game.html stores JWT in sessionStorage, removes token from URL
  → Phaser.Game boots (main.ts)
  → PreloadScene reads JWT from sessionStorage
  → NetworkManager connects socket.io with JWT in auth header
```

### Scene Structure Change

Add new scenes before `GameScene`:

```
PreloadScene (existing — loads assets)
  └── AuthScene (NEW — reads JWT, fetches account, shows player name)
        └── MenuScene (NEW — main menu: create lobby / join lobby / leaderboard)
              └── LobbyScene (NEW — lobby wait room)
                    └── PvPGameScene (NEW — forked from GameScene)
                          └── MatchResultsScene (NEW — rank change, XP earned)
```

`GameScene` is forked into `PvPGameScene`. The original `GameScene` stays in git history.

### JWT Passing to Socket.io

```typescript
// src/common/network-manager.ts
import { io, Socket } from 'socket.io-client';

const token = sessionStorage.getItem('mages_jwt');
this.#socket = io(SERVER_URL, {
  auth: { token },                  // sent in handshake; server verifies on connect
  transports: ['websocket'],        // skip polling for lower latency
});
```

Server-side middleware verifies the JWT on every socket connection with `jsonwebtoken.verify()`. Invalid tokens are rejected before entering any room.

---

## 2. Lobby System — Phaser Scene, Not a Separate Web Page

### Decision: `LobbyScene` as a Full-Screen Phaser Scene

Keeping the lobby inside Phaser avoids a full page reload and maintains game aesthetic (same fonts, background, sound). Use Phaser `BitmapText` and `Graphics` for lobby UI; `Phaser.GameObjects.DOMElement` for the lobby code text input only.

```
MenuScene
  → Player clicks "Create Lobby"
      → NetworkManager.createLobby()
      → server assigns lobbyCode (6-char alphanumeric), emits lobby:created
      → transition to LobbyScene (as owner)
  → Player clicks "Join Lobby"
      → DOMElement text input for lobby code
      → NetworkManager.joinLobby(code)
      → server emits lobby:joined or lobby:error
      → transition to LobbyScene (as participant)

LobbyScene (socket.io room = lobbyCode)
  → shows player list (display name + element choice)
  → owner sees "Start Match" button + game mode selector
  → server emits lobby:player_joined / lobby:player_left as players enter/exit
  → owner clicks Start → server emits match:starting → all clients → PvPGameScene
```

### Lobby State Sync Protocol

Socket.io room = lobby code. Server is the single source of truth. All events route through server; clients never communicate directly.

```
Client → server: lobby:join     { code, token }
Server → room:   lobby:state    { players: [{ id, name, element }], mode, ownerId }
Client → server: lobby:ready    { element }
Server → room:   lobby:player_updated { playerId, element, ready }
Owner  → server: match:start
Server → room:   match:starting { mapId, playerAssignments, countdown: 3 }
```

---

## 3. PvP Sync Architecture — Semi-Authoritative with Interpolation

### Model: Client-Authoritative Movement + Server-Authoritative Damage

For a college event (~8 players, top-down spell combat), the pragmatic model:

- **Local player**: runs full state machine + `KeyboardComponent`, sends input snapshots to server at 20Hz
- **Remote players**: lightweight `RemotePlayer` objects that receive server-broadcast snapshots and interpolate
- **Damage/spell hits**: server validates hit registration (position cross-check), broadcasts authoritative HP events

This prevents visible lag on the controlling player while keeping HP/elimination server-authoritative (cheat-resistant at college event scale).

### Server Tick Rate

- **20 Hz** (50ms interval) — position/state broadcast loop
- **Event-driven** for spell casts (sent immediately, not on tick)
- **Event-driven** for hits (resolved immediately on server then broadcast)

### Wire Protocol

**Client → Server (20 Hz, per tick)**
```typescript
type InputSnapshot = {
  seq:   number;    // monotonic sequence for reconciliation
  up:    boolean;
  down:  boolean;
  left:  boolean;
  right: boolean;
  x:     number;   // client-side position for server validation
  y:     number;
};
```

**Client → Server (event-driven, on spell cast)**
```typescript
type SpellCastEvent = {
  spellId:  SPELL_ID;
  element:  ELEMENT;
  x: number; y: number;          // caster origin
  targetX: number; targetY: number; // aim direction
};
```

**Server → All Clients (20 Hz broadcast)**
```typescript
type WorldSnapshot = {
  tick: number;
  players: {
    id:        string;
    x:         number; y: number;
    direction: DIRECTION;
    state:     CHARACTER_STATES;
    hp:        number;
    mana:      number;
    element:   ELEMENT;
    alive:     boolean;
  }[];
};
```

**Server → All Clients (event-driven)**
```typescript
type HitEvent       = { targetId: string; spellId: SPELL_ID; damage: number; newHp: number; };
type EliminatedEvent = { playerId: string; killedBy: string; placement: number; };
type MatchEndEvent  = { winnerId?: string; winnerTeam?: number; results: MatchResult[]; };
```

### Interpolation for Remote Players

Remote players render with a 100ms delay. Client buffers snapshots and interpolates between the two surrounding the render timestamp:

```typescript
// RemotePlayer.update()
const renderTimestamp = Date.now() - INTERPOLATION_DELAY_MS; // 100ms
const [from, to] = this.#snapshotBuffer.getInterpolationPair(renderTimestamp);
this.x = lerp(from.x, to.x, alpha);
this.y = lerp(from.y, to.y, alpha);
this.playAnimation(to.state, to.direction);
```

---

## 4. NetworkManager — Singleton Design

### New: `NetworkManager` Singleton

```
src/common/network-manager.ts   (NEW)
```

Wraps socket.io `Socket`. Pure network singleton — knows nothing about Phaser. `PvPGameScene` listens to `NetworkManager` events and updates game objects.

```typescript
class NetworkManager {
  static #instance: NetworkManager;
  #socket: Socket;
  #playerId: string;
  #lobbyCode: string | null;
  #matchId:   string | null;

  static getInstance(): NetworkManager
  connect(token: string): Promise<void>
  joinLobby(code: string): Promise<LobbyState>
  createLobby(): Promise<{ code: string }>
  sendInput(snapshot: InputSnapshot): void
  sendSpellCast(event: SpellCastEvent): void
  on<T>(event: string, handler: (data: T) => void): void
  off(event: string, handler: Function): void
}
```

### Local Player vs Remote Player Strategy

Two options — **Strategy B recommended** for its simplicity:

| | Strategy A: Full Simulation | Strategy B: Ghost Interpolation (recommended) |
|---|---|---|
| Remote class | `Player` + `NetworkInputComponent` | `RemotePlayer` (new lightweight class) |
| State machine | FSM runs for all players on all clients | None — animation from server snapshot |
| Desync risk | High (each client simulates independently) | None — server is truth |
| Code complexity | Medium | Low |

### New: `RemotePlayer`

```
src/game-objects/player/remote-player.ts   (NEW)
```

Extends `CharacterGameObject` (or `Arcade.Sprite` directly). No state machine, no input component. Exposes `applySnapshot(snap: WorldSnapshotPlayer)` which lerps position and plays the correct animation frame.

### Modified: `PvPGameScene`

```
src/scenes/pvp-game-scene.ts   (NEW — forked from game-scene.ts)
```

Key diffs from `GameScene`:

| Area | GameScene (old) | PvPGameScene (new) |
|------|-----------------|-------------------|
| Players | `#player: Player` (single) | `#localPlayer: Player` + `Map<string, RemotePlayer>` |
| Enemies | Spawned from Tiled | Removed — pure PvP arena |
| Spell combo detection | Local in `update()` | Server emits `hit:event`; client applies damage |
| Room system | Multi-room navigation | Single arena (no doors/chests) |
| Death handling | Local game over | Listens for `player:eliminated` from server |
| `DataManager` | Used for save state | Not used — account state from server |

**Input send loop in `PvPGameScene.update()`:**
```typescript
if (this.#shouldSendThisTick()) {
  NetworkManager.getInstance().sendInput({
    seq: this.#inputSeq++,
    up:    this.#controls.isUpDown,
    down:  this.#controls.isDownDown,
    left:  this.#controls.isLeftDown,
    right: this.#controls.isRightDown,
    x:     this.#localPlayer.x,
    y:     this.#localPlayer.y,
  });
}
```

---

## 5. Ranking + Progression Backend

### API Strategy: REST for Persistent Data, Socket.io for Match-Scoped Events

| Data | Transport | Reason |
|------|-----------|--------|
| Account info, leaderboard | REST GET | Cacheable, stateless |
| Upgrade purchases | REST PATCH | Transactional, not time-sensitive |
| Lobby state, player positions | Socket.io | Push-required, low-latency |
| Match end → rank/XP update | Socket.io event triggers internal DB write | Match lives in socket context |

### REST Endpoints (Node.js + Express)

```
POST /auth/google/callback       → exchange Google code for JWT, create account if new
GET  /api/me                     → current player account + progression stats
GET  /api/leaderboard?limit=50   → top-ranked players
GET  /api/player/:id             → public profile
PATCH /api/me/upgrades           → spend upgrade points { stat, points }
```

### DB Schema (PostgreSQL)

```sql
CREATE TABLE accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id     VARCHAR(255) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE progression (
  account_id          UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  level               INTEGER DEFAULT 1,
  xp                  INTEGER DEFAULT 0,
  upgrade_points      INTEGER DEFAULT 0,
  cooldown_bonus_pct  FLOAT   DEFAULT 0,   -- e.g. 0.10 = 10% reduction
  max_mana_bonus      INTEGER DEFAULT 0,   -- added to base PLAYER_MAX_MANA
  max_hp_bonus        INTEGER DEFAULT 0    -- added to base player HP
);

CREATE TABLE rankings (
  account_id  UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  rank_score  INTEGER DEFAULT 1000,        -- ELO-style, starts at 1000
  wins        INTEGER DEFAULT 0,
  losses      INTEGER DEFAULT 0,
  kills       INTEGER DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE matches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_mode        VARCHAR(20) NOT NULL,   -- 'battle_royale'|'2v2'|'3v3'|'4v4'
  played_at        TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER,
  winner_team      INTEGER                 -- NULL for battle_royale
);

CREATE TABLE match_participants (
  match_id    UUID REFERENCES matches(id)   ON DELETE CASCADE,
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  team        INTEGER,
  placement   INTEGER NOT NULL,            -- 1 = winner / winning team
  kills       INTEGER DEFAULT 0,
  rank_delta  INTEGER,                     -- positive = gained, negative = lost
  xp_earned   INTEGER,
  PRIMARY KEY (match_id, account_id)
);

CREATE INDEX idx_rankings_score           ON rankings(rank_score DESC);
CREATE INDEX idx_match_participants_account ON match_participants(account_id);
```

### Rank Score Formula

```
Win:  rank_score += 25 + floor(25 × (avg_opponent_rank - own_rank) / 400)
Loss: rank_score -= 20
Battle Royale: rank_delta = (8 - placement) × 7 - 14
  (placement 1 = +49, placement 8 = -14)
```

### XP + Level Formula

```
xp_per_match = base_xp[game_mode] + kill_bonus × kills + win_bonus × isWin
level = floor(xp / 500) + 1      (level 1 = 0 XP, level 2 = 500, etc.)
upgrade_points_on_level_up = 2
```

---

## 6. New vs Modified Components

### New Files (do not exist today)

```
server/                              # NEW backend — Node.js + Express + socket.io
  src/
    index.ts                         # app + socket.io server entry
    auth/google.ts                   # Passport.js Google OAuth strategy
    auth/jwt.ts                      # sign/verify helpers
    middleware/socket-auth.ts        # JWT verification for socket connections
    routes/me.ts                     # GET /api/me, PATCH /api/me/upgrades
    routes/leaderboard.ts            # GET /api/leaderboard
    socket/lobby-handlers.ts         # lobby:create, lobby:join, lobby:ready
    socket/match-handlers.ts         # match:start, player:input, spell:cast, match:end
    db/schema.sql                    # DB creation script
    db/client.ts                     # pg Pool singleton
    db/accounts.ts / rankings.ts / progression.ts

src/common/network-manager.ts        # socket.io client singleton
src/common/auth.ts                   # JWT read/write from sessionStorage
src/common/account-types.ts          # Account, Progression, RankInfo interfaces
src/components/input/network-input-component.ts   # (optional, if Strategy A chosen)
src/game-objects/player/remote-player.ts          # lightweight interpolated ghost
src/scenes/auth-scene.ts             # reads JWT, shows player name
src/scenes/menu-scene.ts             # main menu
src/scenes/lobby-scene.ts            # lobby wait room
src/scenes/pvp-game-scene.ts         # fork of game-scene.ts, adapted for PvP
src/scenes/match-results-scene.ts    # post-match: rank change, XP, progression
public/login.html                    # pre-Phaser Google Sign-In page
```

### Modified Files (exist today)

```
src/main.ts              # Register new scenes; JWT check before game boot
src/scenes/scene-keys.ts # Add: AUTH, MENU, LOBBY, PVP_GAME, MATCH_RESULTS
src/common/event-bus.ts  # Add: PLAYER_ELIMINATED, MATCH_ENDED, NETWORK_CONNECTED
src/common/types.ts      # Add: MatchResult, LobbyState, AccountInfo, InputSnapshot
index.html               # Detect missing JWT → redirect to /login.html
```

### Untouched (zero modifications needed)

```
src/components/input/input-component.ts     # public setters already exist — no change
src/game-objects/player/player.ts           # accepts InputComponent — no change
src/components/state-machine/               # entirely reused for local player
src/game-objects/spells/                    # all spell classes reused in PvPGameScene
src/components/game-object/                 # all components reused unchanged
src/common/config.ts                        # base stats unchanged (progression adds deltas)
src/common/element-manager.ts              # kept for local player element switching
src/debug/debug-panel.ts                    # kept for dev; gate behind env flag
```

---

## 7. System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  login.html                                               │  │
│  │  Google OAuth → JWT → sessionStorage → redirect to game  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Phaser.Game (main.ts)                                    │  │
│  │  PreloadScene → AuthScene → MenuScene → LobbyScene        │  │
│  │                                    ↓                      │  │
│  │                             PvPGameScene                  │  │
│  │  ┌─────────────────┐  ┌──────────────────────────────┐  │  │
│  │  │  Local Player   │  │  RemotePlayer × (N-1)        │  │  │
│  │  │  KeyboardComp   │  │  Snapshot interpolation      │  │  │
│  │  │  StateMachine   │  │  No state machine            │  │  │
│  │  └─────────────────┘  └──────────────────────────────┘  │  │
│  │          ↕ NetworkManager (socket.io-client)              │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────┘
                           │ WebSocket (socket.io)
┌──────────────────────────▼───────────────────────────────────────┐
│                      Node.js Server                              │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────┐ │
│  │ Express API  │  │ Socket.io      │  │ Game Rooms          │ │
│  │ /auth/*      │  │ JWT middleware │  │ lobby:<code>        │ │
│  │ /api/me      │  └────────────────┘  │ match:<id>          │ │
│  │ /api/leader  │    Lobby handlers    └─────────────────────┘ │
│  └──────────────┘    Match handlers                            │
│                       player:input  spell:cast  match:end      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │   PostgreSQL    │
                  │ accounts        │
                  │ progression     │
                  │ rankings        │
                  │ matches         │
                  │ match_participants│
                  └─────────────────┘
```

---

## 8. Suggested Build Order (Phase Sequencing)

Dependencies flow top-to-bottom. Each phase gates the next.

```
Phase 1 — Backend Foundation
  ├── Node.js + Express skeleton + PostgreSQL schema
  ├── Google OAuth (Passport.js or google-auth-library) + JWT issue/verify
  ├── Socket.io server with JWT middleware
  └── REST: GET /api/me, GET /api/leaderboard, PATCH /api/me/upgrades
  [GATE: Login and GET /api/me responds correctly via curl/Postman]

Phase 2 — Auth UI + Client Connection
  ├── login.html with Google Sign-In button + OAuth redirect
  ├── JWT sessionStorage flow + index.html redirect guard
  ├── AuthScene in Phaser (reads token, fetches account, shows display name)
  ├── NetworkManager singleton (connect + auth handshake)
  └── MenuScene skeleton (create lobby / join lobby buttons visible)
  [GATE: Player logs in and sees "Welcome, <name>" in Phaser]

Phase 3 — Lobby System
  ├── LobbyScene with player list display
  ├── lobby:create / lobby:join / lobby:ready socket handlers on server
  ├── Game mode selector (owner only) + countdown before match start
  └── match:starting → all clients advance to PvPGameScene
  [GATE: 2 players can create/join lobby, see each other, and enter game]

Phase 4 — PvP Arena (Core Gameplay)
  ├── PvPGameScene forked from GameScene (single arena, no enemies/rooms)
  ├── RemotePlayer class with snapshot interpolation
  ├── Server match room: receives InputSnapshots, broadcasts WorldSnapshot at 20Hz
  └── All players visible and moving in arena simultaneously
  [GATE: 2–8 players see each other moving in real time]

Phase 5 — Spell Combat + Match Resolution
  ├── SpellCastEvent sent to server on spell cast; server broadcasts spawn to all
  ├── Remote spell visuals rendered from server events
  ├── Server hit validation → emits HitEvent → client applies HP damage
  ├── player:eliminated on HP ≤ 0; placement assigned by server
  ├── match:end when last player/team standing
  └── MatchResultsScene shows final placements
  [GATE: Players can eliminate each other; match ends and results display]

Phase 6 — Ranking, XP + Progression
  ├── Server updates rank_score + xp + level on match:end (DB writes)
  ├── MatchResultsScene shows rank delta + XP earned per player
  ├── Upgrade screen: spend upgrade points on cooldown/mana/HP
  ├── PvPGameScene reads account progression when spawning local Player (apply bonuses)
  └── Leaderboard scene populated from GET /api/leaderboard
  [GATE: Full loop — login → lobby → match → rank update → upgrades → next match]

Phase 7 — Game Modes + Event Hardening
  ├── Team assignment logic: 2v2, 3v3, 4v4 (team-aware friendly fire skip)
  ├── Battle Royale ruleset
  ├── Reconnection handling (socket disconnect → rejoin match in progress)
  └── Rate limiting, max lobby size cap, crash recovery
  [GATE: All game modes playable; event-day stability verified]
```

### Critical Path

```
DB schema → OAuth → JWT → socket connect → lobby rooms
  → PvPGameScene multi-player → spell broadcast → hit validation
    → match resolution → rank/XP writes → progression applies to next match
```

**Phases 1–3 are the true blockers.** Gameplay (Phase 4) cannot be tested without a working socket.io room from the lobby.

---

## 9. Integration Points Summary

| Existing Asset | How It Integrates | Change |
|----------------|-------------------|---------:|
| `InputComponent` (public setters) | `NetworkInputComponent` can extend it for network-driven input (Strategy A) | None |
| `Player(config: { controls: InputComponent })` | Local player passes `KeyboardComponent`; unchanged | None |
| `CharacterGameObject` base class | `RemotePlayer` extends it for consistent physics/animation API | None |
| `StateMachine` | Local player only; remote players use ghost interpolation | None |
| `SpellCastingComponent` | Local player runs it; add `sendSpellCastEvent()` call when casting | Minimal hook |
| `EVENT_BUS` | Add `PLAYER_ELIMINATED`, `MATCH_ENDED`, `NETWORK_CONNECTED` events | Add events only |
| `DataManager` | Not used in PvPGameScene — replaced by server account state | Not used |
| `ElementManager` | Kept for local player element switching radial menu | Unchanged |
| All spell classes | Reused in PvPGameScene for local player visual; remote spells spawned from server events | Unchanged |
| `RUNTIME_CONFIG` / debug panel | Kept in development; disabled via env flag in production | Env gate |

---

## Sources

- Codebase direct analysis — `InputComponent` public setters confirmed (src/components/input/input-component.ts)
- Codebase direct analysis — `Player` accepts `controls: InputComponent` (src/game-objects/player/player.ts)
- socket.io documentation — `auth` option in connection (HIGH confidence, established pattern)
- Google OAuth authorization code flow (HIGH confidence, stable since 2020)
- Phaser 3 multi-player ghost interpolation — community-established pattern (HIGH confidence)
- ELO rank formula — standard implementation (HIGH confidence)

## Recommended Architecture: Client-Server with State Sync

### Server Role

```
game-server/server.ts (Node.js)
  - Owns authoritative enemy state (positions, health, AI ticks)
  - Receives player input from both clients
  - Broadcasts: { player1: {...}, player2: {...}, enemies: [...], spells: [...] }
  - Tick rate: 20 Hz (50ms per tick)
  - Does NOT run Phaser — pure logic + data
```

### Client Role

Each client runs the full Phaser game but:
- "Local player" is fully simulated locally (responsive)
- "Remote player" position is interpolated from server snapshots
- Spell cast events are sent to server and confirmed back
- Enemy state is driven by server (clients render enemy positions from server data)

### Network Manager Component

```typescript
// src/common/network-manager.ts (new)
export class NetworkManager {
  static #instance: NetworkManager;
  #socket: Socket;              // socket.io-client
  #playerId: 'P1' | 'P2';

  public connect(serverAddress: string): void { ... }
  public sendInput(inputState: InputSnapshot): void { ... }
  public on(event: string, handler: Function): void { ... }
  public emit(event: string, data: unknown): void { ... }
}
```

Fits the existing singleton pattern. Event bus integration:

```typescript
// NetworkManager bridges socket events → EVENT_BUS
socket.on('remotePlayerMoved', (data) => {
  EVENT_BUS.emit(CUSTOM_EVENTS.REMOTE_PLAYER_UPDATED, data);
});
```

### Second Player Architecture

The `CharacterGameObject` already supports multiple instances. A second `Player` object is created in `GameScene` with:
- A `RemoteInputComponent` instead of `KeyboardComponent`
- `RemoteInputComponent` reads from the latest network snapshot
- Same state machine, same animations, same physics body

```typescript
// src/components/input/remote-input-component.ts (new)
export class RemoteInputComponent extends InputComponent {
  // Updated each frame from latest network snapshot
  public update(snapshot: PlayerSnapshot): void { ... }
}
```

### Cross-Player Spell Combo Detection

**Problem:** P1's spell is on Client A; P2's spell is on Client B. How do combos detect?

**Solution: Server-authoritative combo detection**

```
1. Client A casts spell → sends SPELL_CAST event to server
2. Server creates a spell entity in server-side state (position, velocity, element)
3. Server ticks: checks overlap between all spell entities
4. Server detects P1.FireBolt overlaps P2.IceWall → emits COMBO_TRIGGERED
5. Both clients receive COMBO_TRIGGERED event → play effect + deal damage
```

Alternatively (simpler, acceptable for LAN):
- Each client simulates remote player spells locally using received spell data
- Combo detection happens on each client independently
- First to detect emits to server → server confirms → both clients execute effect

**Recommendation:** Start with client-side detection + server confirmation. Move to server-authoritative if sync issues arise.

### Environmental Interactables

New game object type extending the existing `interactive-object-component` pattern:

```typescript
// src/game-objects/objects/elemental-interactable.ts (new)
export class ElementalInteractable extends Phaser.GameObjects.Sprite {
  #state: 'default' | 'wet' | 'electrified' | 'frozen' | ...
  #targetState: ElementalState;  // from Tiled properties
  
  applyElement(element: Element): void {
    // state transitions: default → wet (water), wet → electrified (thunder) = ACTIVATED
  }
}
```

Tiled map properties (new custom properties to add in Tiled):
```
interactableType: "device" | "platform" | "barrier" | ...
activationRequirement: "WET_THUNDER" | "FIRE" | "ICE_EARTH" | ...
onActivate: "open_door" | "spawn_chest" | "reveal_path" | ...
```

### Puzzle Room Architecture

Puzzle rooms are a new room type. In Tiled's `rooms` layer:
```
roomType: "combat" | "puzzle" | "boss"  (new Tiled property)
timerSeconds: 30  (0 = untimed)
failureSpawn: "hard_wave"  (what to spawn on timer failure)
```

`GameScene` checks `roomType` on room enter and activates the appropriate manager:
- Combat rooms: existing enemy management
- Puzzle rooms: `PuzzleRoomManager` tracks interactable states, timer, success condition

### Component Build Order (Dependency Graph)

```
Phase 1: Network Foundation
  NetworkManager (singleton)
  LobbyScene (IP entry, connect)
  Remote player rendering (no interaction yet)

Phase 2: Second Player Playable  
  RemoteInputComponent
  P2 CharacterGameObject instance in GameScene
  Input relay through server

Phase 3: Spell Sync
  Spell cast events over network
  Remote spell rendering
  Cross-player combo detection

Phase 4: New Elements (Ice/Wind/Thunder)
  3 new spell classes (pattern from existing)
  6 new cross-player combo effects

Phase 5: Puzzle Rooms
  ElementalInteractable object class
  PuzzleRoomManager (timer, state tracking)
  Tiled map properties for puzzle definition

Phase 6: Boss & NPCs
  Boss AI with elemental weakness state
  NPC dialogue extension
```

## Integration Points with Existing Code

| New Feature | Hooks Into |
|-------------|-----------|
| NetworkManager | `EventBus` (bridge socket → events) |
| RemoteInputComponent | `InputComponent` interface (already abstract) |
| Second Player | `CharacterGameObject`, `GameScene.#setupPlayer()` |
| Spell sync | `SpellCastingComponent`, `GameScene.#registerColliders()` |
| ElementalInteractable | `interactive-object-component`, Tiled layer parsing |
| Puzzle timer | `Phaser.Time.TimerEvent` (pattern already used) |
| Combo journal | `UiScene` (existing event-listener pattern) |
| Boss weakness | `StateMachine` new states, `CharacterGameObject` |

## Data Flow with Networking

```
Keyboard → KeyboardComponent → GameScene (local player)
                ↓
         NetworkManager.sendInput()
                ↓
         Server (relay or authoritative)
                ↓
         NetworkManager.onRemoteInput()
                ↓
         RemoteInputComponent.update()
                ↓
         GameScene (remote player simulation)
```
