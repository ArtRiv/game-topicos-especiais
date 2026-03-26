# Integrations

## External Libraries

### Phaser 3 (v3.87.0)
- Only runtime dependency
- Used for: rendering, physics, input, animations, tilemaps, scene management, event emitter
- Imported via `import * as Phaser from 'phaser'` throughout codebase
- **Phaser.Events.EventEmitter** — used as a global event bus (`src/common/event-bus.ts`)
- **Phaser.Physics.Arcade** — all game objects use arcade physics bodies
- **Phaser.Tilemaps.Tilemap** — Tiled map format loaded via `this.load.pack()`

## Asset Formats

### Tiled Map Editor (.tmj / JSON)
- Maps stored in `public/assets/images/levels/`
- Object layers: `rooms`, `switches`, `pots`, `doors`, `chests`, `enemies`, `collision`
- Custom properties parsed via `src/common/tiled/tiled-utils.ts`
- Object layer types: `TiledRoomObject`, `TiledDoorObject`, `TiledChestObject`, `TiledSwitchObject`, `TiledEnemyObject`, `TiledPotObject`

### Aseprite (sprite sheets with JSON metadata)
- Player, enemies, and spell effect sprites exported from Aseprite
- Loaded with `this.anims.createFromAseprite(ASSET_KEYS.PLAYER)` in `PreloadScene`
- Stored in `public/assets/` subdirectories

### Phaser Asset Pack (assets.json)
- Central asset manifest at `public/assets/data/assets.json`
- All assets loaded in a single pack load call in `PreloadScene`

## External APIs / Services

**None.** This is a fully offline, client-side browser game with no:
- Backend API calls
- Authentication services
- Databases
- Analytics
- CDN requirements
- WebSocket connections

## Browser APIs Used (via Phaser)

| API | Usage |
|-----|-------|
| WebGL | Primary renderer |
| Canvas 2D | Fallback (via Phaser) |
| Web Audio | Sound effects (via Phaser) |
| Keyboard input | Via `this.input.keyboard` |
| Mouse/pointer input | Via `this.input` (radial menu) |
| requestAnimationFrame | Game loop (via Phaser) |

## Development-Time Integrations

| Tool | Role |
|------|------|
| Volta | Pin Node/pnpm versions across machines |
| ESLint | Linting (`@devshareacademy/eslint-config`) |
| Prettier | Formatting (`@devshareacademy/prettier-config`) |
| Vite HMR | Hot module reload during development |
