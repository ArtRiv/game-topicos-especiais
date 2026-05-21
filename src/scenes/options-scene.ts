import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { buildMenuPlaceholder } from './menu-placeholder';

// ---------------------------------------------------------------------------
// OptionsScene — placeholder
// ---------------------------------------------------------------------------
// EVOLVE: add volume controls, key remapping, display/resolution settings,
// language selection. Persist to localStorage or a settings service.
// ---------------------------------------------------------------------------
export class OptionsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.OPTIONS_SCENE });
  }

  public create(): void {
    buildMenuPlaceholder(this, {
      title: 'OPCOES',
      backScene: SCENE_KEYS.MAIN_MENU_SCENE,
    });
  }
}
