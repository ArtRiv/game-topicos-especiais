# Architecture

## Pattern

**Entity-Component + Hierarchical State Machine (HSM) + Event Bus**

The game uses a hybrid architecture consisting of:
1. **Entity-Component system** — game objects (entities) attach reusable components for behavior
2. **Finite State Machines** — each character has a `StateMachine` driving its behavior
3. **Global Event Bus** — decouples scenes/objects via a Phaser EventEmitter singleton
4. **Singleton Managers** — `DataManager`, `InventoryManager`, `ElementManager` hold global game state

## Layers

```
main.ts
  └── Phaser.Game
        ├── PreloadScene    → asset loading → starts GameScene
        ├── GameScene       → core gameplay (physics, rooms, enemies, spells)
        ├── UiScene         → HUD overlay (hearts, mana bar, element indicator, dialogs)
        ├── GameOverScene   → game over screen
        └── RadialMenuScene → element selection overlay (pauses GameScene)
```

## Core Subsystems

### Scene Management
- Scenes are registered and started via `Phaser.Game` in `src/main.ts`
- `PreloadScene` starts first, loads all assets, then launches `GameScene`
- `UiScene` and `RadialMenuScene` run as overlays (launched in parallel with `GameScene`)
- `GameScene` passes `LevelData` (level name, roomId, doorId) to itself on restart

### Room-Based Level System
- Levels are Tiled maps with named object layers
- Rooms are defined by `TiledRoomObject` regions on a `rooms` layer
- `GameScene` tracks `#currentRoomId` and shows/hides game objects per room
- Camera transitions between rooms using tweens

### Entity-Component Architecture
All characters inherit from `CharacterGameObject` (`src/game-objects/common/character-game-object.ts`), which extends `Phaser.Physics.Arcade.Sprite` and composes:

| Component | Class | Purpose |
|-----------|-------|---------|
| Controls | `ControlsComponent` | Reads input → applies velocity |
| Speed | `SpeedComponent` | Stores base speed value |
| Direction | `DirectionComponent` | Tracks facing direction |
| Animation | `AnimationComponent` | Maps states to animation keys |
| Invulnerability | `InvulnerableComponent` | Post-hit i-frames |
| Life | `LifeComponent` | HP tracking |
| Weapon | `WeaponComponent` | Attachment/detachment of weapon sprites |
| Mana | `ManaComponent` | Mana pool with time-based regen |
| SpellCasting | `SpellCastingComponent` | Spell slots, cooldowns, casting |
| HeldObject | `HeldGameObjectComponent` | Lifting and holding objects (pots) |

Components attach themselves to the game object via `BaseGameObjectComponent.assignComponentToObject()`, storing as `_ComponentName` on the object, and are retrieved via static `getComponent<T>()`.

### State Machine
- `StateMachine` class in `src/components/state-machine/state-machine.ts`
- Each `CharacterGameObject` has its own `StateMachine` instance
- States implement `State` interface: `{ name, onEnter?, onUpdate? }`
- Queue system prevents re-entrant state changes
- States in `src/components/state-machine/states/character/`:
  - `idle-state`, `move-state`, `attack-state`, `hurt-state`, `death-state`
  - `lift-state`, `throw-state`, `casting-state`, `open-chest-state`
  - `bounce-move-state`, `move-holding-state`, `idle-holding-state`
  - Boss-specific: `boss-drow-hidden-state`, `boss-drow-teleport-state`, `boss-drow-prepare-attack-state`, `boss-drow-idle-state`

### Event Bus
- Global `EVENT_BUS: Phaser.Events.EventEmitter` singleton in `src/common/event-bus.ts`
- Custom events in `CUSTOM_EVENTS` enum:
  - `OPENED_CHEST`, `ENEMY_DESTROYED`, `PLAYER_DEFEATED`
  - `PLAYER_HEALTH_UPDATED`, `SHOW_DIALOG`, `DIALOG_CLOSED`
  - `BOSS_DEFEATED`, `SPELL_CAST`, `MANA_UPDATED`, `ELEMENT_CHANGED`
  - `DEBUG_SPAWN_FLYING_OBELISK`
- Used to communicate between `GameScene` → `UiScene` without direct references

### Singleton Managers
- **`DataManager`** (`src/common/data-manager.ts`) — player health, mana, current area, chest/door state per room
- **`InventoryManager`** (`src/components/inventory/inventory-manager.ts`) — items (sword, keys, map, compass, boss key)
- **`ElementManager`** (`src/common/element-manager.ts`) — currently active spell element (FIRE/EARTH/WATER/etc.)
- All use private constructor + static `#instance` (classic singleton pattern)

### Spell System
- Spells implement `ActiveSpell` interface: `{ element, spellId, spellType, baseDamage, manaCost, cooldown, gameObject, destroy() }`
- `SpellCastingComponent` manages spell slots, cooldowns, and instantiation
- Element combos detected in `GameScene.update()` via overlap checks
- Combo interactions handled in dedicated private methods: `#updateFireSpellCombos()`, `#updateEarthFireCombo()`, `#updateEarthWallSpell()`, etc.

### Config System
- Static compile-time constants in `src/common/config.ts`
- Runtime-mutable copy in `src/common/runtime-config.ts` (`RUNTIME_CONFIG` object)
- Debug panel (`src/debug/debug-panel.ts`) mutates `RUNTIME_CONFIG` live via HTML range inputs

## Data Flow

```
KeyboardComponent
    ↓
ControlsComponent → StateMachine
    ↓                    ↓
CharacterGameObject  SpellCastingComponent
    ↓                    ↓
GameScene (colliders)  ActiveSpell instances
    ↓
EVENT_BUS
    ↓
UiScene (HUD updates)
```

## Entry Points

- **`src/main.ts`** — creates `Phaser.Game`, registers all scenes, starts `PreloadScene`
- **`index.html`** — single HTML page with `<div id="game-container">`, loads `src/main.ts` via Vite
