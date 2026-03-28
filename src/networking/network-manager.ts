import { io, Socket } from 'socket.io-client';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus.js';
import { NETWORK_SERVER_URL, NETWORK_SERVER_PORT, NETWORK_TICK_RATE_HZ } from '../common/config.js';
import type {
  PlayerUpdatePayload,
  PlayerUpdateBroadcast,
  SpellCastBroadcast,
  RoomTransitionPayload,
  PlayerDisconnectedPayload,
  Lobby,
  MatchConfig,
} from './types.js';

export class NetworkManager {
  static #instance: NetworkManager | undefined;

  #socket: Socket;
  #localPlayerId: string = '';
  #tickInterval: ReturnType<typeof setInterval> | null = null;
  #isConnected: boolean = false;

  private constructor(serverUrl: string) {
    this.#socket = io(serverUrl, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    this.#bindServerEvents();
  }

  static init(serverUrl?: string): NetworkManager {
    if (NetworkManager.#instance) return NetworkManager.#instance;
    const url = serverUrl ?? `${NETWORK_SERVER_URL}:${NETWORK_SERVER_PORT}`;
    NetworkManager.#instance = new NetworkManager(url);
    return NetworkManager.#instance;
  }

  static getInstance(): NetworkManager {
    if (!NetworkManager.#instance) {
      throw new Error('NetworkManager not initialized. Call NetworkManager.init() first.');
    }
    return NetworkManager.#instance;
  }

  /** FOR TESTING ONLY — reset singleton between tests */
  static _resetInstance(): void {
    NetworkManager.#instance?.disconnect();
    NetworkManager.#instance = undefined;
  }

  get localPlayerId(): string {
    return this.#localPlayerId;
  }

  get isConnected(): boolean {
    return this.#isConnected;
  }

  connect(): void {
    this.#socket.connect();
  }

  disconnect(): void {
    this.stopGameTick();
    this.#socket.disconnect();
  }

  // --- Lobby emit methods ---
  sendLobbyCreate(playerName: string): void {
    this.#socket.emit('lobby:create', { playerName });
  }

  sendLobbyList(): void {
    this.#socket.emit('lobby:list');
  }

  sendLobbyJoin(lobbyId: string, playerName: string): void {
    this.#socket.emit('lobby:join', { lobbyId, playerName });
  }

  sendLobbyLeave(): void {
    this.#socket.emit('lobby:leave');
  }

  sendLobbySetMode(gameMode: string): void {
    this.#socket.emit('lobby:set-mode', { gameMode });
  }

  sendLobbyStart(): void {
    this.#socket.emit('lobby:start');
  }

  // --- Game emit methods ---
  sendPlayerUpdate(payload: PlayerUpdatePayload): void {
    this.#socket.emit('game:player-update', payload);
  }

  sendSpellCast(payload: { spellId: string; element: string; x: number; y: number; direction: string }): void {
    this.#socket.emit('game:spell-cast', payload);
  }

  sendRoomTransitionRequest(payload: RoomTransitionPayload): void {
    this.#socket.emit('game:room-transition-request', payload);
  }

  /**
   * Starts the 20 Hz outbound tick. The `snapshotGetter` callback is called
   * each tick to retrieve the local player's current state.
   */
  startGameTick(snapshotGetter: () => PlayerUpdatePayload | null): void {
    if (this.#tickInterval) return;
    const intervalMs = Math.round(1000 / NETWORK_TICK_RATE_HZ);
    this.#tickInterval = setInterval(() => {
      const payload = snapshotGetter();
      if (payload) this.sendPlayerUpdate(payload);
    }, intervalMs);
  }

  stopGameTick(): void {
    if (this.#tickInterval) {
      clearInterval(this.#tickInterval);
      this.#tickInterval = null;
    }
  }

  // --- Inbound event binding ---
  #bindServerEvents(): void {
    this.#socket.on('connect', () => {
      this.#isConnected = true;
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_CONNECTED, { socketId: this.#socket.id });
    });

    this.#socket.on('disconnect', () => {
      this.#isConnected = false;
      this.stopGameTick();
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_DISCONNECTED, {});
    });

    this.#socket.on('lobby:created', ({ lobby }: { lobby: Lobby }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, { lobby });
    });

    this.#socket.on('lobby:list', (data: { lobbies: Lobby[] }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, data);
    });

    this.#socket.on('lobby:updated', ({ lobby }: { lobby: Lobby }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, { lobby });
    });

    this.#socket.on('lobby:started', ({ matchConfig }: { matchConfig: MatchConfig }) => {
      // Find our playerId from matchConfig (by socketId)
      const me = matchConfig.players.find((p) => p.socketId === this.#socket.id);
      if (me) this.#localPlayerId = me.id;
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, { matchConfig });
    });

    this.#socket.on('game:player-update', (payload: PlayerUpdateBroadcast) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE, payload);
    });

    this.#socket.on('game:spell-cast', (payload: SpellCastBroadcast) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_SPELL_CAST, payload);
    });

    this.#socket.on('game:room-transition', (payload: RoomTransitionPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_ROOM_TRANSITION, payload);
    });

    this.#socket.on('game:player-disconnected', (payload: PlayerDisconnectedPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, payload);
    });

    this.#socket.on('game:player-reconnected', (payload: { playerId: string }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_PLAYER_RECONNECTED, payload);
    });
  }
}
