import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { buildMenuPlaceholder } from './menu-placeholder';
import { MusicManager } from '../common/music-manager';

// ---------------------------------------------------------------------------
// AccountScene — placeholder
// ---------------------------------------------------------------------------
// EVOLVE: add login / registration / profile management once auth backend
// (AUTH-01..AUTH-03) is integrated.
// ---------------------------------------------------------------------------
export class AccountScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.ACCOUNT_SCENE });
  }

  public create(): void {
    // Switch from intro music (teste.mp3) to the standard menu loop on entry.
    MusicManager.instance.playMenu(this);
    buildMenuPlaceholder(this, {
      title: 'CONTA',
      backScene: SCENE_KEYS.MAIN_MENU_SCENE,
    });
  }
}
