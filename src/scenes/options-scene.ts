import { SCENE_KEYS } from './scene-keys';
import { startScene } from './scene-transition';
import { MusicManager } from '../common/music-manager';
import { SettingsMenuBaseScene, SettingsMenuRowDef, SETTINGS_MENU_W, SETTINGS_MENU_H } from './settings-menu-base';

// ---------------------------------------------------------------------------
// OptionsScene — main-menu OPCOES
// ---------------------------------------------------------------------------
// Same settings as the in-match pause menu (volume, fullscreen, controls
// list) via SettingsMenuBaseScene — minus the match-only rows (CONTINUAR /
// SAIR DA SALA). ESC or VOLTAR returns to MainMenuScene.
// ---------------------------------------------------------------------------

export class OptionsScene extends SettingsMenuBaseScene {
  // startScene's fade-out takes 300ms — guard against ESC/VOLTAR re-triggering
  // the transition while it plays.
  #closing = false;

  constructor() {
    super({ key: SCENE_KEYS.OPTIONS_SCENE });
  }

  public init(): void {
    this.#closing = false;
  }

  public create(): void {
    MusicManager.instance.playMenu(this);
    super.create();
  }

  protected buildBackdrop(): void {
    // Solid black + fade-in, matching the other main-menu sub-scenes.
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.add.rectangle(0, 0, SETTINGS_MENU_W, SETTINGS_MENU_H, 0x000000, 1).setOrigin(0);
  }

  protected mainTitle(): string {
    return 'OPCOES';
  }

  protected mainHint(): string {
    return 'W/S NAVEGA  A/D AJUSTA O SOM  ESC VOLTA';
  }

  protected rowsBeforeSettings(): SettingsMenuRowDef[] {
    return [];
  }

  protected rowsAfterSettings(): SettingsMenuRowDef[] {
    return [{ label: 'VOLTAR', activate: () => this.closeMenu() }];
  }

  protected closeMenu(): void {
    if (this.#closing) return;
    this.#closing = true;
    startScene(this, SCENE_KEYS.MAIN_MENU_SCENE);
  }
}
