# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Frontend (run from repo root, uses pnpm):**
```bash
pnpm start          # dev server at http://localhost:5173
pnpm build          # type-check + Vite production build
pnpm lint           # ESLint on src/
pnpm test           # Vitest (unit tests only, excludes game-server/)
pnpm test -- --run src/path/to/file.test.ts   # run a single test file
```

**Game server (run from `game-server/`, uses npm):**
```bash
npm start           # production (tsx)
npm run dev         # watch mode
npm test            # server-side Vitest
npm run stress-test # stress-test script
```

**Dev shortcut:** Set `DEV_SKIP_TO_GAMEPLAY = true` in [src/common/config.ts](src/common/config.ts) to bypass the full lobby flow and boot straight into `GameScene`. Revert before committing.

## Architecture

### Two-process split
- **Frontend** — Phaser 3 + TypeScript, bundled by Vite. Entry: [src/main.ts](src/main.ts). Canvas is 480×320 in FIT scale (pixel-art, roundPixels).
- **Game server** — Node.js + Express + Socket.io. Entry: [game-server/src/server.ts](game-server/src/server.ts). Handles lobby lifecycle, match countdown, and the host-authoritative damage pipeline. Player positions and spell casts are relayed peer-to-peer over WebRTC data channels; only damage validation goes through the server.

### Scene flow
`SplashScene → MainMenuScene → (CreateLobby / JoinLobby / Account / Options / Credits) → LobbyScene → LoadingScene → PreloadScene → GameScene + UiScene (parallel)`

`RadialMenuScene` launches over `GameScene` when the player opens the element picker. `GameOverScene` appears on match end.

All scene keys live in [src/scenes/scene-keys.ts](src/scenes/scene-keys.ts).

### GameScene
`GameScene` ([src/scenes/game-scene.ts](src/scenes/game-scene.ts)) is the largest file (~2700 lines). It owns:
- Tilemap loading and room management (`#objectsByRoomId`)
- All Arcade Physics collider registration (`#registerColliders`)
- Every cross-spell combo update method (one `#update*Combo` method per combo, called from `update()`)
- Networking setup and remote-player interpolation
- Earth Wall draw-mode state machine

### Component system
`CharacterGameObject` ([src/game-objects/common/character-game-object.ts](src/game-objects/common/character-game-object.ts)) is the base for `Player` and all enemies. Components are attached as plain class instances and registered on the game object:

| Component | File |
|---|---|
| `AnimationComponent` | [src/components/game-object/animation-component.ts](src/components/game-object/animation-component.ts) |
| `LifeComponent` | [src/components/game-object/life-component.ts](src/components/game-object/life-component.ts) |
| `ManaComponent` | [src/components/game-object/mana-component.ts](src/components/game-object/mana-component.ts) |
| `SpellCastingComponent` | [src/components/game-object/spell-casting-component.ts](src/components/game-object/spell-casting-component.ts) |
| `KeyboardComponent` / `RemoteInputComponent` | [src/components/input/](src/components/input/) |

Character behavior is driven by a state machine in [src/components/state-machine/](src/components/state-machine/). States live under `states/character/`.

### Spell system
Each spell is a class extending `BaseSpell` ([src/game-objects/spells/base-spell.ts](src/game-objects/spells/base-spell.ts)). Every spell module calls `registerSpell(SPELL_ID, factory)` at module-load time, populating `SPELL_FACTORY_REGISTRY` in [src/game-objects/spells/spell-registry.ts](src/game-objects/spells/spell-registry.ts).

The active element (Fire / Earth / Water / Ice / Wind / Thunder / Darkness) is tracked by the `ElementManager` singleton ([src/common/element-manager.ts](src/common/element-manager.ts)). Each element maps to up to three spell slots via `SPELL_SLOT_REGISTRY` in [spell-registry.ts](src/game-objects/spells/spell-registry.ts). Key 3 for Fire (FireBreath) and Earth (EarthWall) bypasses the slot system and is handled directly in `GameScene`.

Cross-spell combos (e.g. FireBolt + EarthBolt → explosion, ThunderStrike + Puddle → electrified puddle) are checked each frame in `GameScene.update()`.

### Networking
`NetworkManager` singleton ([src/networking/network-manager.ts](src/networking/network-manager.ts)) wraps Socket.io (signaling) + WebRTC mesh (gameplay data). Position updates and spell casts go over WebRTC; damage validation goes through the server's `spell:hit` → `damage:confirmed` pipeline. Network types: [src/networking/types.ts](src/networking/types.ts).

### Configuration
- [src/common/config.ts](src/common/config.ts) — all compile-time tuning constants (damage, cooldowns, speeds, etc.)
- [src/common/runtime-config.ts](src/common/runtime-config.ts) — constants overridable from the in-game debug panel without recompiling
- [src/common/assets.ts](src/common/assets.ts) — all asset key constants
- [src/common/event-bus.ts](src/common/event-bus.ts) — typed global `EVENT_BUS` (Phaser EventEmitter) and `CUSTOM_EVENTS` enum

### Testing
Vitest unit tests live alongside source files (`*.test.ts`). Phaser is mocked at [src/__mocks__/phaser.ts](src/__mocks__/phaser.ts). Tests run in `node` environment. Server tests are in `game-server/` and run separately.

## Project-local Phaser 4 skills

There is a `skills/` directory at the repo root containing curated Phaser 4 reference skills. **Before planning, discussing, or implementing anything that touches one of these areas, read the matching `skills/<topic>/SKILL.md` first** — it has Phaser-4-specific syntax, key source paths, and patterns that save round-trips.

Available skill folders (each has a `SKILL.md`; some also have `references/`):

- `actions-and-utilities`
- `animations`
- `audio-and-sound`
- `cameras`
- `curves-and-paths`
- `data-manager`
- `events-system`
- `filters-and-postfx`
- `game-object-components`
- `game-setup-and-config`
- `geometry-and-math`
- `graphics-and-shapes`
- `groups-and-containers`
- `input-keyboard-mouse-touch`
- `loading-assets`
- `particles`
- `physics-arcade`
- `physics-matter`
- `render-textures`
- `scale-and-responsive`
- `scenes`
- `sprites-and-images`
- `text-and-bitmaptext`
- `tilemaps`
- `time-and-timers`
- `tweens`
- `v3-to-v4-migration`
- `v4-new-features`

Trigger examples: any work on tween / animate / ease → `tweens/SKILL.md`. Scene transitions/lifecycle → `scenes/SKILL.md`. HUD/results text rendering → `text-and-bitmaptext/SKILL.md`. Lobby/menu camera or fade transitions → `cameras/SKILL.md` and `tweens/SKILL.md`. Migrating old patterns → `v3-to-v4-migration/SKILL.md`.

These are project-local (not the `~/.claude/skills/` GSD slash commands) and are NOT auto-loaded — you must Read them explicitly when relevant.
