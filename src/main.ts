import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scenes/scene-keys';
// --- Menu scenes ---
import { MainMenuScene } from './scenes/main-menu-scene';
import { CreateLobbyScene } from './scenes/create-lobby-scene';
import { JoinLobbyScene } from './scenes/join-lobby-scene';
import { AccountScene } from './scenes/account-scene';
import { OptionsScene } from './scenes/options-scene';
import { CreditsScene } from './scenes/credits-scene';
// --- Game scenes ---
import { LobbyScene } from './scenes/lobby-scene';
import { PreloadScene } from './scenes/preload-scene';
import { GameScene } from './scenes/game-scene';
import { UiScene } from './scenes/ui-scene';
import { GameOverScene } from './scenes/game-over-scene';
import { RadialMenuScene } from './scenes/radial-menu-scene';
import { DebugPanel } from './debug/debug-panel';

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

const game = new Phaser.Game(gameConfig);

// --- Register all scenes ---
// Menu layer
game.scene.add(SCENE_KEYS.MAIN_MENU_SCENE, MainMenuScene);
game.scene.add(SCENE_KEYS.CREATE_LOBBY_SCENE, CreateLobbyScene);
game.scene.add(SCENE_KEYS.JOIN_LOBBY_SCENE, JoinLobbyScene);
game.scene.add(SCENE_KEYS.ACCOUNT_SCENE, AccountScene);
game.scene.add(SCENE_KEYS.OPTIONS_SCENE, OptionsScene);
game.scene.add(SCENE_KEYS.CREDITS_SCENE, CreditsScene);
// Network / game layer
game.scene.add(SCENE_KEYS.LOBBY_SCENE, LobbyScene);
game.scene.add(SCENE_KEYS.PRELOAD_SCENE, PreloadScene);
game.scene.add(SCENE_KEYS.GAME_SCENE, GameScene);
game.scene.add(SCENE_KEYS.UI_SCENE, UiScene);
game.scene.add(SCENE_KEYS.GAME_OVER_SCENE, GameOverScene);
game.scene.add(SCENE_KEYS.RADIAL_MENU_SCENE, RadialMenuScene);

// Entry point — always start at the main menu.
// Previously this was LOBBY_SCENE; change reverted by starting MAIN_MENU_SCENE.
// The LobbyScene is still reachable via Create/JoinLobby stubs.
game.scene.start(SCENE_KEYS.MAIN_MENU_SCENE);

new DebugPanel();
