import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { buildMenuPlaceholder } from './menu-placeholder';
import { MusicManager } from '../common/music-manager';

// ---------------------------------------------------------------------------
// CreditsScene — placeholder
// ---------------------------------------------------------------------------
// EVOLVE: replace the EM BREVE body with a scrolling credits list (team,
// asset licenses, tools) — a tween-driven BitmapText or a masked scroll
// container.
// ---------------------------------------------------------------------------
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.CREDITS_SCENE });
  }

  public create(): void {
    MusicManager.instance.playMenu(this);
    buildMenuPlaceholder(this, {
      title: 'CREDITOS',
      backScene: SCENE_KEYS.MAIN_MENU_SCENE,
    });
  }
}
