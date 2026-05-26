import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scenes/scene-keys';
// --- Menu scenes ---
import { SplashScene } from './scenes/splash-scene';
import { OpeningCutsceneScene } from './scenes/opening-cutscene-scene';
import { IntroScene } from './scenes/intro-scene';
import { MainMenuScene } from './scenes/main-menu-scene';
import { CreateLobbyScene } from './scenes/create-lobby-scene';
import { JoinLobbyScene } from './scenes/join-lobby-scene';
import { AccountScene } from './scenes/account-scene';
import { OptionsScene } from './scenes/options-scene';
import { CreditsScene } from './scenes/credits-scene';
// --- Game scenes ---
import { LobbyScene } from './scenes/lobby-scene';
import { LoadingScene } from './scenes/loading-scene';
import { PreloadScene } from './scenes/preload-scene';
import { GameScene } from './scenes/game-scene';
import { UiScene } from './scenes/ui-scene';
import { GameOverScene } from './scenes/game-over-scene';
import { RadialMenuScene } from './scenes/radial-menu-scene';
import { DebugPanel } from './debug/debug-panel';
import { installCustomCursor } from './common/cursor';
import { DEV_SKIP_TO_GAMEPLAY } from './common/config';

// ---------------------------------------------------------------------------
// Phaser game configuration
// ---------------------------------------------------------------------------
// SCALE STRATEGY:
//   FIT mode scales the canvas to fit inside the container while preserving
//   the 480×320 aspect ratio (3:2). On widescreen monitors this produces thin
//   letterbox bars on the left/right; the container background is set to black
//   in index.html so those bars blend seamlessly instead of showing white/gray.
//
//   pixelArt: true  — sets texture filter to NEAREST everywhere, preventing
//                     bilinear blur when the canvas is CSS-upscaled.
//   roundPixels: true — snaps game-object positions to whole pixels so sub-
//                       pixel offsets don't smear sprites or text textures.
//
// BACKGROUND:
//   backgroundColor '#000000' is the Phaser canvas fill visible between the
//   game-world content and the canvas edge while a scene is active. Each scene
//   also sets its own camera/rectangle background so nothing is ever raw black
//   unless intentional.
// ---------------------------------------------------------------------------
const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  pixelArt: true,
  roundPixels: true,
  scale: {
    parent: 'game-container',
    width: 480,
    height: 320,
    // FIT: scales the canvas proportionally to fill the parent div without
    // cropping. Letterbox bars (black) appear on wide viewports — intentional.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Black fill for areas outside the rendered scene (letterbox / transition
  // frames). Matches the menu background so there is no flash on scene start.
  backgroundColor: '#000000',
  dom: {
    // Required for this.add.dom() calls in LobbyScene (IP / nickname inputs).
    createContainer: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0, x: 0 },
      debug: false,
    },
  },
};

// Phaser rasterises Text glyphs onto a 2D canvas the moment a Text object is
// created. If the TTF isn't fully loaded yet, the canvas falls back to a system
// font and Phaser caches that (wrong) texture — producing the "blurry on first
// load, crisp after refresh" symptom. Awaiting the font here guarantees the
// glyphs are available before any scene runs. We load the largest size we use
// so every smaller render is satisfied by the same font face.
// Wrapped in an async IIFE because top-level await isn't compatible with
// Vite's default build target (chrome87/es2020).
void (async () => {
  await document.fonts.load('20px "Press Start 2P"');
  await document.fonts.load('20px "FONT_PRESS_START_2P"');

  const game = new Phaser.Game(gameConfig);

  // --- Register all scenes ---
  // Menu layer
  game.scene.add(SCENE_KEYS.SPLASH_SCENE, SplashScene);
  game.scene.add(SCENE_KEYS.OPENING_CUTSCENE_SCENE, OpeningCutsceneScene);
  game.scene.add(SCENE_KEYS.INTRO_SCENE, IntroScene);
  game.scene.add(SCENE_KEYS.MAIN_MENU_SCENE, MainMenuScene);
  game.scene.add(SCENE_KEYS.CREATE_LOBBY_SCENE, CreateLobbyScene);
  game.scene.add(SCENE_KEYS.JOIN_LOBBY_SCENE, JoinLobbyScene);
  game.scene.add(SCENE_KEYS.ACCOUNT_SCENE, AccountScene);
  game.scene.add(SCENE_KEYS.OPTIONS_SCENE, OptionsScene);
  game.scene.add(SCENE_KEYS.CREDITS_SCENE, CreditsScene);
  // Network / game layer
  game.scene.add(SCENE_KEYS.LOBBY_SCENE, LobbyScene);
  game.scene.add(SCENE_KEYS.LOADING_SCENE, LoadingScene);
  game.scene.add(SCENE_KEYS.PRELOAD_SCENE, PreloadScene);
  game.scene.add(SCENE_KEYS.GAME_SCENE, GameScene);
  game.scene.add(SCENE_KEYS.UI_SCENE, UiScene);
  game.scene.add(SCENE_KEYS.GAME_OVER_SCENE, GameOverScene);
  game.scene.add(SCENE_KEYS.RADIAL_MENU_SCENE, RadialMenuScene);

  // Boot flow per D-03: Splash -> MainMenu -> Lobby
  // SplashScene loads music then fades to MainMenuScene on any keypress.
  // DEV shortcut: jump straight to PreloadScene (→ GameScene) for fast iteration.
  // PreloadScene queues the audio tracks itself when this path is taken, so the
  // splash → menu → lobby → loading chain is fully bypassed.
  if (DEV_SKIP_TO_GAMEPLAY) {
    console.warn('[DEV_SKIP_TO_GAMEPLAY] Skipping splash/menu/lobby — booting straight into gameplay.');
    game.scene.start(SCENE_KEYS.PRELOAD_SCENE);
  } else {
    game.scene.start(SCENE_KEYS.SPLASH_SCENE);
  }

  new DebugPanel();
  installCustomCursor();
})();
