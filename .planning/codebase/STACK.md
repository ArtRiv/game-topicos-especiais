# Tech Stack

## Language & Runtime

- **Language:** TypeScript 5.7.3
- **Runtime:** Node.js 20.11.0 (pinned via Volta)
- **Package manager:** pnpm 8.14.3 (Volta-managed; lockfile: `pnpm-lock.yaml`)
- **Module format:** ESM (Vite handles bundling)

## Framework

- **Game engine:** Phaser 3.87.0 — only production dependency
  - Physics: Arcade Physics (no gravity; 2D top-down)
  - Renderer: WebGL (`Phaser.WEBGL`), pixel-art mode (`pixelArt: true`, `roundPixels: true`)
  - Scale: 480×320, `HEIGHT_CONTROLS_WIDTH`, auto-centered

## Build Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| Vite | 6.0.7 | Dev server & production bundler |
| TypeScript | 5.7.3 | Type checking and transpilation |
| ESLint | 9.18.0 | Linting (flat config format) |
| Prettier | 3.4.2 | Code formatting |

### Build scripts (`package.json`)
```
pnpm start   → vite --config config/vite.config.js      (dev server)
pnpm build   → tsc && vite build --config config/vite.config.js
pnpm serve   → vite preview --config config/vite.config.js
pnpm lint    → eslint ./src -c ./config/eslint.config.mjs
```

### Vite configuration (`config/vite.config.js`)
- Entry file names: `assets/js/[name]-[hash].js`
- No custom plugins — standard Vite defaults

### TypeScript configuration (`tsconfig.json`)
- Extends `@devshareacademy/tsconfig` (shared org preset)
- `outDir: dist`
- Includes all `**/*.ts` in project

## Dev Dependencies
```
@devshareacademy/eslint-config   0.0.19  — shared ESLint rules
@devshareacademy/prettier-config 0.0.6   — shared Prettier rules
@devshareacademy/tsconfig        0.0.3   — shared tsconfig base
@typescript-eslint/eslint-plugin 8.20.0  — TS-aware lint rules
@typescript-eslint/parser        8.20.0  — ESLint TS parser
eslint-config-prettier           10.0.1  — disables ESLint formatting rules
eslint-plugin-prettier           5.2.3   — runs Prettier as eslint rule
```

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
