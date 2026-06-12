import { SCENE_KEYS } from './scene-keys';
import { SettingsMenuBaseScene, SettingsMenuRowDef, SETTINGS_MENU_W, SETTINGS_MENU_H } from './settings-menu-base';

// ---------------------------------------------------------------------------
// PauseMenuScene — ESC in-match options overlay
// ---------------------------------------------------------------------------
// Launched by GameScene on ESC. The match keeps RUNNING underneath (online
// match — the world can't stop for one player); GameScene gates its own local
// input while this scene is active and re-enables it on our SHUTDOWN.
//
// Pages: MAIN (continuar / som / tela cheia / controles / sair) and
// CONTROLES (static keybinding list). All the menu machinery lives in
// SettingsMenuBaseScene (shared with the main-menu OptionsScene).
// ---------------------------------------------------------------------------

export class PauseMenuScene extends SettingsMenuBaseScene {
  constructor() {
    super({ key: SCENE_KEYS.PAUSE_MENU_SCENE });
  }

  protected buildBackdrop(): void {
    // Dim overlay — the running match stays visible underneath.
    this.add.rectangle(0, 0, SETTINGS_MENU_W, SETTINGS_MENU_H, 0x000000, 0.6).setOrigin(0);
  }

  protected mainTitle(): string {
    return 'MENU';
  }

  protected mainHint(): string {
    return 'W/S NAVEGA  A/D AJUSTA O SOM  ESC FECHA';
  }

  protected rowsBeforeSettings(): SettingsMenuRowDef[] {
    return [{ label: 'CONTINUAR', activate: () => this.closeMenu() }];
  }

  protected rowsAfterSettings(): SettingsMenuRowDef[] {
    return [
      {
        label: 'SAIR DA SALA',
        activate: () => {
          // Same exit path as GameOverScene's "Quit": a full reload guarantees
          // clean network/scene state; the server detects the socket drop.
          window.location.reload();
        },
      },
    ];
  }

  protected closeMenu(): void {
    this.scene.stop();
  }
}
