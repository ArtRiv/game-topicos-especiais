# Conventions

## Code Style

- **Formatter:** Prettier using `@devshareacademy/prettier-config` (org shared config)
- **Linter:** ESLint 9 flat config (`config/eslint.config.mjs`) extending `@devshareacademy/eslint-config`
- **Disabled rules:** `@typescript-eslint/unbound-method` (disabled likely due to Phaser callback patterns)
- Uses TypeScript strict typing (via shared `@devshareacademy/tsconfig`)

## Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| File names | `kebab-case.ts` | `fire-bolt.ts`, `data-manager.ts` |
| Classes | `PascalCase` | `FireBolt`, `SpellCastingComponent` |
| Interfaces | `PascalCase` | `ActiveSpell`, `CharacterConfig` |
| Constants/enums | `SCREAMING_SNAKE_CASE` | `FIRE_BOLT_SPEED`, `CUSTOM_EVENTS` |
| Type aliases | Same as source enum | `type Element = keyof typeof ELEMENT` |
| Private fields | `#camelCase` (native) | `#maxMana`, `#currentState` |
| Protected fields | `_camelCase` | `_stateMachine`, `_lifeComponent` |
| Public methods | `camelCase` | `takeDamage()`, `setState()` |
| Private methods | `#camelCase` | `#updateFireSpellCombos()` |
| Enum objects | `SCREAMING_SNAKE_CASE` | `ELEMENT.FIRE`, `DIRECTION.UP` |

## TypeScript Patterns

### Enum-as-const pattern
```typescript
// All enums are plain objects with `as const`, not TypeScript enums
export const ELEMENT = {
  FIRE: 'FIRE',
  EARTH: 'EARTH',
} as const;

// Type derived from object keys
export type Element = keyof typeof ELEMENT;
```

### Exhaustive guard for switch statements
```typescript
// src/common/utils.ts
export function exhaustiveGuard(_value: never): never {
  throw new Error(`Error! Reached forbidden guard function with unexpected value: ${JSON.stringify(_value)}`);
}
// Used at end of switch/if chains to catch unhandled cases at compile-time
```

### Native private class fields
```typescript
// Uses # syntax, not TypeScript private modifier
class DataManager {
  static #instance: DataManager;
  #data: PlayerData;
}
```

### Singleton pattern
```typescript
export class ElementManager {
  static #instance: ElementManager;
  private constructor() { ... }
  public static get instance(): ElementManager {
    if (!ElementManager.#instance) {
      ElementManager.#instance = new ElementManager();
    }
    return ElementManager.#instance;
  }
}
```

### Component self-registration
```typescript
// Components register themselves on the game object instance
class BaseGameObjectComponent {
  protected assignComponentToObject(object: GameObject): void {
    object[`_${this.constructor.name}`] = this;
  }

  static getComponent<T>(gameObject: GameObject): T {
    return gameObject[`_${this.name}`] as T;
  }
}
```

### Phaser scene lifecycle conventions
```typescript
class GameScene extends Phaser.Scene {
  // Private fields declared at top with `!` (definite assignment)
  #player!: Player;

  public create(data: LevelData): void { ... }   // init scene
  public update(time: number, delta: number): void { ... }  // game loop

  // All setup split into private methods: #setupPlayer(), #createLevel(), etc.
  // All event registration in: #registerCustomEvents()
  // All collider setup in: #registerColliders()
}
```

## Import Conventions

- `import * as Phaser from 'phaser'` — wildcard import (standard for Phaser)
- Named imports for everything else: `import { DIRECTION } from './common'`
- Config imported as namespace: `import * as CONFIG from '../common/config'`
- No barrel files (`index.ts`) — direct imports from source files

## Error Handling

- No try/catch blocks in game logic (game errors surface to browser console)
- `exhaustiveGuard()` used to enforce exhaustiveness at compile-time
- Type guards (`isTiledObjectProperty`, `isDirection`, `isLevelName`) validate external data
- State machine logs warnings for unknown states via `console.warn()`
- `ENABLE_LOGGING` flag in `config.ts` gates debug logging (currently `false`)

## Constants & Configuration

- All game constants in `src/common/config.ts` as named exports
- Debug flags: `ENABLE_LOGGING`, `ENABLE_DEBUG_ZONE_AREA`, `DEBUG_COLLISION_ALPHA`
- Runtime-mutable subset mirrored in `src/common/runtime-config.ts`
- Spells read values from `RUNTIME_CONFIG` at cast-time (not compile-time constants)

## State Machine Conventions

```typescript
// States implement State interface
interface State {
  stateMachine: StateMachine;
  name: string;
  onEnter?: (args: unknown[]) => void;
  onUpdate?: () => void;
}

// State names stored in character-states.ts enum
export const CHARACTER_STATES = {
  IDLE: 'IDLE',
  MOVE: 'MOVE',
  CASTING: 'CASTING',
  ...
} as const;
```

## Event Bus Conventions

```typescript
// Emit with typed data
EVENT_BUS.emit(CUSTOM_EVENTS.MANA_UPDATED, data);

// Listen in scene create(), unsubscribe in scene destroy/shutdown
EVENT_BUS.on(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.#handleHealthUpdate, this);
EVENT_BUS.off(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.#handleHealthUpdate, this);
```
