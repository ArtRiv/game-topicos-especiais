import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys.js';
import { NetworkManager } from '../networking/network-manager.js';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus.js';
import type { Lobby, PlayerInfo } from '../networking/types.js';

const FONT = { fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#ffffff' };
const FONT_TITLE = { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#ffdd55' };
const FONT_SMALL = { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#cccccc' };
const FONT_SMALL_WHITE = { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff' };
const BTN_COLOR = 0x3355aa;
const BTN_HOVER = 0x4477cc;
const BTN_DISABLED = 0x223366;

type ViewObjects = Phaser.GameObjects.GameObject[];

export class LobbyScene extends Phaser.Scene {
  #playerName: string = 'Player';
  #localSocketId: string = '';
  #viewObjects: ViewObjects = [];
  #ipInput!: Phaser.GameObjects.DOMElement;
  #nickInput!: Phaser.GameObjects.DOMElement;
  #statusText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: SCENE_KEYS.LOBBY_SCENE });
  }

  public create(): void {
    this.#showConnectView();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onLobbyUpdated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDisconnected, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
      this.#currentLobby = null;
      this.#clearView();
    });
  }

  // --- View A: Connect Screen ---
  #showConnectView(): void {
    this.#clearView();
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    const title = this.add.text(cx, cy - 120, 'MAGES ONLINE', FONT_TITLE).setOrigin(0.5);

    const ipLabel = this.add.text(cx - 150, cy - 50, 'SERVER IP:', FONT_SMALL).setOrigin(0, 0.5);
    this.#ipInput = this.add.dom(cx + 30, cy - 50).createFromHTML(
      '<input type="text" value="localhost" style="width:160px;background:#111;color:#fff;border:1px solid #555;padding:4px;font-size:10px;font-family:monospace">'
    );

    const nickLabel = this.add.text(cx - 150, cy - 10, 'NICKNAME:', FONT_SMALL).setOrigin(0, 0.5);
    this.#nickInput = this.add.dom(cx + 30, cy - 10).createFromHTML(
      '<input type="text" value="Player" maxlength="12" style="width:160px;background:#111;color:#fff;border:1px solid #555;padding:4px;font-size:10px;font-family:monospace">'
    );

    this.#statusText = this.add.text(cx, cy + 40, '', FONT_SMALL).setOrigin(0.5);

    const btn = this.#createButton(cx, cy + 70, 'CONNECT', () => this.#onConnect());

    this.#viewObjects = [title, ipLabel, this.#ipInput, nickLabel, this.#nickInput, this.#statusText, btn];
  }

  #onConnected = (): void => {
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
    const nm = NetworkManager.getInstance();
    this.#localSocketId = nm.socketId;
    nm.sendLobbyList();
    this.#showLobbyListView();
  };

  #onDisconnected = (): void => {
    if (this.#statusText) {
      this.#statusText.setText('Disconnected from server').setColor('#ff4444');
    }
  };

  #onConnect(): void {
    const ipEl = this.#ipInput.node as HTMLElement;
    const nickEl = this.#nickInput.node as HTMLElement;
    const ip = ((ipEl.querySelector('input') ?? ipEl) as HTMLInputElement).value.trim() || 'localhost';
    const nick = ((nickEl.querySelector('input') ?? nickEl) as HTMLInputElement).value.trim() || 'Player';

    this.#playerName = nick;
    if (this.#statusText) this.#statusText.setText('Connecting...').setColor('#ffdd55');

    const port = 3000;
    const url = ip.includes(':') ? `http://${ip}` : `http://${ip}:${port}`;

    EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDisconnected, this);

    const nm = NetworkManager.init(url);
    nm.connect();
  }

  // --- View B: Lobby List Screen ---
  #lobbies: Lobby[] = [];
  #lobbyListContainer: Phaser.GameObjects.GameObject[] = [];

  #showLobbyListView(): void {
    this.#clearView();
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    const title = this.add.text(cx, 40, 'LOBBIES', FONT_TITLE).setOrigin(0.5);
    const hint = this.add.text(cx, 65, 'Click a lobby to join it', FONT_SMALL).setOrigin(0.5);

    const createBtn = this.#createButton(cx, 100, 'CREATE LOBBY', () => {
      NetworkManager.getInstance().sendLobbyCreate(this.#playerName);
    });

    const listLabel = this.add.text(cx - 200, 130, 'Available lobbies:', FONT_SMALL).setOrigin(0, 0);
    this.#lobbyListContainer = [];

    this.#viewObjects = [title, hint, createBtn, listLabel];

    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onLobbyUpdated, this);
    // Re-fetch list
    NetworkManager.getInstance().sendLobbyList();
  }

  #onLobbyUpdated = (data: { lobby?: Lobby; lobbies?: Lobby[] }): void => {
    if (data.lobbies) {
      this.#lobbies = data.lobbies;
      this.#renderLobbyList();
      return;
    }
    if (data.lobby) {
      this.#currentLobby = data.lobby;
      this.#showWaitingRoomView(data.lobby);
    }
  };

  #renderLobbyList(): void {
    // Clear old lobby rows
    this.#lobbyListContainer.forEach((o) => o.destroy());
    this.#lobbyListContainer = [];

    const cx = this.cameras.main.centerX;
    const baseY = 155;

    if (this.#lobbies.length === 0) {
      const empty = this.add.text(cx, baseY + 16, 'No open lobbies', FONT_SMALL).setOrigin(0.5);
      this.#lobbyListContainer.push(empty);
      return;
    }

    this.#lobbies.slice(0, 6).forEach((lobby, i) => {
      const rowY = baseY + i * 36;
      const bg = this.add.rectangle(cx, rowY + 12, 380, 30, 0x223366).setInteractive();
      const label = this.add.text(cx - 185, rowY, `${lobby.players[0]?.name ?? '?'}\'s lobby`, FONT_SMALL_WHITE);
      const count = this.add.text(cx + 140, rowY, `${lobby.players.length} player(s)`, FONT_SMALL);

      bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
      bg.on('pointerout', () => bg.setFillStyle(0x223366));
      bg.on('pointerdown', () => {
        NetworkManager.getInstance().sendLobbyJoin(lobby.id, this.#playerName);
      });

      this.#lobbyListContainer.push(bg, label, count);
    });
  }

  // --- View C: Waiting Room ---
  #waitingRoomObjects: Phaser.GameObjects.GameObject[] = [];
  #currentLobby: Lobby | null = null;

  get #isHost(): boolean {
    if (!this.#currentLobby) return false;
    const me = this.#currentLobby.players.find(p => p.socketId === this.#localSocketId);
    return me !== undefined && me.id === this.#currentLobby.hostPlayerId;
  }

  #showWaitingRoomView(lobby: Lobby): void {
    // Remove lobby list view listeners and objects
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onLobbyUpdated, this);
    this.#clearView();

    this.#currentLobby = lobby;
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    const title = this.add.text(cx, 40, 'WAITING ROOM', FONT_TITLE).setOrigin(0.5);
    const hostName = lobby.players.find((p) => p.id === lobby.hostPlayerId)?.name ?? '?';
    const subtitle = this.add.text(cx, 70, `Host: ${hostName}`, FONT_SMALL).setOrigin(0.5);
    const hint = this.add.text(cx, 88, 'Waiting for host to start...', FONT_SMALL).setOrigin(0.5);

    this.#waitingRoomObjects = [title, subtitle, hint];
    this.#viewObjects = [...this.#waitingRoomObjects];

    this.#renderPlayerList(lobby.players);

    // Show START button only for the host (derived from lobby.hostPlayerId)
    if (this.#isHost) {
      const startBtn = this.#createButton(cx, cy + 120, 'START GAME', () => {
        NetworkManager.getInstance().sendLobbyStart();
      });
      this.#viewObjects.push(startBtn);
    }

    // Listen for further updates
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
  }

  #onWaitingRoomUpdate = (data: { lobby?: Lobby }): void => {
    if (data.lobby) {
      this.#currentLobby = data.lobby;
      this.#renderPlayerList(data.lobby.players);
    }
  };

  #onHostChanged = (data: { newHostPlayerId: string }): void => {
    if (this.#currentLobby) {
      this.#currentLobby = { ...this.#currentLobby, hostPlayerId: data.newHostPlayerId };
      this.#showWaitingRoomView(this.#currentLobby);
    }
  };

  #onLobbyStarted = (): void => {
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
    this.#currentLobby = null;
    this.scene.stop(SCENE_KEYS.LOBBY_SCENE);
    this.scene.start(SCENE_KEYS.PRELOAD_SCENE);
  };

  #playerListObjects: Phaser.GameObjects.GameObject[] = [];

  #renderPlayerList(players: PlayerInfo[]): void {
    this.#playerListObjects.forEach((o) => o.destroy());
    this.#playerListObjects = [];

    const cx = this.cameras.main.centerX;
    const baseY = 120;
    const TINTS = [0xffffff, 0x00aaff, 0xff4444, 0x44ff44, 0xff44ff];

    players.forEach((player, i) => {
      const rowY = baseY + i * 36;
      const tint = TINTS[i % TINTS.length];
      const dot = this.add.rectangle(cx - 150, rowY + 8, 12, 12, tint);
      const name = this.add.text(cx - 130, rowY, player.name, FONT_SMALL_WHITE);
      const role = player.id === this.#currentLobby?.hostPlayerId
        ? this.add.text(cx + 30, rowY, '(HOST)', FONT_SMALL)
        : null;

      this.#playerListObjects.push(dot, name);
      if (role) this.#playerListObjects.push(role);

      if (this.#isHost) {
        // Host sees clickable Team A / Team B toggle buttons per row
        const isTeamA = player.team === 0;
        const isTeamB = player.team === 1;
        const nm = NetworkManager.getInstance();

        const btnA = this.#createButton(cx + 90, rowY + 8, 'A', () => {
          nm.sendLobbyAssignTeam(player.id, 0);
        });
        const btnB = this.#createButton(cx + 130, rowY + 8, 'B', () => {
          nm.sendLobbyAssignTeam(player.id, 1);
        });

        // Active team = bright; inactive = dimmed; unassigned = both buttons visible at default
        const bgA = (btnA as Phaser.GameObjects.Container).getAt(0) as Phaser.GameObjects.Rectangle;
        const bgB = (btnB as Phaser.GameObjects.Container).getAt(0) as Phaser.GameObjects.Rectangle;
        if (isTeamA) {
          bgA.setFillStyle(0x0066dd);  // active Team A — bright blue
          bgB.setFillStyle(BTN_DISABLED);
        } else if (isTeamB) {
          bgA.setFillStyle(BTN_DISABLED);
          bgB.setFillStyle(0xcc2200);  // active Team B — bright red
        }
        // unassigned: both keep their default BTN_COLOR so they're clearly visible

        this.#playerListObjects.push(btnA, btnB);
      } else {
        // Non-host sees a read-only team badge
        const teamLabel = player.team === 0 ? 'TEAM A' : player.team === 1 ? 'TEAM B' : 'NO TEAM';
        const teamColor = player.team === 0 ? '#44aaff' : player.team === 1 ? '#ff5533' : '#aaaaaa';
        const badge = this.add.text(cx + 80, rowY, teamLabel, { ...FONT_SMALL, color: teamColor });
        this.#playerListObjects.push(badge);
      }
    });
  }

  // --- Helpers ---
  #createButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, label.length * 10 + 24, 28, BTN_COLOR).setInteractive();
    const text = this.add.text(0, 0, label, FONT_SMALL_WHITE).setOrigin(0.5);
    const container = this.add.container(x, y, [bg, text]);

    bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
    bg.on('pointerout', () => bg.setFillStyle(BTN_COLOR));
    bg.on('pointerdown', onClick);

    return container;
  }

  #clearView(): void {
    this.#viewObjects.forEach((o) => o.destroy());
    this.#lobbyListContainer.forEach((o) => o.destroy());
    this.#waitingRoomObjects.forEach((o) => o.destroy());
    this.#playerListObjects.forEach((o) => o.destroy());
    this.#viewObjects = [];
    this.#lobbyListContainer = [];
    this.#waitingRoomObjects = [];
    this.#playerListObjects = [];
  }
}
