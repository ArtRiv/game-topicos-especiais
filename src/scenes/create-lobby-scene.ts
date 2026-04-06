import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { buildMenuPlaceholder } from './menu-placeholder';

// ---------------------------------------------------------------------------
// CreateLobbyScene â€” placeholder
// ---------------------------------------------------------------------------
// Current behaviour: shows a "Create Lobby" stub UI and routes the player into
// the existing LobbyScene (which handles the full connectâ†’createâ†’wait flow).
//
// EVOLVE: replace the body of create() with dedicated lobby-creation forms
// (server region, game mode, max players, etc.) once the game design is locked.
// ---------------------------------------------------------------------------
export class CreateLobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.CREATE_LOBBY_SCENE });
  }

  public create(): void {
    buildMenuPlaceholder(this, {
      title: 'CRIAR LOBBY',
      hint: 'Configure sua partida e convide jogadores.',
      // Primary action â€” hands off to LobbyScene which owns the network flow.
      primaryLabel: 'CONECTAR AO SERVIDOR',
      primaryAction: () => this.scene.start(SCENE_KEYS.LOBBY_SCENE),
      backScene: SCENE_KEYS.MAIN_MENU_SCENE,
    });
  }
}
