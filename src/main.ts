import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scenes/scene-keys';
import { LobbyScene } from './scenes/lobby-scene';
import { PreloadScene } from './scenes/preload-scene';
import { GameScene } from './scenes/game-scene';
import { UiScene } from './scenes/ui-scene';
import { GameOverScene } from './scenes/game-over-scene';
import { RadialMenuScene } from './scenes/radial-menu-scene';
import { DebugPanel } from './debug/debug-panel';

const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  pixelArt: true,
  roundPixels: true,
  scale: {
    parent: 'game-container',
    mode: Phaser.Scale.RESIZE,
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

game.scene.add(SCENE_KEYS.LOBBY_SCENE, LobbyScene);
game.scene.add(SCENE_KEYS.PRELOAD_SCENE, PreloadScene);
game.scene.add(SCENE_KEYS.GAME_SCENE, GameScene);
game.scene.add(SCENE_KEYS.UI_SCENE, UiScene);
game.scene.add(SCENE_KEYS.GAME_OVER_SCENE, GameOverScene);
game.scene.add(SCENE_KEYS.RADIAL_MENU_SCENE, RadialMenuScene);
game.scene.start(SCENE_KEYS.LOBBY_SCENE);

new DebugPanel();
