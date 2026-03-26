# Architecture Research — LAN Co-op Phaser 3 Spell-Combo Game

## Domain
Adding multiplayer, a second player, new spell elements, cross-player combo detection, and environmental puzzle objects to an existing single-player Phaser 3 + TypeScript codebase.

## Existing Architecture Strengths to Preserve

From `.planning/codebase/ARCHITECTURE.md`:
- **Entity-Component system** — add components, don't rewrite characters
- **StateMachine per character** — second player reuses same state machine
- **Global EVENT_BUS** — perfect for routing network events as custom events
- **`CharacterGameObject` base class** — second player is just another instance

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
