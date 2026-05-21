# 06-02 SUMMARY — Cinematic Main Menu Intro + Fade Transitions

## What Was Built

- **src/scenes/scene-transition.ts** (new): `startScene(scene, targetKey, duration=300)` — fades out camera to black then switches scene. Single shared helper replacing all `scene.scene.start()` calls throughout the menu flow.
- **src/scenes/main-menu-scene.ts**: 
  - Imports `startScene` from `./scene-transition`
  - `MUSIC_DROP_MS = 14_200` tunable top-level constant (ms to song drop in menu_music.ogg)
  - `cinematicPlayed` module-level flag — prevents cinematic replay on back-navigation
  - `create()`: adds `cameras.main.fadeIn(400)`, collects Title+Subtitle objects from refactored `#drawTitle()`, collects Text array from refactored `#drawMenu()`. If first visit → sets all alpha=0, schedules delayedCall at `MUSIC_DROP_MS` for: title impact flash (scale 1.3→1 Back.Out + alpha tween), subtitle stagger fade-in, menu items stagger-in (60ms each, 200ms delay). If revisiting → all set alpha=1 immediately.
  - `#drawTitle()` now returns `{ title, subtitle }` (was void)
  - `#drawMenu()` now returns `Phaser.GameObjects.Text[]` (was void); all `scene.start()` → `startScene()` 
- **src/scenes/menu-placeholder.ts**: Imports `startScene`; `buildMenuPlaceholder` adds `scene.cameras.main.fadeIn(300, 0, 0, 0)` at entry; back button changed to `startScene(scene, opts.backScene)`.
- **src/scenes/create-lobby-scene.ts**: Imports `startScene`; `primaryAction` changed to `startScene(this, SCENE_KEYS.LOBBY_SCENE)`.
- **src/scenes/join-lobby-scene.ts**: Same as create-lobby-scene.

## Verification

- `pnpm exec tsc --noEmit --skipLibCheck` → 0 errors
- `pnpm exec vite build` → ✓ built in 8.87s

## Requirements Addressed

UI-02 (cinematic main menu animation timed to song drop), UI-07 (transitions tied to music cues via MUSIC_DROP_MS)

## Artifacts

| File | Status |
|------|--------|
| src/scenes/scene-transition.ts | Created |
| src/scenes/main-menu-scene.ts | Modified (cinematic, startScene) |
| src/scenes/menu-placeholder.ts | Modified (fadeIn, startScene) |
| src/scenes/create-lobby-scene.ts | Modified (startScene) |
| src/scenes/join-lobby-scene.ts | Modified (startScene) |

## Commit

`c7cd24b` — feat(06-02): cinematic main menu intro + fade transitions
