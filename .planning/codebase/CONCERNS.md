# Concerns

## Technical Debt

### 1. Massive God-Scene (`src/scenes/game-scene.ts`)
- **Severity:** HIGH
- **Lines:** 1311 lines, 309 private-field/method references
- `GameScene` handles: level creation, room management, player setup, enemy management, all spell collision detection (9+ combo systems), camera transitions, door/chest/switch logic, debug toggle
- All element combo detection is directly inside `GameScene.update()` via inline overlap checks
- Should be split into: RoomManager, CollisionSystem, ComboSystem, SpellManager subsystems

### 2. No Automated Tests
- **Severity:** HIGH
- Zero test files (`*.test.ts`, `*.spec.ts`) in the codebase
- No testing framework configured
- Business logic (state machines, mana components, spell combos) is untested
- Risk increases as feature complexity grows (spell combo matrix especially)

### 3. Singletons with No Reset Mechanism
- **Severity:** MEDIUM
- `DataManager`, `InventoryManager`, `ElementManager` use static `#instance` singletons
- No `reset()` or `destroy()` method — impossible to fully reset game state without page reload
- `DataManager` starts game immediately in `DUNGEON_1` room 3 with hardcoded initial state
- Will cause issues if ever adding: title screen, level select, multiple playthroughs

### 4. SpellCastingComponent Hardcodes Spell Slots
- **Severity:** MEDIUM
- `SpellCastingComponent` constructor hardcodes exactly 2 spell slots (FireBolt, FireArea)
- `#getEffectiveCooldown()` has hardcoded `if (spellId === SPELL_ID.FIRE_BOLT)` element checks
- Adding new spells/elements requires modifying component internals

### 5. Component Access Pattern via String Keys
- **Severity:** MEDIUM
- Components self-register via `object['_ComponentName'] = this` (dynamic string property)
- `getComponent<T>()` casts with `as T` — no runtime type safety
- TypeScript can't verify component existence at compile time

### 6. `DataManager` Initial State Hardcoded
- **Severity:** MEDIUM
- Starting room (`DUNGEON_1`, room 3, door 3) is hardcoded in `DataManager` constructor
- No persistence (no localStorage, no server) — game state resets on page reload
- `areaDetails.WORLD` area exists in the type but appears unused in current levels

### 7. Incomplete Spell System for Planned Features
- **Severity:** MEDIUM (per project roadmap in `MUDANCAS_NECESSARIAS.md`)
- Current spells: FireBolt, FireArea, FireBreath, EarthBolt, EarthWallPillar, WaterSpike (partial)
- Planned but not implemented: Ice, Wind, Thunder spells, laser/beam mechanics
- Element combos only exist for Fire+Earth, Earth+Fire (lava pool), FireBreath+FireArea
- Water, Ice, Thunder have no spells implemented despite being in `ELEMENT` enum

### 8. Planned Multiplayer Not Started
- **Severity:** HIGH (per project goals)
- `MUDANCAS_NECESSARIAS.md` describes a 2-player cooperative spell-combo game
- Current architecture: single player, local keyboard only
- No networking layer (`src/networking/` doesn't exist)
- `InputComponent` interface exists but only `KeyboardComponent` is implemented
- Player spawn, sync, and combo-between-players need significant architecture changes

## Fragile Areas

### 9. Fire Breath Collision Math (`src/game-objects/spells/fire-breath.ts`)
- Range detection uses stepwise raycasting: `FIRE_BREATH_STEP_SIZE = 8px` steps
- Angle tolerance/cone detection uses `FIRE_BREATH_ANGLE_TOLERANCE = 0.45 rad`
- Many magic numbers with config constants — visually complex to debug

### 10. Earth Wall Multi-Phase Mouse Input
- **Severity:** LOW-MEDIUM
- `GameScene` tracks earth wall state via 5 boolean/numeric fields:
  - `#earthWallPendingClick`, `#earthWallDrawingMode`, `#earthWallDrawingPillarCount`, `#earthWallLastPlacedX/Y`, `#earthWallMouseWasDown`
- This FSM-in-a-scene is fragile and should be refactored into a proper state

### 11. Tiled Map Parsing: No Type Safety Guarantees
- `getTiledPropertyByName<T>()` uses unsafe generic cast (`as T`)
- If Tiled map is missing expected properties, values silently become `undefined`
- Runtime errors possible if map data is malformed or renamed in Tiled editor

## Performance Notes

### 12. Overlap Checks in `update()` Loop
- `GameScene.update()` calls multiple `this.physics.overlap()` checks every frame for spell combos
- For current single-player scope this is fine, but would need spatial optimization for many spells/players

### 13. Debug Flying Obelisk Group
- `#debugFlyingObeliskGroup` created in every game session even when debug is disabled
- Minor memory overhead, not a real concern at current scale

## Security / Data

- **No sensitive data** — game is fully client-side, no user credentials, no network calls
- No localStorage usage — all state is in-memory, resets on page reload
- Debug panel exposed in all builds (not gated by `NODE_ENV`) — could expose tuning numbers in production

## Dead Code / Unused Features

- `LEVEL_NAME.WORLD` exists in enums and `DataManager` but world level is not fully implemented/accessible
- `DUNGEON_ITEM` enum has MAP and COMPASS which affect `InventoryManager` but no map/compass UI is displayed
- `FireBreath` exists but is not included in `SpellCastingComponent` spell slots (only accessible via debug/special trigger?)

## Documentation Conflict

- `MUDANCAS_NECESSARIAS.md` (root) vs `docs/MUDANCAS_NECESSARIAS.md` (docs folder) both exist with partially overlapping content
- `docs/DUVIDAS_IMPLEMENTACAO_CORE.md` notes a conflict: root `MUDANCAS_NECESSARIAS.md` references isometric view, but `docs/PLANEJAMENTO_DESENVOLVIMENTO.md` and `docs/RESUMO_E_DECISOES_CRIATIVAS.md` define top-down — **top-down is the confirmed direction**
