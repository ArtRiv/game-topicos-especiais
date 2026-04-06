import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { buildMenuPlaceholder } from './menu-placeholder';

// ---------------------------------------------------------------------------
// JoinLobbyScene â€” placeholder
// ---------------------------------------------------------------------------
// Current behaviour: shows a "Join Lobby" stub UI and routes into LobbyScene.
//
// EVOLVE: replace with a lobby-browser view (list of open lobbies, filters,
// friend invites) once the backend supports it.
// ---------------------------------------------------------------------------
export class JoinLobbyScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.JOIN_LOBBY_SCENE });
  }

  public create(): void {
    buildMenuPlaceholder(this, {
      title: 'ENTRAR EM LOBBY',
      hint: 'Encontre uma partida em andamento.',
      primaryLabel: 'CONECTAR AO SERVIDOR',
      primaryAction: () => this.scene.start(SCENE_KEYS.LOBBY_SCENE),
      backScene: SCENE_KEYS.MAIN_MENU_SCENE,
    });
  }
}
