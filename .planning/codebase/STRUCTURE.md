# Structure

## Directory Layout

```
/
├── index.html                    # Single HTML entry point
├── package.json                  # Project metadata + scripts
├── pnpm-lock.yaml                # Lockfile
├── tsconfig.json                 # TypeScript config (extends org preset)
├── config/
│   ├── vite.config.js            # Vite build config (custom output naming)
│   └── eslint.config.mjs         # ESLint flat config
├── public/
│   └── assets/
│       ├── data/
│       │   └── assets.json       # Phaser Asset Pack manifest (all game assets)
│       ├── fonts/
│       │   └── Press_Start_2P/   # Bitmap font for UI text
│       ├── images/
│       │   ├── enemies/          # Enemy sprite sheets
│       │   ├── hud/              # HUD/UI sprite sheets
│       │   ├── levels/           # Tiled map files (.tmj)
│       │   ├── player/           # Player sprite sheets
│       │   └── ui/               # Dialog/menu UI assets
│       ├── Little Mage/          # Player sprite source (Aseprite exports)
│       └── spells/               # Spell effect sprite sheets (per-element)
├── src/
│   ├── main.ts                   # Game bootstrap; configures Phaser + registers scenes
│   ├── common/                   # Shared utilities, constants, singletons
│   │   ├── assets.ts             # All asset key enums + animation key constants
│   │   ├── common.ts             # Core enums (DIRECTION, ELEMENT, SPELL_ID, etc.)
│   │   ├── config.ts             # All gameplay constants (speeds, damages, timings)
│   │   ├── runtime-config.ts     # Mutable runtime copy of config for debug tweaking
│   │   ├── types.ts              # TypeScript type aliases from enums
│   │   ├── utils.ts              # Pure utility functions (exhaustiveGuard, direction math)
│   │   ├── event-bus.ts          # Global EVENT_BUS singleton + CUSTOM_EVENTS
│   │   ├── data-manager.ts       # Singleton: player save state (health, mana, area progress)
│   │   ├── element-manager.ts    # Singleton: active element for spell casting
│   │   ├── juice-utils.ts        # Visual juice effects (flash animation)
│   │   └── tiled/
│   │       ├── common.ts         # Tiled constants (layer names, door types, chest rewards)
│   │       ├── types.ts          # Tiled TypeScript interfaces (TiledRoomObject, etc.)
│   │       └── tiled-utils.ts    # Parse/extract objects from Tiled maps
│   ├── components/               # Reusable behavior components (attached to game objects)
│   │   ├── game-object/          # Per-entity behavior components
│   │   │   ├── base-game-object-component.ts  # Base class; attach/detach pattern
│   │   │   ├── animation-component.ts
│   │   │   ├── colliding-objects-component.ts
│   │   │   ├── controls-component.ts
│   │   │   ├── direction-component.ts
│   │   │   ├── held-game-object-component.ts
│   │   │   ├── interactive-object-component.ts
│   │   │   ├── invulnerable-component.ts
│   │   │   ├── life-component.ts
│   │   │   ├── mana-component.ts
│   │   │   ├── spell-casting-component.ts
│   │   │   ├── speed-component.ts
│   │   │   ├── throwable-object-component.ts
│   │   │   └── weapon-component.ts
│   │   ├── input/
│   │   │   ├── input-component.ts       # Abstract input interface
│   │   │   └── keyboard-component.ts    # Keyboard input implementation
│   │   ├── inventory/
│   │   │   └── inventory-manager.ts     # Singleton: items by area
│   │   └── state-machine/
│   │       ├── state-machine.ts         # Core FSM (queue-based state transitions)
│   │       └── states/character/        # All FSM states
│   │           ├── character-states.ts  # CHARACTER_STATES enum
│   │           ├── base-character-state.ts
│   │           ├── base-move-state.ts
│   │           ├── idle-state.ts
│   │           ├── move-state.ts
│   │           ├── attack-state.ts
│   │           ├── casting-state.ts
│   │           ├── hurt-state.ts
│   │           ├── death-state.ts
│   │           ├── lift-state.ts
│   │           ├── throw-state.ts
│   │           ├── open-chest-state.ts
│   │           ├── bounce-move-state.ts
│   │           ├── move-holding-state.ts
│   │           ├── idle-holding-state.ts
│   │           └── boss/drow/           # Boss-specific states
│   ├── game-objects/             # Concrete game entities
│   │   ├── common/
│   │   │   └── character-game-object.ts   # Abstract base for all characters (extends Arcade.Sprite)
│   │   ├── enemies/
│   │   │   ├── spider.ts                  # Basic enemy (random walk AI)
│   │   │   ├── wisp.ts                    # Pulse-animation enemy
│   │   │   └── boss/
│   │   │       └── drow.ts                # Boss enemy (teleport + attack pattern)
│   │   ├── objects/
│   │   │   ├── chest.ts                   # Chest (hidden/revealed/opened states)
│   │   │   ├── door.ts                    # Door (open/locked/trap/boss)
│   │   │   ├── button.ts                  # Floor switch/pressure plate
│   │   │   └── pot.ts                     # Throwable pot object
│   │   ├── player/
│   │   │   └── player.ts                  # Player entity
│   │   ├── spells/
│   │   │   ├── base-spell.ts              # ActiveSpell interface + SpellConfig
│   │   │   ├── fire-bolt.ts               # Projectile spell (Fire element)
│   │   │   ├── fire-area.ts               # AoE fire zone spell
│   │   │   ├── fire-breath.ts             # Channeled beam spell
│   │   │   ├── earth-bolt.ts              # Projectile spell (Earth element)
│   │   │   ├── earth-wall-pillar.ts       # Earth wall segment (breakable)
│   │   │   ├── earth-fire-explosion.ts    # Combo: Earth+Fire explosion
│   │   │   ├── lava-pool.ts               # Combo: Earth bolt + Fire area → lava
│   │   │   └── water-spike.ts             # AoE spike spell (Water element)
│   │   └── weapons/
│   │       ├── base-weapon.ts             # Base weapon class
│   │       ├── sword.ts                   # Melee sword weapon
│   │       └── dagger.ts                  # Thrown dagger weapon
│   ├── scenes/
│   │   ├── scene-keys.ts                  # SCENE_KEYS enum
│   │   ├── preload-scene.ts               # Asset loading + animation creation
│   │   ├── game-scene.ts                  # Main game scene (~900 lines; core gameplay)
│   │   ├── ui-scene.ts                    # HUD overlay (hearts, mana, element indicator)
│   │   ├── game-over-scene.ts             # Game over screen
│   │   └── radial-menu-scene.ts           # Element selection radial menu overlay
│   └── debug/
│       └── debug-panel.ts                 # HTML overlay panel; live-tweaks RUNTIME_CONFIG
└── docs/                          # Planning & documentation
    ├── PLANEJAMENTO_DESENVOLVIMENTO.md
    ├── RESUMO_E_DECISOES_CRIATIVAS.md
    └── planning/                  # Excalidraw diagrams (state machine, map, movement)
```

## Key Locations

| What | Where |
|------|-------|
| Game constants | `src/common/config.ts` |
| Asset keys | `src/common/assets.ts` |
| Core types | `src/common/types.ts` |
| Global events | `src/common/event-bus.ts` |
| Player save state | `src/common/data-manager.ts` |
| Active element | `src/common/element-manager.ts` |
| State machine | `src/components/state-machine/state-machine.ts` |
| Base character | `src/game-objects/common/character-game-object.ts` |
| Player entity | `src/game-objects/player/player.ts` |
| Main game scene | `src/scenes/game-scene.ts` |
| Asset pack manifest | `public/assets/data/assets.json` |
| Tiled map files | `public/assets/images/levels/` |

## Naming Conventions

- Files: `kebab-case.ts` (e.g., `fire-bolt.ts`, `data-manager.ts`)
- Classes: `PascalCase` (e.g., `FireBolt`, `DataManager`)
- Constants/enums: `SCREAMING_SNAKE_CASE` (e.g., `FIRE_BOLT_SPEED`, `CUSTOM_EVENTS`)
- Private class fields: `#camelCase` (native JS private fields)
- Protected fields: `_camelCase` (underscore prefix convention)
- Types/interfaces: `PascalCase` (e.g., `CharacterConfig`, `ActiveSpell`)
- Type aliases from enums: same name as enum (e.g., `type Element = keyof typeof ELEMENT`)
