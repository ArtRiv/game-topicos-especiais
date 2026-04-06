# 06-01 SUMMARY — SplashScene + Boot Wiring

## What Was Built

- **src/scenes/splash-scene.ts** (new): `SplashScene` — black background, centered blinking "PRESS ANYTHING TO GET HIGH IN THE FANTASY" text (8px FONT_PRESS_START_2P, setResolution(2), alpha blink tween). Any keydown or pointerdown fires a 400 ms camera fade-out then `scene.start(MAIN_MENU_SCENE)`. `#transitioning` flag prevents double-fire. `MusicManager.instance.loadTracks(this)` called in preload() so audio is cached before MainMenuScene loads.
- **src/scenes/scene-keys.ts**: Added `SPLASH_SCENE: 'SPLASH_SCENE'` as the first entry.
- **src/main.ts**: Imported `SplashScene`, registered `game.scene.add(SCENE_KEYS.SPLASH_SCENE, SplashScene)`, changed entry point from `MAIN_MENU_SCENE` to `SPLASH_SCENE`.

## Verification

- `pnpm exec tsc --noEmit --skipLibCheck` → 0 errors
- `pnpm exec vite build` → ✓ built in 8.56s (pre-existing chunk-size warning only)

## Requirements Addressed

UI-01 (splash / press-to-start), UI-03 (pixel-perfect centering — canvas FIT mode + `setOrigin(0.5)`)

## Artifacts

| File | Status |
|------|--------|
| src/scenes/splash-scene.ts | Created |
| src/scenes/scene-keys.ts | Modified (SPLASH_SCENE added) |
| src/main.ts | Modified (boot entry point) |

## Commit

`7dbed41` — feat(06-01,06-03): splash scene, font audit, SCREENS.md
