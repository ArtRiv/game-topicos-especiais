import * as Phaser from 'phaser';
import { SCENE_KEYS } from './scene-keys.js';
import { NetworkManager } from '../networking/network-manager.js';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus.js';
import type { Lobby, LobbyConfig, LobbyFormat, MatchConfig, PlayerInfo } from '../networking/types.js';
import { MAP_POOL } from '../networking/types.js';
import { ASSET_KEYS } from '../common/assets.js';
import { LOBBY_VOLUME, MusicManager } from '../common/music-manager';

// BitmapText replaces Phaser.GameObjects.Text. Press_Start_2P TTF was
// pre-rasterized via Snowb into Press_Start-2.png + Press_Start-2.fnt
// so glyphs draw as nearest-neighbor sprites instead of canvas2d AA text.
const BMFONT_KEY = 'press_start_2p';
type BMStyle = { size: number; tint: number };
// Atlas is rendered at native 8px — render at 8 (1:1) or 16 (2:1) for
// crisp pixel-grid output. Non-multiples of 8 cause fractional glyph
// scaling and blur, so FONT (was 10) snaps to 8 and FONT_TITLE (was 14)
// snaps to 16.
const FONT: BMStyle = { size: 8, tint: 0xffffff };
const FONT_TITLE: BMStyle = { size: 16, tint: 0xffdd55 };
const FONT_SMALL: BMStyle = { size: 8, tint: 0xcccccc };
const FONT_SMALL_WHITE: BMStyle = { size: 8, tint: 0xffffff };
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
  #statusText!: Phaser.GameObjects.BitmapText;
  #configBlockObjects: Phaser.GameObjects.GameObject[] = [];
  #formatSelectDom: Phaser.GameObjects.DOMElement | null = null;
  #capacityHeader: Phaser.GameObjects.BitmapText | null = null;

  constructor() {
    super({ key: SCENE_KEYS.LOBBY_SCENE });
  }

  public preload(): void {
    // Game boots straight into LobbyScene (main.ts), so PreloadScene's loads
    // are not available yet when map cards first render. Load the two map
    // thumbnails here so `this.textures.exists(...)` is true by create() time
    // and the blue fallback rectangle never shows.
    this.load.image(
      ASSET_KEYS.MAP_THUMB_WORLD,
      'assets/levels/world/thumbnail.png',
    );
    this.load.image(
      ASSET_KEYS.MAP_THUMB_DUNGEON_1,
      'assets/levels/dungeon-1/thumbnail.png',
    );
    this.load.image(
      ASSET_KEYS.MAP_THUMB_STAGES,
      'assets/stages/thumbnail.png',
    );
    this.load.bitmapFont(
      BMFONT_KEY,
      'assets/fonts/Press_Start_2P/press_start_white-2.png',
      'assets/fonts/Press_Start_2P/press_start_white-2.xml',
    );
  }

  public create(): void {
    this.#showConnectView();

    // Switch from intro music (teste.mp3) to the standard menu loop, faded
    // directly to the ducked LOBBY_VOLUME (0.03) so we don't have a tween →
    // hard-set conflict with the prior setMenuVolume call below. No-op if
    // menu music is already the active track (back-nav, fresh boot via a
    // sub-scene that already swapped).
    MusicManager.instance.playMenu(this, { volume: LOBBY_VOLUME });

    // D-13: ensure the ducked level is applied even on the no-op fast path
    // (when menu music is already playing and playMenu skipped the fade).
    MusicManager.instance.setMenuVolume(LOBBY_VOLUME);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onLobbyUpdated, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDisconnected, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
      EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, this.#onLobbyError, this);
      this.#currentLobby = null;
      this.#clearView();
    });
  }

  // --- View A: Connect Screen ---
  #showConnectView(): void {
    this.#clearView();
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    const title = this.#crispText(cx, cy - 120, 'MAGES ONLINE', FONT_TITLE).setOrigin(0.5);

    const ipLabel = this.#crispText(cx - 150, cy - 50, 'SERVER IP:', FONT_SMALL).setOrigin(0, 0.5);
    this.#ipInput = this.add.dom(cx + 30, cy - 50).createFromHTML(
      '<input type="text" value="localhost" style="width:160px;background:#111;color:#fff;border:1px solid #555;padding:4px;font-size:10px;font-family:monospace">'
    );

    const nickLabel = this.#crispText(cx - 150, cy - 10, 'NICKNAME:', FONT_SMALL).setOrigin(0, 0.5);
    this.#nickInput = this.add.dom(cx + 30, cy - 10).createFromHTML(
      '<input type="text" value="Player" maxlength="12" style="width:160px;background:#111;color:#fff;border:1px solid #555;padding:4px;font-size:10px;font-family:monospace">'
    );

    this.#statusText = this.#crispText(cx, cy + 40, '', FONT_SMALL).setOrigin(0.5);

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
      this.#statusText.setText('Disconnected from server').setTint(0xff4444);
    }
  };

  #onConnect(): void {
    const ipEl = this.#ipInput.node as HTMLElement;
    const nickEl = this.#nickInput.node as HTMLElement;
    const ip = ((ipEl.querySelector('input') ?? ipEl) as HTMLInputElement).value.trim() || 'localhost';
    const nick = ((nickEl.querySelector('input') ?? nickEl) as HTMLInputElement).value.trim() || 'Player';

    this.#playerName = nick;
    if (this.#statusText) this.#statusText.setText('Connecting...').setTint(0xffdd55);

    const port = 3000;
    const url = ip.includes(':') ? `http://${ip}` : `http://${ip}:${port}`;

    EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, this.#onConnected, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDisconnected, this);
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

    const title = this.#crispText(cx, 40, 'LOBBIES', FONT_TITLE).setOrigin(0.5);
    const hint = this.#crispText(cx, 65, 'Click a lobby to join it', FONT_SMALL).setOrigin(0.5);

    const createBtn = this.#createButton(cx, 100, 'CREATE LOBBY', () => {
      NetworkManager.getInstance().sendLobbyCreate(this.#playerName);
    });

    const listLabel = this.#crispText(cx - 200, 130, 'Available lobbies:', FONT_SMALL).setOrigin(0, 0);
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
      const empty = this.#crispText(cx, baseY + 16, 'No open lobbies', FONT_SMALL).setOrigin(0.5);
      this.#lobbyListContainer.push(empty);
      return;
    }

    this.#lobbies.slice(0, 6).forEach((lobby, i) => {
      const rowY = baseY + i * 36;
      const bg = this.add.rectangle(cx, rowY + 12, 380, 30, 0x223366).setInteractive();
      const c = lobby.config;
      const md = MAP_POOL.find(m => m.id === c.mapId)?.displayName ?? c.mapId;
      const rowText = `${lobby.players[0]?.name ?? '?'}'s lobby — ${c.format} • ${md} • ${lobby.players.length}/${c.maxPlayers}`;
      const label = this.#crispText(cx - 185, rowY, rowText, FONT_SMALL_WHITE);

      bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
      bg.on('pointerout', () => bg.setFillStyle(0x223366));
      bg.on('pointerdown', () => {
        NetworkManager.getInstance().sendLobbyJoin(lobby.id, this.#playerName);
      });

      this.#lobbyListContainer.push(bg, label);
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

    // Title bar background — adds a subtle banner behind the title for visual anchor.
    const titleBg = this.add.rectangle(cx, 24, this.cameras.main.width, 36, 0x111933).setOrigin(0.5);
    const titleUnderline = this.add.rectangle(cx, 42, 200, 1, 0xffdd55).setOrigin(0.5);
    const title = this.#crispText(cx, 24, 'WAITING ROOM', FONT_TITLE).setOrigin(0.5);
    const hostName = lobby.players.find((p) => p.id === lobby.hostPlayerId)?.name ?? '?';
    const subtitle = this.#crispText(cx, 56, `Host: ${hostName}`, FONT_SMALL).setOrigin(0.5);

    this.#waitingRoomObjects = [titleBg, titleUnderline, title, subtitle];
    this.#viewObjects = [...this.#waitingRoomObjects];

    // Status line (errors / info) — placed just below the subtitle so it never
    // overlaps the config block or the player list below.
    this.#statusText = this.#crispText(cx, 70, '', FONT_SMALL).setOrigin(0.5);
    this.#viewObjects.push(this.#statusText);

    this.#renderConfigBlock(lobby);
    this.#renderPlayerList(lobby.players);

    // Show START button only for the host (derived from lobby.hostPlayerId)
    // Anchored at the bottom of the canvas, below the player-list viewport (296).
    if (this.#isHost) {
      const startBtn = this.#createButton(cx, 304, 'START GAME', () => {
        NetworkManager.getInstance().sendLobbyStart();
      });
      this.#viewObjects.push(startBtn);
    }

    // Listen for further updates
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, this.#onLobbyError, this);
  }

  #renderConfigBlock(lobby: Lobby): void {
    // Tear down any prior config-block objects (used on lobby:updated re-render).
    this.#configBlockObjects.forEach((o) => o.destroy());
    this.#configBlockObjects = [];
    this.#formatSelectDom = null;
    this.#capacityHeader = null;

    const cx = this.cameras.main.centerX;
    const cfg = lobby.config;
    const mapDisplay = MAP_POOL.find((m) => m.id === cfg.mapId)?.displayName ?? cfg.mapId;

    // Subtle panel behind the whole config block (capacity header + format row +
    // map cards + card name labels). Centered at y=144, height 132 → spans y=78
    // to y=210 — covers capacity (y=86) through card-name labels (~y=202).
    const panel = this.add.rectangle(cx, 144, this.cameras.main.width - 16, 132, 0x0a0f1f, 0.6).setOrigin(0.5);
    const panelBorder = this.add.rectangle(cx, 144, this.cameras.main.width - 16, 132)
      .setOrigin(0.5)
      .setStrokeStyle(1, 0x2a3a55);
    this.#configBlockObjects.push(panel, panelBorder);

    // Capacity header (visible to everyone) — simplified: format & map are shown
    // explicitly below, so no need to duplicate them here.
    this.#capacityHeader = this.#crispText(
      cx,
      86,
      `Players ${lobby.players.length}/${cfg.maxPlayers}`,
      FONT,
    ).setOrigin(0.5, 0);
    this.#configBlockObjects.push(this.#capacityHeader);

    if (this.#isHost) {
      // Format row — centered horizontal pair: "Format:" label + <select>.
      // Anchored so the pair reads as one unit above the map cards.
      const formatLabel = this.#crispText(cx - 8, 104, 'Format:', FONT_SMALL_WHITE).setOrigin(1, 0.5);
      const formats: LobbyFormat[] = ['1v1', '2v2', '3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10'];
      const optionsHtml = formats.map((f) => `<option value="${f}">${f}</option>`).join('');
      const formatDom = this.add.dom(cx + 4, 104).createFromHTML(
        `<select style="background:#111;color:#fff;border:1px solid #555;padding:2px 4px;font-size:10px;font-family:monospace">${optionsHtml}</select>`,
      ).setOrigin(0, 0.5);
      const selectEl = (formatDom.node as HTMLElement).querySelector('select') as HTMLSelectElement;
      selectEl.value = cfg.format;
      selectEl.addEventListener('change', () => {
        NetworkManager.getInstance().sendLobbySetConfig({ format: selectEl.value as LobbyFormat });
      });
      this.#formatSelectDom = formatDom;
      this.#configBlockObjects.push(formatLabel, formatDom);

      // Map label — centered above the cards row.
      const mapLabel = this.#crispText(cx, 124, 'Map:', FONT_SMALL_WHITE).setOrigin(0.5, 0);
      this.#configBlockObjects.push(mapLabel);

      // Map preview cards (3-up). Cards are 96x64 to preserve the source
      // thumbnail aspect ratio (PNGs are 96x64 at the asset).
      // Center y at 158 → cards span y=126 to y=190.
      MAP_POOL.forEach((entry, i) => {
        const cardX = cx + (i - (MAP_POOL.length - 1) / 2) * (96 + 8);
        const cardY = 158;
        const isSelected = entry.id === cfg.mapId;
        const border = this.add.rectangle(cardX, cardY, 96, 64).setStrokeStyle(
          isSelected ? 2 : 1,
          isSelected ? 0xffdd55 : 0x444444,
        );
        const bg = this.add.rectangle(cardX, cardY, 96, 64, 0x111111).setInteractive();
        const thumb = this.textures.exists(entry.thumbnailKey)
          ? this.add.image(cardX, cardY, entry.thumbnailKey)
          : this.add.rectangle(cardX, cardY, 96, 64, 0x223366);
        const cardLabel = this.#crispText(cardX, cardY + 36, entry.displayName, FONT_SMALL_WHITE).setOrigin(0.5, 0);
        bg.on('pointerover', () => bg.setFillStyle(0x222222));
        bg.on('pointerout', () => bg.setFillStyle(0x111111));
        bg.on('pointerdown', () => {
          NetworkManager.getInstance().sendLobbySetConfig({ mapId: entry.id });
        });
        this.#configBlockObjects.push(border, bg, thumb, cardLabel);
      });
    } else {
      // Non-host: read-only labels mirroring the host control positions.
      const fmtLabel = this.#crispText(cx, 104, `Format: ${cfg.format}`, FONT_SMALL_WHITE).setOrigin(0.5, 0.5);
      const mapReadLabel = this.#crispText(cx, 124, `Map: ${mapDisplay}`, FONT_SMALL_WHITE).setOrigin(0.5, 0);
      this.#configBlockObjects.push(fmtLabel, mapReadLabel);

      // Still render the cards (read-only — no pointer handlers, dimmer overlay
      // on non-selected cards) so non-hosts get the same visual map preview.
      MAP_POOL.forEach((entry, i) => {
        const cardX = cx + (i - (MAP_POOL.length - 1) / 2) * (96 + 8);
        const cardY = 158;
        const isSelected = entry.id === cfg.mapId;
        const border = this.add.rectangle(cardX, cardY, 96, 64).setStrokeStyle(
          isSelected ? 2 : 1,
          isSelected ? 0xffdd55 : 0x333333,
        );
        const bg = this.add.rectangle(cardX, cardY, 96, 64, 0x111111);
        const thumb = this.textures.exists(entry.thumbnailKey)
          ? this.add.image(cardX, cardY, entry.thumbnailKey)
          : this.add.rectangle(cardX, cardY, 96, 64, 0x223366);
        if (!isSelected) thumb.setAlpha(0.45);
        const cardLabel = this.#crispText(cardX, cardY + 36, entry.displayName, FONT_SMALL_WHITE)
          .setOrigin(0.5, 0)
          .setAlpha(isSelected ? 1 : 0.5);
        this.#configBlockObjects.push(border, bg, thumb, cardLabel);
      });
    }
  }

  #onLobbyError = (data: { message: string }): void => {
    if (!this.#statusText) return;
    this.#statusText.setText(data.message).setTint(0xff4444);
    this.time.delayedCall(3000, () => {
      this.#statusText?.setText('').setTint(0xffffff);
    });
  };

  #onWaitingRoomUpdate = (data: { lobby?: Lobby }): void => {
    if (data.lobby) {
      this.#currentLobby = data.lobby;
      this.#renderPlayerList(data.lobby.players);
      // Tear-down-and-rebuild the config block on every lobby:updated.
      // N is small (1 select + ≤10 cards) so the cost is negligible, and rebuild
      // guarantees the gold border tracks the authoritative server selection.
      // The DOM <select>.value is set to cfg.format on rebuild so an in-flight
      // host edit converges to the server's accepted value (which is the value
      // the host just sent, so no visible flicker).
      this.#renderConfigBlock(data.lobby);
    }
  };

  #onHostChanged = (data: { newHostPlayerId: string }): void => {
    if (this.#currentLobby) {
      this.#currentLobby = { ...this.#currentLobby, hostPlayerId: data.newHostPlayerId };
      this.#showWaitingRoomView(this.#currentLobby);
    }
  };

  #onLobbyStarted = (data: { matchConfig: MatchConfig }): void => {
    // 1. Unbind EVENT_BUS listeners first (existing behavior).
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
    EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, this.#onLobbyError, this);
    this.#currentLobby = null;

    // 2. EAGER teardown of host-only DOM <select> and configBlock Phaser
    //    objects BEFORE scene.start. Without this, Phaser's DOMElement
    //    (#formatSelectDom) sits in the browser's DOM tree across the
    //    LobbyScene->LoadingScene transition and forces a layout reflow
    //    that the host (only — non-host never created the DOM) experiences
    //    as a ~1s black-screen stall. SHUTDOWN cleanup runs ~1 frame too
    //    late for the host. The SHUTDOWN handler at lines 36-46 still
    //    invokes #clearView() but is now idempotent against this eager
    //    call (Phaser GameObject.destroy is a no-op on already-destroyed
    //    objects; the array assignments to [] make a second pass cheap).
    this.#clearView();

    // 3. Phase 9.2: 400ms fade-to-black + parallel menu-music duck to 0,
    //    then hard-stop the track and start LoadingScene. Per-client (D-08) —
    //    no server protocol event; LoadingScene's MIN_DISPLAY_MS floor
    //    absorbs cross-client jitter. The eager #clearView() above runs
    //    synchronously FIRST so the host's DOM-detach unsticks the
    //    black-screen stall before this overlay polish begins.
    // 400ms — chosen so the menu duck fits inside one perceived UI beat;
    // both calls use the literal so the value is greppable from a single spot.
    this.cameras.main.fadeOut(400, 0, 0, 0);
    MusicManager.instance.tweenMenuVolume(this, 0, 400);

    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      // D-09: hard stop (not crossfade) — gameplay music starts later inside
      // LoadingScene with a computed delay so the drop hits at COUNTDOWN-end.
      MusicManager.instance.stopMenu();
      this.scene.stop(SCENE_KEYS.LOBBY_SCENE);
      this.scene.start(SCENE_KEYS.LOADING_SCENE, { matchConfig: data.matchConfig });
    });
  };

  #playerListObjects: Phaser.GameObjects.GameObject[] = [];
  // Scrollable viewport for the player list — used when player count exceeds the
  // visible row capacity. The container holds every row at its natural Y position;
  // we adjust container.y to scroll, and a geometry mask clips children to the viewport.
  #playerListContainer: Phaser.GameObjects.Container | null = null;
  #playerListMaskGfx: Phaser.GameObjects.Graphics | null = null;
  #playerListScrollY = 0;
  #playerListMaxScroll = 0;
  #playerListWheelHandler: ((pointer: Phaser.Input.Pointer, gameObjects: unknown[], deltaX: number, deltaY: number) => void) | null = null;
  static readonly #ROW_HEIGHT = 22;          // tighter than the old 36 to fit more rows in viewport
  static readonly #PLAYER_LIST_TOP = 214;    // viewport top (below map-card name row at y=194+8)
  static readonly #PLAYER_LIST_BOTTOM = 288; // viewport bottom (above Start button at y=304)

  #renderPlayerList(players: PlayerInfo[]): void {
    // Tear down prior render so re-render on lobby:updated is clean.
    this.#playerListObjects.forEach((o) => o.destroy());
    this.#playerListObjects = [];
    if (this.#playerListContainer) {
      this.#playerListContainer.destroy(true);
      this.#playerListContainer = null;
    }
    if (this.#playerListMaskGfx) {
      this.#playerListMaskGfx.destroy();
      this.#playerListMaskGfx = null;
    }
    if (this.#playerListWheelHandler) {
      this.input.off('wheel', this.#playerListWheelHandler);
      this.#playerListWheelHandler = null;
    }
    this.#playerListScrollY = 0;

    const cx = this.cameras.main.centerX;
    const TINTS = [0xffffff, 0x00aaff, 0xff4444, 0x44ff44, 0xff44ff];
    const viewportTop = LobbyScene.#PLAYER_LIST_TOP;
    const viewportBottom = LobbyScene.#PLAYER_LIST_BOTTOM;
    const viewportHeight = viewportBottom - viewportTop;
    const rowH = LobbyScene.#ROW_HEIGHT;

    // Container at the viewport's natural origin; rows are placed at local y = i * rowH
    // so container.y acts as the scroll offset.
    this.#playerListContainer = this.add.container(0, viewportTop);
    this.#playerListObjects.push(this.#playerListContainer);

    players.forEach((player, i) => {
      const rowY = i * rowH;
      const tint = TINTS[i % TINTS.length];

      // Zebra-stripe row background — improves scanability when many players are present.
      const rowBg = this.add.rectangle(cx, rowY + 8, this.cameras.main.width - 32, rowH - 4,
        i % 2 === 0 ? 0x111a2e : 0x0c1626, 0.55).setOrigin(0.5);
      const dot = this.add.rectangle(cx - 150, rowY + 8, 8, 8, tint);
      const name = this.#crispText(cx - 130, rowY, player.name, FONT_SMALL_WHITE);
      this.#playerListContainer!.add([rowBg, dot, name]);

      if (player.id === this.#currentLobby?.hostPlayerId) {
        // HOST badge — placed right after the max name width (12 chars * 8px from cx-130).
        // Gold-tinted so it's visually distinct from team labels and won't be mistaken
        // for a clickable control. Fixed position avoids collision with team buttons.
        const role = this.#crispText(cx - 30, rowY, 'HOST', { size: 8, tint: 0xffdd55 });
        this.#playerListContainer!.add(role);
      }

      if (this.#isHost) {
        // Host sees clickable Team A / Team B toggle buttons per row.
        // Buttons are smaller (28px wide) so a HOST badge + A + B fit without overlap.
        const isTeamA = player.team === 0;
        const isTeamB = player.team === 1;
        const nm = NetworkManager.getInstance();

        const btnA = this.#createCompactButton(cx + 90, rowY + 8, 'A', () => {
          nm.sendLobbyAssignTeam(player.id, 0);
        });
        const btnB = this.#createCompactButton(cx + 124, rowY + 8, 'B', () => {
          nm.sendLobbyAssignTeam(player.id, 1);
        });

        const bgA = (btnA as Phaser.GameObjects.Container).getAt(0) as Phaser.GameObjects.Rectangle;
        const bgB = (btnB as Phaser.GameObjects.Container).getAt(0) as Phaser.GameObjects.Rectangle;
        if (isTeamA) {
          bgA.setFillStyle(0x0066dd);
          bgB.setFillStyle(BTN_DISABLED);
        } else if (isTeamB) {
          bgA.setFillStyle(BTN_DISABLED);
          bgB.setFillStyle(0xcc2200);
        }

        this.#playerListContainer!.add([btnA, btnB]);
      } else {
        const teamLabel = player.team === 0 ? 'TEAM A' : player.team === 1 ? 'TEAM B' : 'NO TEAM';
        const teamColor = player.team === 0 ? 0x44aaff : player.team === 1 ? 0xff5533 : 0xaaaaaa;
        const badge = this.#crispText(cx + 80, rowY, teamLabel, { ...FONT_SMALL, tint: teamColor });
        this.#playerListContainer!.add(badge);
      }
    });

    // Compute the total content height and the max scroll allowed.
    const contentHeight = players.length * rowH;
    this.#playerListMaxScroll = Math.max(0, contentHeight - viewportHeight);

    // Geometry mask that clips the container to the viewport rectangle. The mask gfx
    // is drawn at screen coords (it's NOT added to the container — Phaser uses it as a
    // stencil only). Hidden via setVisible(false) so the mask shape itself doesn't render.
    this.#playerListMaskGfx = this.add.graphics();
    this.#playerListMaskGfx.fillStyle(0xffffff, 1);
    this.#playerListMaskGfx.fillRect(0, viewportTop, this.cameras.main.width, viewportHeight);
    this.#playerListMaskGfx.setVisible(false);
    this.#playerListContainer.setMask(this.#playerListMaskGfx.createGeometryMask());

    // Wire mousewheel scrolling — only enable if content actually overflows.
    if (this.#playerListMaxScroll > 0) {
      this.#playerListWheelHandler = (_p, _gos, _dx, deltaY) => {
        // Snap scroll by one row at a time to keep rows aligned with the viewport.
        const dir = deltaY > 0 ? 1 : -1;
        this.#setPlayerListScroll(this.#playerListScrollY + dir * rowH);
      };
      this.input.on('wheel', this.#playerListWheelHandler);

      // Visual hint: a small scrollbar at the right edge of the viewport.
      this.#drawPlayerListScrollbar(viewportTop, viewportHeight, contentHeight);
    }
  }

  #setPlayerListScroll(targetY: number): void {
    if (!this.#playerListContainer) return;
    const clamped = Phaser.Math.Clamp(targetY, 0, this.#playerListMaxScroll);
    this.#playerListScrollY = clamped;
    this.#playerListContainer.y = LobbyScene.#PLAYER_LIST_TOP - clamped;
  }

  #drawPlayerListScrollbar(top: number, viewportH: number, contentH: number): void {
    const cw = this.cameras.main.width;
    const trackX = cw - 8;
    const trackW = 3;
    // Track
    const track = this.add.rectangle(trackX, top, trackW, viewportH, 0x222222).setOrigin(0, 0);
    // Thumb height proportional to viewport / content ratio
    const thumbH = Math.max(8, Math.round(viewportH * (viewportH / contentH)));
    const thumb = this.add.rectangle(trackX, top, trackW, thumbH, 0xffdd55).setOrigin(0, 0);
    this.#playerListObjects.push(track, thumb);
    // Reposition thumb whenever scroll changes — quick hack: tween thumb on a 60Hz follow
    // since #setPlayerListScroll is called sparsely. Use Phaser's update event.
    const updateThumb = () => {
      if (!thumb.active) return;
      const ratio = this.#playerListMaxScroll === 0
        ? 0
        : this.#playerListScrollY / this.#playerListMaxScroll;
      thumb.y = top + ratio * (viewportH - thumbH);
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, updateThumb);
    // Cleanup: when this scrollbar is destroyed (next #renderPlayerList run), stop the update.
    track.once('destroy', () => this.events.off(Phaser.Scenes.Events.UPDATE, updateThumb));
  }

  // BitmapText draws each glyph as a sprite from the pre-rasterized atlas
  // loaded in preload(). No runtime canvas2d AA, so glyphs stay sharp under
  // the 480x320 → viewport nearest-neighbor upscale. Tint replaces the CSS
  // color from the old Text-based styling.
  #crispText(x: number, y: number, text: string, style: BMStyle): Phaser.GameObjects.BitmapText {
    return this.add.bitmapText(x, y, BMFONT_KEY, text, style.size).setTint(style.tint);
  }

  #createButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, label.length * 10 + 24, 28, BTN_COLOR).setInteractive();
    const text = this.#crispText(0, 0, label, FONT_SMALL_WHITE).setOrigin(0.5);
    const container = this.add.container(x, y, [bg, text]);

    bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
    bg.on('pointerout', () => bg.setFillStyle(BTN_COLOR));
    bg.on('pointerdown', onClick);

    return container;
  }

  // Compact 28×16 button used for per-row team toggles (Team A / Team B) in the
  // player list. Smaller than #createButton so a HOST badge + A + B fit in one
  // row without overlapping the player name area.
  #createCompactButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add.rectangle(0, 0, 28, 16, BTN_COLOR).setInteractive();
    const text = this.#crispText(0, 0, label, FONT_SMALL_WHITE).setOrigin(0.5);
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
    this.#configBlockObjects.forEach((o) => o.destroy());
    this.#viewObjects = [];
    this.#lobbyListContainer = [];
    this.#waitingRoomObjects = [];
    this.#playerListObjects = [];
    this.#configBlockObjects = [];
    this.#formatSelectDom = null;
    this.#capacityHeader = null;
  }
}
