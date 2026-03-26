<!-- GSD:project-start source:PROJECT.md -->
## Project

**Mages Co-op**

A 2-player LAN cooperative top-down wizard game built on a Phaser 3 + TypeScript codebase. Two players each control a mage with asymmetric element sets — one wields Fire, Earth, and Water; the other wields Ice, Wind, and Thunder. The core fun is combining spells mid-combat to trigger powerful combo effects, solving environmental puzzles that require cross-player thinking, and encountering bosses that have elemental weaknesses requiring coordinated strategy. Built for a college game event (3-4 months away), targeting ~15-minute play sessions with light narrative and comedy NPCs.

**Core Value:** When two players discover a new spell combo that wrecks a tough enemy — that "we did it together" moment — is the reason this game exists.

### Constraints

- **Tech stack:** Phaser 3 + TypeScript — no engine change
- **Timeline:** 3-4 months to college event
- **Team size:** 2 developers
- **Session length:** ~15 minutes per playthrough
- **Networking:** LAN only (dedicated server on third machine); no WebRTC/internet
- **Dependencies:** Spell combo system must exist before cross-player combos can be built
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Language & Runtime
- **Language:** TypeScript 5.7.3
- **Runtime:** Node.js 20.11.0 (pinned via Volta)
- **Package manager:** pnpm 8.14.3 (Volta-managed; lockfile: `pnpm-lock.yaml`)
- **Module format:** ESM (Vite handles bundling)
## Framework
- **Game engine:** Phaser 3.87.0 — only production dependency
## Build Tooling
| Tool | Version | Purpose |
|------|---------|---------|
| Vite | 6.0.7 | Dev server & production bundler |
| TypeScript | 5.7.3 | Type checking and transpilation |
| ESLint | 9.18.0 | Linting (flat config format) |
| Prettier | 3.4.2 | Code formatting |
### Build scripts (`package.json`)
### Vite configuration (`config/vite.config.js`)
- Entry file names: `assets/js/[name]-[hash].js`
- No custom plugins — standard Vite defaults
### TypeScript configuration (`tsconfig.json`)
- Extends `@devshareacademy/tsconfig` (shared org preset)
- `outDir: dist`
- Includes all `**/*.ts` in project
## Dev Dependencies
## Asset Pipeline
- Assets declared in `public/assets/data/assets.json` (Phaser Asset Pack format)
- Loaded in `PreloadScene` via `this.load.pack()`
- Sprite animations created from Aseprite files via `this.anims.createFromAseprite()`
- Custom bitmap font: Press Start 2P (`public/assets/fonts/Press_Start_2P/`)
- Tiled tilemap files in `public/assets/images/levels/`
## Deployment
- Output: `dist/` folder via `pnpm build`
- Static web app (no server-side code)
- Hosted via Vite preview or any static file server
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

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
### Exhaustive guard for switch statements
### Native private class fields
### Singleton pattern
### Component self-registration
### Phaser scene lifecycle conventions
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
## Event Bus Conventions
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern
## Layers
```
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
### State Machine
- `StateMachine` class in `src/components/state-machine/state-machine.ts`
- Each `CharacterGameObject` has its own `StateMachine` instance
- States implement `State` interface: `{ name, onEnter?, onUpdate? }`
- Queue system prevents re-entrant state changes
- States in `src/components/state-machine/states/character/`:
### Event Bus
- Global `EVENT_BUS: Phaser.Events.EventEmitter` singleton in `src/common/event-bus.ts`
- Custom events in `CUSTOM_EVENTS` enum:
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
```
## Entry Points
- **`src/main.ts`** — creates `Phaser.Game`, registers all scenes, starts `PreloadScene`
- **`index.html`** — single HTML page with `<div id="game-container">`, loads `src/main.ts` via Vite
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
