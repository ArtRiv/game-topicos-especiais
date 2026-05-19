import { io, Socket } from 'socket.io-client';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus.js';
import { NETWORK_SERVER_URL, NETWORK_SERVER_PORT, NETWORK_TICK_RATE_HZ, NETWORK_DEBUG } from '../common/config.js';
import type {
  PlayerUpdatePayload,
  PlayerUpdateBroadcast,
  SpellCastPayload,
  SpellCastBroadcast,
  RoomTransitionPayload,
  PlayerDisconnectedPayload,
  BreathStartPayload,
  BreathStartBroadcast,
  BreathUpdatePayload,
  BreathUpdateBroadcast,
  BreathEndBroadcast,
  EarthWallPillarPayload,
  EarthWallPillarBroadcast,
  EarthWallPillarDestroyPayload,
  EarthWallPillarDestroyBroadcast,
  Lobby,
  MatchConfig,
  MatchStateChangedPayload,
  MatchLoadedPayload,
  PlayerInfo,
} from './types.js';

// Messages exchanged over WebRTC data channels
type DcMessage =
  | ({ type: 'pos' } & PlayerUpdatePayload)
  | ({ type: 'spell' } & SpellCastPayload)
  | ({ type: 'transition' } & RoomTransitionPayload)
  | ({ type: 'breath-start' } & BreathStartPayload)
  | ({ type: 'breath-update' } & BreathUpdatePayload)
  | ({ type: 'breath-end' })
  | ({ type: 'earth-wall-pillar' } & EarthWallPillarPayload)
  | ({ type: 'earth-wall-pillar-destroy' } & EarthWallPillarDestroyPayload);

export class NetworkManager {
  static #instance: NetworkManager | undefined;

  #socket: Socket;
  #localPlayerId = '';
  #isConnected = false;

  // WebRTC mesh — keyed by peer's socketId
  #peerConnections = new Map<string, RTCPeerConnection>();
  #unreliableChannels = new Map<string, RTCDataChannel>(); // pos: ordered=false, maxRetransmits=0 (UDP-like)
  #reliableChannels = new Map<string, RTCDataChannel>();   // events: ordered=true (TCP-like)
  #matchPlayers: PlayerInfo[] = [];
  #socketToPlayerId = new Map<string, string>();

  #tickInterval: ReturnType<typeof setInterval> | null = null;
  #lastSentSnapshot: PlayerUpdatePayload | null = null;

  // Network performance metrics
  #msgSentCount = 0;
  #msgRecvCount = 0;
  #metricsInterval: ReturnType<typeof setInterval> | null = null;

  private constructor(serverUrl: string) {
    this.#socket = io(serverUrl, {
      autoConnect: false,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    this.#bindSocketEvents();
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

  get matchPlayers(): readonly PlayerInfo[] {
    return this.#matchPlayers;
  }

  get socketId(): string {
    return this.#socket.id ?? '';
  }

  connect(): void {
    this.#socket.connect();
  }

  disconnect(): void {
    this.stopGameTick();
    this.#closeAllPeerConnections();
    this.#lastSentSnapshot = null;
    this.#socket.disconnect();
  }

  /**
   * Tears down the WebRTC mesh (all peer connections and data channels) while
   * keeping the socket.io signaling connection alive. Used when returning to
   * lobby after a match -- enables rematch without full reconnect (FND-04).
   */
  teardownMesh(): void {
    this.stopGameTick();
    this.#closeAllPeerConnections();
    this.#lastSentSnapshot = null;
    this.#matchPlayers = [];
    // DO NOT call this.#socket.disconnect() -- keep signaling alive for lobby
  }

  // --- Lobby methods (socket.io — reliable, low-frequency) ---
  sendLobbyCreate(playerName: string): void { this.#socket.emit('lobby:create', { playerName }); }
  sendLobbyList(): void { this.#socket.emit('lobby:list'); }
  sendLobbyJoin(lobbyId: string, playerName: string): void { this.#socket.emit('lobby:join', { lobbyId, playerName }); }
  sendLobbyLeave(): void { this.#socket.emit('lobby:leave'); }
  sendLobbySetMode(gameMode: string): void { this.#socket.emit('lobby:set-mode', { gameMode }); }
  sendLobbyStart(): void { this.#socket.emit('lobby:start'); }
  sendLobbyAssignTeam(targetPlayerId: string, team: number): void { this.#socket.emit('lobby:assign-team', { targetPlayerId, team }); }

  /** Client ack for the LOADING sync barrier (LFC-05). Sent exactly once when the local LoadingScene finishes preparation. */
  sendMatchLoaded(lobbyId: string): void {
    this.#socket.emit('match:loaded', { lobbyId } satisfies MatchLoadedPayload);
  }

  // --- Game methods (WebRTC data channels — low latency, P2P) ---

  /** Sends position snapshot to all peers via unreliable (UDP-like) data channel — skips if unchanged */
  sendPlayerUpdate(payload: PlayerUpdatePayload): void {
    if (
      this.#lastSentSnapshot &&
      this.#lastSentSnapshot.x === payload.x &&
      this.#lastSentSnapshot.y === payload.y &&
      this.#lastSentSnapshot.direction === payload.direction &&
      this.#lastSentSnapshot.state === payload.state &&
      this.#lastSentSnapshot.element === payload.element
    ) {
      return; // nothing changed — skip send
    }
    this.#lastSentSnapshot = { ...payload };
    this.#broadcastUnreliable({ type: 'pos', ...payload });
  }

  sendSpellCast(payload: SpellCastPayload): void {
    this.#broadcastReliable({ type: 'spell', ...payload });
  }

  sendBreathStart(payload: BreathStartPayload): void {
    this.#broadcastReliable({ type: 'breath-start', ...payload });
  }

  sendBreathUpdate(payload: BreathUpdatePayload): void {
    this.#broadcastUnreliable({ type: 'breath-update', ...payload });
  }

  sendBreathEnd(): void {
    this.#broadcastReliable({ type: 'breath-end' });
  }

  sendEarthWallPillar(payload: EarthWallPillarPayload): void {
    this.#broadcastReliable({ type: 'earth-wall-pillar', ...payload });
  }

  sendEarthWallPillarDestroy(payload: EarthWallPillarDestroyPayload): void {
    this.#broadcastReliable({ type: 'earth-wall-pillar-destroy', ...payload });
  }

  sendRoomTransitionRequest(payload: RoomTransitionPayload): void {
    // Broadcast to peers then fire locally — no server echo in WebRTC mode
    this.#broadcastReliable({ type: 'transition', ...payload });
    EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_ROOM_TRANSITION, payload);
  }

  /**
   * Starts the outbound position tick at NETWORK_TICK_RATE_HZ (20 Hz).
   * snapshotGetter is called each tick to get the local player's current state.
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
    this.#lastSentSnapshot = null;
    if (this.#metricsInterval) {
      clearInterval(this.#metricsInterval);
      this.#metricsInterval = null;
    }
  }

  // ---- Socket.io event binding (lobby + WebRTC signaling only) ----

  #bindSocketEvents(): void {
    this.#socket.on('connect', () => {
      this.#isConnected = true;
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_CONNECTED, { socketId: this.#socket.id });
    });

    this.#socket.on('disconnect', () => {
      this.#isConnected = false;
      this.stopGameTick();
      this.#closeAllPeerConnections();
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_DISCONNECTED, {});
    });

    this.#socket.on('lobby:created', ({ lobby }: { lobby: Lobby }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, { lobby });
    });

    this.#socket.on('lobby:list', (data: { lobbies: Lobby[] }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, data);
    });

    // Server pushes an updated list to all connected clients when any lobby changes
    this.#socket.on('lobby:list-updated', (data: { lobbies: Lobby[] }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, data);
    });

    this.#socket.on('lobby:updated', ({ lobby }: { lobby: Lobby }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, { lobby });
    });

    this.#socket.on('lobby:started', ({ matchConfig }: { matchConfig: MatchConfig }) => {
      const me = matchConfig.players.find((p) => p.socketId === this.#socket.id);
      if (me) this.#localPlayerId = me.id;
      this.#matchPlayers = matchConfig.players;
      this.#socketToPlayerId.clear();
      for (const p of matchConfig.players) {
        this.#socketToPlayerId.set(p.socketId, p.id);
      }
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, { matchConfig });
      this.#initWebRTCMesh(matchConfig.players);
    });

    // Match FSM transitions (LFC-02). The LoadingScene listens for COUNTDOWN/ACTIVE
    // to gate its scene-switch to PreloadScene -> GameScene.
    this.#socket.on('match:state-changed', (payload: MatchStateChangedPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, payload);
    });

    // WebRTC signaling — server forwards offer/answer/ice between peers
    this.#socket.on('webrtc:offer', ({ fromSocketId, offer }: { fromSocketId: string; offer: RTCSessionDescriptionInit }) => {
      void this.#handleOffer(fromSocketId, offer);
    });

    this.#socket.on('webrtc:answer', ({ fromSocketId, answer }: { fromSocketId: string; answer: RTCSessionDescriptionInit }) => {
      void this.#handleAnswer(fromSocketId, answer);
    });

    this.#socket.on('webrtc:ice', ({ fromSocketId, candidate }: { fromSocketId: string; candidate: RTCIceCandidateInit }) => {
      void this.#handleIceCandidate(fromSocketId, candidate);
    });

    // Fast disconnect detection — server knows before WebRTC ICE timeout (which can take 30+ s)
    this.#socket.on('game:player-disconnected', ({ playerId }: { playerId: string }) => {
      const player = this.#matchPlayers.find((p) => p.id === playerId);
      if (player) {
        const pc = this.#peerConnections.get(player.socketId);
        if (pc) {
          pc.close();
          this.#peerConnections.delete(player.socketId);
        }
        this.#unreliableChannels.delete(player.socketId);
        this.#reliableChannels.delete(player.socketId);
      }
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, { playerId } as PlayerDisconnectedPayload);
    });

    // Host migration — server reassigned host after a disconnect
    this.#socket.on('host:changed', ({ newHostPlayerId }: { newHostPlayerId: string }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, { newHostPlayerId });
    });
  }

  // ---- WebRTC N-to-N mesh ----

  #initWebRTCMesh(players: PlayerInfo[]): void {
    // RTCPeerConnection is browser-only; guard for Node.js / test environments
    if (typeof RTCPeerConnection === 'undefined') return;

    const mySocketId = this.#socket.id;
    if (!mySocketId) {
      console.error('[NET] Cannot init WebRTC mesh: socket has no ID');
      return;
    }
    const myIndex = players.findIndex((p) => p.socketId === mySocketId);

    players.forEach((peer, peerIndex) => {
      if (peer.socketId === mySocketId) return;
      // Lower-index player creates the offer — prevents simultaneous double-offers
      if (myIndex < peerIndex) {
        void this.#createOffer(peer.socketId);
      }
    });

    this.#startMetricsLog();
  }

  #createPeerConnection(peerSocketId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.#peerConnections.set(peerSocketId, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.#socket.emit('webrtc:ice', { targetSocketId: peerSocketId, candidate: e.candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        const player = this.#matchPlayers.find((p) => p.socketId === peerSocketId);
        this.#unreliableChannels.delete(peerSocketId);
        this.#reliableChannels.delete(peerSocketId);
        this.#peerConnections.delete(peerSocketId);
        EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, {
          playerId: player?.id ?? peerSocketId,
        } as PlayerDisconnectedPayload);
      }
    };

    return pc;
  }

  async #createOffer(peerSocketId: string): Promise<void> {
    const pc = this.#createPeerConnection(peerSocketId);
    // Offer side creates both data channels
    const unreliable = pc.createDataChannel('pos', { ordered: false, maxRetransmits: 0 });
    const reliable = pc.createDataChannel('events', { ordered: true });
    this.#setupDataChannel(unreliable, peerSocketId, 'unreliable');
    this.#setupDataChannel(reliable, peerSocketId, 'reliable');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.#socket.emit('webrtc:offer', { targetSocketId: peerSocketId, offer });
  }

  async #handleOffer(fromSocketId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.#createPeerConnection(fromSocketId);
    // Answer side receives channels via ondatachannel
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      this.#setupDataChannel(ch, fromSocketId, ch.label === 'pos' ? 'unreliable' : 'reliable');
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.#socket.emit('webrtc:answer', { targetSocketId: fromSocketId, answer });
  }

  async #handleAnswer(fromSocketId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.#peerConnections.get(fromSocketId);
    if (pc) await pc.setRemoteDescription(answer);
  }

  async #handleIceCandidate(fromSocketId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.#peerConnections.get(fromSocketId);
    if (pc) await pc.addIceCandidate(candidate);
  }

  #setupDataChannel(ch: RTCDataChannel, fromSocketId: string, kind: 'unreliable' | 'reliable'): void {
    if (kind === 'unreliable') {
      this.#unreliableChannels.set(fromSocketId, ch);
    } else {
      this.#reliableChannels.set(fromSocketId, ch);
    }

    ch.onmessage = (e: MessageEvent<string>) => {
      this.#msgRecvCount++;
      let msg: DcMessage;
      try {
        msg = JSON.parse(e.data) as DcMessage;
      } catch {
        return; // Drop malformed messages silently
      }
      const playerId = this.#socketToPlayerId.get(fromSocketId) ?? fromSocketId;

      switch (msg.type) {
        case 'pos':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE, { ...msg, playerId } as PlayerUpdateBroadcast);
          break;
        case 'spell':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_SPELL_CAST, { ...msg, playerId } as SpellCastBroadcast);
          break;
        case 'transition':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_ROOM_TRANSITION, {
            levelName: msg.levelName,
            roomId: msg.roomId,
            doorId: msg.doorId,
          } as RoomTransitionPayload);
          break;
        case 'breath-start':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_BREATH_START, { ...msg, playerId } as BreathStartBroadcast);
          break;
        case 'breath-update':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_BREATH_UPDATE, { ...msg, playerId } as BreathUpdateBroadcast);
          break;
        case 'breath-end':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_BREATH_END, { playerId } as BreathEndBroadcast);
          break;
        case 'earth-wall-pillar':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_EARTH_WALL_PILLAR, { ...msg, playerId } as EarthWallPillarBroadcast);
          break;
        case 'earth-wall-pillar-destroy':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_EARTH_WALL_PILLAR_DESTROY, { ...msg, playerId } as EarthWallPillarDestroyBroadcast);
          break;
      }
    };
  }

  #broadcastUnreliable(data: object): void {
    const msg = JSON.stringify(data);
    for (const ch of this.#unreliableChannels.values()) {
      if (ch.readyState === 'open') {
        ch.send(msg);
        this.#msgSentCount++;
      }
    }
  }

  #broadcastReliable(data: object): void {
    const msg = JSON.stringify(data);
    for (const ch of this.#reliableChannels.values()) {
      if (ch.readyState === 'open') {
        try {
          ch.send(msg);
          this.#msgSentCount++;
        } catch (err) {
          if (NETWORK_DEBUG) {
            console.warn('[NET] Failed to send reliable message:', err);
          }
        }
      }
    }
  }

  #startMetricsLog(): void {
    if (!NETWORK_DEBUG || this.#metricsInterval) return;
    this.#metricsInterval = setInterval(() => {
      console.log(`[NET] sent: ${this.#msgSentCount} msg/s | recv: ${this.#msgRecvCount} msg/s`);
      this.#msgSentCount = 0;
      this.#msgRecvCount = 0;
    }, 1000);
  }

  #closeAllPeerConnections(): void {
    for (const pc of this.#peerConnections.values()) pc.close();
    this.#peerConnections.clear();
    this.#unreliableChannels.clear();
    this.#reliableChannels.clear();
    this.#socketToPlayerId.clear();
    if (this.#metricsInterval) {
      clearInterval(this.#metricsInterval);
      this.#metricsInterval = null;
    }
  }
}
