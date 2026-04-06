import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { buildMenuPlaceholder } from './menu-placeholder';

// ---------------------------------------------------------------------------
// CreditsScene â€” placeholder
// ---------------------------------------------------------------------------
// EVOLVE: replace the hint text with a scrolling credits list (team members,
// asset licenses, tools) â€” can be a tween-driven text object or a custom
// masked scroll container.
// ---------------------------------------------------------------------------
export class CreditsScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.CREDITS_SCENE });
  }

  public create(): void {
    buildMenuPlaceholder(this, {
      title: 'CREDITOS',
      hint: 'A equipe por tras do jogo. (Em breve)',
      backScene: SCENE_KEYS.MAIN_MENU_SCENE,
    });
  }
}
