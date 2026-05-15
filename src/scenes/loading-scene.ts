import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus';
import { NetworkManager } from '../networking/network-manager';
import type { MatchConfig, MatchStateChangedPayload, PlayerInfo } from '../networking/types';

const FONT_TITLE = { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#ffdd55' };
const FONT_SMALL = { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#cccccc' };
const FONT_SMALL_WHITE = { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff' };
const TINTS = [0xffffff, 0x00aaff, 0xff4444, 0x44ff44, 0xff44ff];

// LFC-04 requires the player list + map preview to be perceivable. On localhost the
// server stub can complete the sync barrier within a single frame, making the scene
// effectively invisible. Hold for at least this long so the user always sees it.
const MIN_DISPLAY_MS = 1500;

type LoadingSceneData = { matchConfig: MatchConfig };

/**
 * Pre-match loading screen (LFC-04). Shown between LobbyScene and PreloadScene/GameScene.
 *
 * - Renders the match player list (names + team colors) and the selected map name/preview.
 * - Sends `match:loaded` to the server exactly once on entry (LFC-05 sync barrier).
 * - Waits for the server's COUNTDOWN (or ACTIVE — Phase 7 stub auto-advances 50ms later)
 *   broadcast before starting PreloadScene -> GameScene. No client enters the game ahead
 *   of the slowest peer.
 *
 * LoadingScene does NOT preload Phaser assets — PreloadScene still owns the asset pack.
 * This scene is UI-only during Phase 7. Phase 8 will add a real 3-2-1 countdown + spawn lock.
 */
export class LoadingScene extends Phaser.Scene {
  #matchConfig!: MatchConfig;
  #ackSent: boolean = false;
  #statusText!: Phaser.GameObjects.Text;
  #enteredAt: number = 0;
  #pendingTransition: boolean = false;

  constructor() {
    super({ key: SCENE_KEYS.LOADING_SCENE });
  }

  init(data: LoadingSceneData): void {
    this.#matchConfig = data.matchConfig;
    this.#ackSent = false;
    this.#pendingTransition = false;
  }

  create(): void {
    this.#enteredAt = this.time.now;
    this.#renderUI();

    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);

    // Send the loaded ack on the next tick so the UI is visible to the user before we transition.
    // For Phase 7 there are no large async loads here — PreloadScene still owns the asset pack —
    // so a single deferred ack is sufficient as the LFC-05 sync-barrier signal.
    this.time.delayedCall(0, () => this.#sendLoadedAck());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
    });
  }

  #renderUI(): void {
    const cx = this.cameras.main.centerX;

    this.add.text(cx, 30, 'LOADING MATCH', FONT_TITLE).setOrigin(0.5);

    // Map preview placeholder — Phase 9 will replace this rectangle with a real preview asset.
    const mapName = this.#matchConfig.mode || 'default-map';
    this.add.text(cx, 60, `Map: ${mapName}`, FONT_SMALL_WHITE).setOrigin(0.5);
    this.add.rectangle(cx, 130, 280, 100, 0x222244).setStrokeStyle(2, 0x4477cc);
    this.add.text(cx, 130, '(map preview)', FONT_SMALL).setOrigin(0.5);

    // Player list — names + team colors, mirroring LobbyScene #renderPlayerList palette
    const players = this.#matchConfig.players;
    const baseY = 200;
    this.add.text(cx, baseY - 20, `PLAYERS (${players.length})`, FONT_SMALL_WHITE).setOrigin(0.5);
    players.forEach((p: PlayerInfo, i: number) => {
      const rowY = baseY + i * 22;
      const color = p.team === 0 ? 0x44aaff : p.team === 1 ? 0xff5533 : TINTS[i % TINTS.length];
      this.add.rectangle(cx - 80, rowY, 10, 10, color);
      this.add.text(cx - 60, rowY - 6, p.name, FONT_SMALL_WHITE);
      const teamLabel = p.team === 0 ? 'A' : p.team === 1 ? 'B' : '-';
      this.add.text(cx + 60, rowY - 6, teamLabel, FONT_SMALL).setOrigin(0.5);
    });

    this.#statusText = this.add.text(cx, this.cameras.main.height - 30, 'Loading...', FONT_SMALL)
      .setOrigin(0.5);
  }

  #sendLoadedAck(): void {
    if (this.#ackSent) return;
    this.#ackSent = true;
    NetworkManager.getInstance().sendMatchLoaded(this.#matchConfig.lobbyId);
    if (this.#statusText) this.#statusText.setText('Waiting for other players...');
  }

  #onMatchStateChanged = (payload: MatchStateChangedPayload): void => {
    if (payload.lobbyId !== this.#matchConfig.lobbyId) return;
    if (payload.state !== 'COUNTDOWN' && payload.state !== 'ACTIVE') return;
    if (this.#pendingTransition) return;
    this.#pendingTransition = true;

    // Either COUNTDOWN or ACTIVE means every client has loaded — chain to PreloadScene.
    // (The Phase 7 stub auto-advances COUNTDOWN->ACTIVE in 50 ms, so either may arrive first.)
    // Enforce MIN_DISPLAY_MS so the player list + map name are perceivable to the user.
    const elapsed = this.time.now - this.#enteredAt;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    this.time.delayedCall(remaining, () => {
      if (this.#statusText) this.#statusText.setText('Starting match...');
      this.scene.stop(SCENE_KEYS.LOADING_SCENE);
      this.scene.start(SCENE_KEYS.PRELOAD_SCENE);
    });
  };
}
