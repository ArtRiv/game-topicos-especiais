import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scenes/scene-keys';
import { LobbyScene } from './scenes/lobby-scene';
import { LoadingScene } from './scenes/loading-scene';
import { PreloadScene } from './scenes/preload-scene';
import { GameScene } from './scenes/game-scene';
import { UiScene } from './scenes/ui-scene';
import { GameOverScene } from './scenes/game-over-scene';
import { RadialMenuScene } from './scenes/radial-menu-scene';
import { SplashScene } from './scenes/splash-scene';
import { MainMenuScene } from './scenes/main-menu-scene';
import { AccountScene } from './scenes/account-scene';
import { OptionsScene } from './scenes/options-scene';
import { CreditsScene } from './scenes/credits-scene';
import { DebugPanel } from './debug/debug-panel';

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  pixelArt: true,
  roundPixels: true,
  scale: {
    parent: 'game-container',
    width: 480,
    height: 320,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    mode: Phaser.Scale.HEIGHT_CONTROLS_WIDTH,
  },
  backgroundColor: '#000000',
  dom: {
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

game.scene.add(SCENE_KEYS.SPLASH_SCENE, SplashScene);
game.scene.add(SCENE_KEYS.MAIN_MENU_SCENE, MainMenuScene);
game.scene.add(SCENE_KEYS.ACCOUNT_SCENE, AccountScene);
game.scene.add(SCENE_KEYS.OPTIONS_SCENE, OptionsScene);
game.scene.add(SCENE_KEYS.CREDITS_SCENE, CreditsScene);
game.scene.add(SCENE_KEYS.LOBBY_SCENE, LobbyScene);
game.scene.add(SCENE_KEYS.LOADING_SCENE, LoadingScene);
game.scene.add(SCENE_KEYS.PRELOAD_SCENE, PreloadScene);
game.scene.add(SCENE_KEYS.GAME_SCENE, GameScene);
game.scene.add(SCENE_KEYS.UI_SCENE, UiScene);
game.scene.add(SCENE_KEYS.GAME_OVER_SCENE, GameOverScene);
game.scene.add(SCENE_KEYS.RADIAL_MENU_SCENE, RadialMenuScene);

// Boot flow per D-03: Splash -> MainMenu -> Lobby
game.scene.start(SCENE_KEYS.SPLASH_SCENE);

new DebugPanel();
