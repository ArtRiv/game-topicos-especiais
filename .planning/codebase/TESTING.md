# Testing

## Test Framework

**None.** This project has **no automated test suite**.

- No test files found (`*.test.ts`, `*.spec.ts` — zero results)
- No testing framework in `package.json` (no Jest, Vitest, Playwright, etc.)
- No `test` script in `package.json`
- No CI configuration (no `.github/workflows/`, no `Makefile`)

## Verification Approaches in Use

Despite no automated tests, quality is maintained through:

### 1. TypeScript Strict Type Checking
- Compile-time safety via TypeScript 5.7.3 + `@devshareacademy/tsconfig` (strict preset)
- `exhaustiveGuard()` enforces exhaustive handling of enums at compile-time
- Type guards validate external data (Tiled map properties, direction strings, level names)

### 2. ESLint Static Analysis
- `pnpm lint` runs ESLint on entire `src/` directory
- Shared org config (`@devshareacademy/eslint-config`) with TypeScript-aware rules

### 3. Runtime Debug Panel
- `src/debug/debug-panel.ts` — HTML overlay for live-tweaking spell values
- Toggle with keyboard (rendered but `display: none` by default)
- Mutates `RUNTIME_CONFIG` in real time — enables game-feel testing without page reload

### 4. Debug Flags in Config
```typescript
// src/common/config.ts
export const ENABLE_LOGGING = false;          // state machine transitions
export const ENABLE_DEBUG_ZONE_AREA = false;  // door trigger zone visualization
export const DEBUG_COLLISION_ALPHA = 0;       // collision layer opacity (set >0 to see)
export const LIFT_ITEM_ANIMATION_ENABLE_DEBUGGING = false;
```

### 5. Arcade Physics Debug
```typescript
// src/scenes/game-scene.ts
#configureArcadeDebug(): void {
  this.physics.world.defaults.debugShowBody = true;
  // Toggled at runtime with keyboard shortcut (#isHitboxDebugEnabled)
}
```

### 6. Debug Flying Obelisk Spawn
- `DEBUG_SPAWN_FLYING_OBELISK` event (emitted from debug panel) spawns an enemy for testing

## What Would Need Testing

Given the game's complexity, the highest-value tests to add would be:

| Area | Suggested Test Type |
|------|-------------------|
| `StateMachine` state transitions | Unit tests |
| `LifeComponent.takeDamage()` | Unit tests |
| `ManaComponent.consume()` and regen | Unit tests |
| `SpellCastingComponent.canCast()` | Unit tests |
| `InventoryManager` item tracking | Unit tests |
| Tiled parse utilities (`tiled-utils.ts`) | Unit tests |
| `DataManager` state persistence | Unit tests |
| Element combo detection (GameScene) | Integration/E2E |

## Recommended Framework If Adding Tests

**Vitest** — matches the Vite build toolchain perfectly:
```bash
pnpm add -D vitest
```
Add to `package.json`:
```json
"test": "vitest run"
```
