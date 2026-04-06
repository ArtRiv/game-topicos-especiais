import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { buildMenuPlaceholder } from './menu-placeholder';

// ---------------------------------------------------------------------------
// AccountScene â€” placeholder
// ---------------------------------------------------------------------------
// EVOLVE: add login / registration / profile management once auth backend is
// integrated (planned in milestone 01-auth-server-scaffold).
// ---------------------------------------------------------------------------
export class AccountScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.ACCOUNT_SCENE });
  }

  public create(): void {
    buildMenuPlaceholder(this, {
      title: 'CONTA',
      hint: 'Login, perfil e conquistas. (Em breve)',
      backScene: SCENE_KEYS.MAIN_MENU_SCENE,
    });
  }
}
