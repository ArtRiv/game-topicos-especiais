import { io, Socket } from 'socket.io-client';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus.js';
import {
  NETWORK_SERVER_URL,
  NETWORK_SERVER_PORT,
  NETWORK_TICK_RATE_HZ,
  NETWORK_DEBUG,
  MAX_UNRELIABLE_BUFFERED_BYTES,
} from '../common/config';
import { RUNTIME_CONFIG } from '../common/runtime-config';
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
  BeamStartPayload,
  BeamStartBroadcast,
  BeamUpdatePayload,
  BeamUpdateBroadcast,
  BeamEndPayload,
  BeamEndBroadcast,
  Lobby,
  LobbyConfig,
  MatchConfig,
  MatchStateChangedPayload,
  MatchCountdownTickPayload,
  MatchLoadedPayload,
  PlayerInfo,
  SpellHitPayload,
  SpellHitEnvironmentPayload,
  PosMirrorPayload,
  DamageConfirmedPayload,
  EliminationPayload,
  RespawnPayload,
  SpellDestroyedPayload,
  TeamScorePayload,
  MatchEndedPayload,
  MatchSpawnsPayload,
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
  | ({ type: 'earth-wall-pillar-destroy' } & EarthWallPillarDestroyPayload)
  | ({ type: 'beam-start' } & BeamStartPayload)
  | ({ type: 'beam-update' } & BeamUpdatePayload)
  | ({ type: 'beam-end' } & BeamEndPayload);

/** Plain-object snapshot of NetworkManager state for debugging (browser console + repro scripts). */
export type NetworkManagerSnapshot = {
  localPlayerId: string;
  socketId: string;
  isConnected: boolean;
  matchPlayers: { id: string; name: string; socketId: string; team: number | undefined }[];
  peerConnections: { peerSocketId: string; iceState: string; signalingState: string }[];
  unreliableChannels: { peerSocketId: string; readyState: string; bufferedAmount: number }[];
  reliableChannels: { peerSocketId: string; readyState: string; bufferedAmount: number }[];
  socketToPlayerId: { socketId: string; playerId: string }[];
  pendingIceBuffer: { peerSocketId: string; count: number }[];
  meshHealth: {
    expectedPeers: number;
    pcCount: number;
    unreliableOpen: number;
    reliableOpen: number;
    healthy: boolean;
  };
  // Position sends skipped because the peer's unreliable channel had bufferedAmount
  // above the safety threshold (see MAX_UNRELIABLE_BUFFERED_BYTES). Should remain 0
  // on a healthy LAN; nonzero indicates backpressure on at least one peer.
  droppedDueToBuffer: number;
  /** Currently active outbound tick rate in Hz (last value passed to startGameTick/restartGameTick). */
  currentTickRateHz: number;
};

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
  #matchMode: string | null = null;   // Phase 14: mode from the active MatchConfig (e.g. 'team-deathmatch')
  #socketToPlayerId = new Map<string, string>();

  // Buffer for ICE candidates that arrive before their PC is created (3p race fix).
  // Prior bug: candidates were silently dropped → partial mesh, "ghost player".
  #pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();

  #tickInterval: ReturnType<typeof setInterval> | null = null;
  #lastSentSnapshot: PlayerUpdatePayload | null = null;
  // Latest snapshot getter — held so restartGameTick() can re-establish the interval
  // with the new rate without the caller having to re-supply the getter.
  #snapshotGetter: (() => PlayerUpdatePayload | null) | null = null;
  // Hz currently in effect (read from RUNTIME_CONFIG on each (re)start of the tick).
  #currentTickRateHz = NETWORK_TICK_RATE_HZ;
  // Count of position-send skips caused by the bufferedAmount safety guard.
  // Should remain 0 on a healthy LAN; nonzero = at least one peer is congested.
  #droppedDueToBuffer = 0;

  // Mesh-health timer — fires once N seconds after lobby:started to assert all
  // expected channels opened. Flags partial-mesh state on EVENT_BUS so UI/tests can see it.
  #meshHealthTimer: ReturnType<typeof setTimeout> | null = null;
  static #MESH_HEALTH_CHECK_DELAY_MS = 8000;

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
    // Dev-only: expose to window for browser-console diagnostics + Playwright/manual repro.
    if (typeof window !== 'undefined' && NETWORK_DEBUG) {
      (window as unknown as { __NM__: NetworkManager }).__NM__ = NetworkManager.#instance;
    }
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

  /**
   * FOR TESTING ONLY — creates a non-singleton instance. Used by multi-peer
   * mesh tests that need to instantiate N NetworkManagers in one process.
   * Production code MUST use `init()` / `getInstance()` instead.
   */
  static _createForTest(serverUrl: string): NetworkManager {
    return new NetworkManager(serverUrl);
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

  /** Phase 14: the active match mode from MatchConfig (null until lobby:started).
   *  Server defaults an unset lobby mode to 'team-deathmatch' (server.ts:198/209). */
  get matchMode(): string | null {
    return this.#matchMode;
  }

  /** Phase 14: true when the current match is team-deathmatch — gates the server-authoritative
   *  death/respawn flow so the local HP-zero does NOT route to the legacy single-player GAME_OVER. */
  get isTeamDeathmatch(): boolean {
    return this.#matchMode === 'team-deathmatch';
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
   * MUST be called by scenes that own a match (GameScene shutdown) to avoid
   * stale PCs leaking across rematches.
   */
  teardownMesh(): void {
    this.stopGameTick();
    this.#closeAllPeerConnections();
    this.#lastSentSnapshot = null;
    this.#matchPlayers = [];
    this.#matchMode = null;
    this.#snapshotGetter = null;
    this.#droppedDueToBuffer = 0;
    if (this.#meshHealthTimer) {
      clearTimeout(this.#meshHealthTimer);
      this.#meshHealthTimer = null;
    }
    this.#pendingIceCandidates.clear();
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
  sendLobbySetConfig(partial: Partial<LobbyConfig>): void { this.#socket.emit('lobby:set-config', { config: partial }); }

  /** Client ack for the LOADING sync barrier (LFC-05). Sent exactly once when the local LoadingScene finishes preparation. */
  sendMatchLoaded(lobbyId: string): void {
    this.#socket.emit('match:loaded', { lobbyId } satisfies MatchLoadedPayload);
  }

  // --- Phase 9.3: host-authoritative damage senders (socket.io, NOT WebRTC) ---

  /** Mirror local player position to the server at 20 Hz so the validator has data for plausibility checks. */
  sendPosMirror(payload: PosMirrorPayload): void {
    this.#socket.emit('game:pos-mirror', payload);
  }

  /** Claim that a locally-cast spell hit a remote player. Host validates → may broadcast damage:confirmed. */
  sendSpellHit(payload: SpellHitPayload): void {
    this.#socket.emit('spell:hit', payload);
  }

  /** Claim that a locally-cast spell hit a wall/environment. Host broadcasts spell:destroyed to all peers (D-04). */
  sendSpellHitEnvironment(payload: SpellHitEnvironmentPayload): void {
    this.#socket.emit('spell:hit-environment', payload);
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

  sendBeamStart(payload: BeamStartPayload): void {
    this.#broadcastReliable({ type: 'beam-start', ...payload });
  }

  sendBeamUpdate(payload: BeamUpdatePayload): void {
    this.#broadcastUnreliable({ type: 'beam-update', ...payload });
  }

  sendBeamEnd(payload: BeamEndPayload): void {
    this.#broadcastReliable({ type: 'beam-end', ...payload });
  }

  sendRoomTransitionRequest(payload: RoomTransitionPayload): void {
    // Broadcast to peers then fire locally — no server echo in WebRTC mode
    this.#broadcastReliable({ type: 'transition', ...payload });
    EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_ROOM_TRANSITION, payload);
  }

  /**
   * Starts the outbound position tick. Rate is read from RUNTIME_CONFIG.NETWORK_TICK_RATE_HZ
   * on each (re)start, so the debug panel can mutate it live and trigger restartGameTick()
   * to apply the new rate without a page reload.
   *
   * snapshotGetter is called each tick to get the local player's current state.
   * The getter is cached on the instance so restartGameTick() can re-establish the
   * interval without the caller having to re-supply it.
   */
  startGameTick(snapshotGetter: () => PlayerUpdatePayload | null): void {
    this.#snapshotGetter = snapshotGetter;
    if (this.#tickInterval) return;
    this.#startTickInterval();
  }

  /**
   * Apply a new outbound tick rate without reloading. Stops the current interval and
   * starts a fresh one reading RUNTIME_CONFIG.NETWORK_TICK_RATE_HZ. Safe to call before
   * startGameTick() — becomes a no-op if no snapshot getter has been registered yet.
   */
  restartGameTick(): void {
    if (this.#tickInterval) {
      clearInterval(this.#tickInterval);
      this.#tickInterval = null;
    }
    if (this.#snapshotGetter) {
      this.#startTickInterval();
    }
  }

  #startTickInterval(): void {
    // Clamp runtime value defensively — UI sliders can pass anything.
    const rawHz = RUNTIME_CONFIG.NETWORK_TICK_RATE_HZ;
    const hz = Math.max(10, Math.min(120, Math.round(rawHz)));
    this.#currentTickRateHz = hz;
    const intervalMs = Math.round(1000 / hz);
    const getter = this.#snapshotGetter;
    if (!getter) return;
    this.#tickInterval = setInterval(() => {
      const payload = getter();
      if (payload) {
        this.sendPlayerUpdate(payload);
        // Phase 9.3: server-bound position mirror for plausibility cache (RESEARCH.md §2).
        // Rides socket.io (reliable, server-authoritative) — independent of the P2P WebRTC pos broadcast.
        this.sendPosMirror({ x: payload.x, y: payload.y });
      }
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

  /**
   * Browser-console + repro-script diagnostics. Returns a plain-object snapshot
   * of all live mesh state. Safe to call any time. Use `nm.debugSnapshot()` in
   * DevTools to verify all expected channels are open at match start.
   */
  debugSnapshot(): NetworkManagerSnapshot {
    const mySocketId = this.#socket.id ?? '';
    const expectedPeers = this.#matchPlayers.filter((p) => p.socketId !== mySocketId).length;
    const unreliableOpen = [...this.#unreliableChannels.values()].filter((c) => c.readyState === 'open').length;
    const reliableOpen = [...this.#reliableChannels.values()].filter((c) => c.readyState === 'open').length;

    return {
      localPlayerId: this.#localPlayerId,
      socketId: mySocketId,
      isConnected: this.#isConnected,
      matchPlayers: this.#matchPlayers.map((p) => ({ id: p.id, name: p.name, socketId: p.socketId, team: p.team })),
      peerConnections: [...this.#peerConnections.entries()].map(([peerSocketId, pc]) => ({
        peerSocketId,
        iceState: pc.iceConnectionState,
        signalingState: pc.signalingState,
      })),
      unreliableChannels: [...this.#unreliableChannels.entries()].map(([peerSocketId, ch]) => ({
        peerSocketId,
        readyState: ch.readyState,
        bufferedAmount: ch.bufferedAmount,
      })),
      reliableChannels: [...this.#reliableChannels.entries()].map(([peerSocketId, ch]) => ({
        peerSocketId,
        readyState: ch.readyState,
        bufferedAmount: ch.bufferedAmount,
      })),
      socketToPlayerId: [...this.#socketToPlayerId.entries()].map(([socketId, playerId]) => ({ socketId, playerId })),
      pendingIceBuffer: [...this.#pendingIceCandidates.entries()].map(([peerSocketId, list]) => ({ peerSocketId, count: list.length })),
      meshHealth: {
        expectedPeers,
        pcCount: this.#peerConnections.size,
        unreliableOpen,
        reliableOpen,
        healthy: expectedPeers > 0
          && this.#peerConnections.size === expectedPeers
          && unreliableOpen === expectedPeers
          && reliableOpen === expectedPeers,
      },
      droppedDueToBuffer: this.#droppedDueToBuffer,
      currentTickRateHz: this.#currentTickRateHz,
    };
  }

  // ---- Socket.io event binding (lobby + WebRTC signaling only) ----

  #log(...parts: unknown[]): void {
    if (!NETWORK_DEBUG) return;
    const shortId = this.#localPlayerId ? this.#localPlayerId.slice(0, 4) : (this.#socket.id ?? '????').slice(0, 4);
    // Single-line format with ms-epoch timestamp for cross-window log diffing.
    // NOTE: use console.log (not .debug) — Chrome DevTools hides debug level by default
    // unless the user enables "Verbose" in the Levels filter, which is not obvious.
    console.log(`${Date.now()} [NM:${shortId}]`, ...parts);
  }

  #bindSocketEvents(): void {
    this.#socket.on('connect', () => {
      this.#isConnected = true;
      this.#log('connected', `socket=${this.#socket.id}`);
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_CONNECTED, { socketId: this.#socket.id });
    });

    this.#socket.on('disconnect', () => {
      this.#isConnected = false;
      this.#log('disconnected');
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

    this.#socket.on('lobby:error', (data: { message: string }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, data);
    });

    this.#socket.on('lobby:started', ({ matchConfig }: { matchConfig: MatchConfig }) => {
      const me = matchConfig.players.find((p) => p.socketId === this.#socket.id);
      if (me) this.#localPlayerId = me.id;
      this.#matchPlayers = matchConfig.players;
      this.#matchMode = matchConfig.mode ?? null;   // Phase 14: remember the mode for TDM gating
      this.#socketToPlayerId.clear();
      for (const p of matchConfig.players) {
        this.#socketToPlayerId.set(p.socketId, p.id);
      }
      this.#log(
        'lobby-started',
        `localPlayerId=${me?.id ?? '?'}`,
        `peers=${matchConfig.players.map((p) => `${p.name}(${p.socketId.slice(0, 4)})`).join(',')}`,
      );
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, { matchConfig });
      this.#initWebRTCMesh(matchConfig.players);
      this.#scheduleMeshHealthCheck();
    });

    // Match FSM transitions (LFC-02). The LoadingScene listens for COUNTDOWN/ACTIVE
    // to gate its scene-switch to PreloadScene -> GameScene.
    this.#socket.on('match:state-changed', (payload: MatchStateChangedPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, payload);
    });

    // Server-driven countdown ticks (LFC-08). GameScene renders the overlay from these;
    // the client MUST NOT run its own countdown clock — the server is authoritative.
    this.#socket.on('match:countdown-tick', (payload: MatchCountdownTickPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_MATCH_COUNTDOWN_TICK, payload);
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
        this.#pendingIceCandidates.delete(player.socketId);
        this.#socketToPlayerId.delete(player.socketId);
        // Mutate the roster so meshHealth.expectedPeers reflects the new match size.
        // Without this, healthy=false fires forever after the first disconnect because
        // expectedPeers stays at the original N-1 while peerConnections.size drops.
        this.#matchPlayers = this.#matchPlayers.filter((p) => p.id !== playerId);
      }
      this.#log('peer-disconnected', `id=${playerId}`, `peers-remaining=${this.#peerConnections.size}`);
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, { playerId } as PlayerDisconnectedPayload);
    });

    // Host migration — server reassigned host after a disconnect
    this.#socket.on('host:changed', ({ newHostPlayerId }: { newHostPlayerId: string }) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, { newHostPlayerId });
    });

    // --- Phase 9.3: host-authoritative damage inbound broadcasts (D-01..D-04) ---
    this.#socket.on('damage:confirmed', (payload: DamageConfirmedPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_DAMAGE_CONFIRMED, payload);
    });
    this.#socket.on('elimination', (payload: EliminationPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_ELIMINATION, payload);
    });
    this.#socket.on('respawn', (payload: RespawnPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_RESPAWN, payload);
    });
    this.#socket.on('spell:destroyed', (payload: SpellDestroyedPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_SPELL_DESTROYED, payload);
    });
    // Phase 14 — team-deathmatch broadcasts. HUD_REVEAL is intentionally NOT bridged here
    // (it is an in-process GameScene -> UiScene event, not a socket event).
    this.#socket.on('match:team-score', (payload: TeamScorePayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_TEAM_SCORE, payload);
    });
    this.#socket.on('match:ended', (payload: MatchEndedPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_MATCH_ENDED, payload);
    });
    // Phase 14 bugfix (TDM playtest #4): match-start team spawn assignments.
    this.#socket.on('match:spawns', (payload: MatchSpawnsPayload) => {
      EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_MATCH_SPAWNS, payload);
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
      const role = myIndex < peerIndex ? 'offerer' : 'answerer';
      this.#log('mesh-init', `peer=${peer.name}(${peer.socketId.slice(0, 4)})`, `role=${role}`);
      // Lower-index player creates the offer — prevents simultaneous double-offers.
      // The other side just waits for the offer to arrive on `webrtc:offer`.
      if (role === 'offerer') {
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
      this.#log('ice-state', `peer=${peerSocketId.slice(0, 4)}`, `state=${state}`);
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        const player = this.#matchPlayers.find((p) => p.socketId === peerSocketId);
        this.#unreliableChannels.delete(peerSocketId);
        this.#reliableChannels.delete(peerSocketId);
        this.#peerConnections.delete(peerSocketId);
        this.#pendingIceCandidates.delete(peerSocketId);
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
    this.#log('offer-sent', `to=${peerSocketId.slice(0, 4)}`);
  }

  async #handleOffer(fromSocketId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.#createPeerConnection(fromSocketId);
    // Answer side receives channels via ondatachannel
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      this.#setupDataChannel(ch, fromSocketId, ch.label === 'pos' ? 'unreliable' : 'reliable');
    };

    await pc.setRemoteDescription(offer);
    // Drain any ICE candidates that arrived before the offer (3p race fix).
    await this.#drainPendingIce(fromSocketId, pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.#socket.emit('webrtc:answer', { targetSocketId: fromSocketId, answer });
    this.#log('answer-sent', `to=${fromSocketId.slice(0, 4)}`);
  }

  async #handleAnswer(fromSocketId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.#peerConnections.get(fromSocketId);
    if (!pc) {
      this.#log('answer-dropped (no pc)', `from=${fromSocketId.slice(0, 4)}`);
      return;
    }
    await pc.setRemoteDescription(answer);
    // Even on the offerer side, ICE candidates can land before the remote answer.
    // Drain any that were buffered while we were waiting for setRemoteDescription.
    await this.#drainPendingIce(fromSocketId, pc);
  }

  async #handleIceCandidate(fromSocketId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.#peerConnections.get(fromSocketId);
    if (pc && pc.remoteDescription) {
      // Safe to add immediately — remote SDP is set.
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        if (NETWORK_DEBUG) console.warn('[NET] addIceCandidate failed:', err);
      }
      return;
    }
    // Race fix: PC missing OR remote SDP not yet set. Buffer for #drainPendingIce.
    // Prior bug (1v1 hid this): a silent `if (pc)` drop here orphaned ~1 candidate per
    // 3p mesh start, leaving one connection in 'checking' forever.
    let buffer = this.#pendingIceCandidates.get(fromSocketId);
    if (!buffer) {
      buffer = [];
      this.#pendingIceCandidates.set(fromSocketId, buffer);
    }
    buffer.push(candidate);
    this.#log('ice-buffered', `from=${fromSocketId.slice(0, 4)}`, `bufSize=${buffer.length}`);
  }

  async #drainPendingIce(fromSocketId: string, pc: RTCPeerConnection): Promise<void> {
    const buffer = this.#pendingIceCandidates.get(fromSocketId);
    if (!buffer || buffer.length === 0) return;
    this.#log('ice-drain', `from=${fromSocketId.slice(0, 4)}`, `count=${buffer.length}`);
    this.#pendingIceCandidates.delete(fromSocketId);
    for (const c of buffer) {
      try {
        await pc.addIceCandidate(c);
      } catch (err) {
        if (NETWORK_DEBUG) console.warn('[NET] drainPendingIce addIceCandidate failed:', err);
      }
    }
  }

  #setupDataChannel(ch: RTCDataChannel, fromSocketId: string, kind: 'unreliable' | 'reliable'): void {
    if (kind === 'unreliable') {
      this.#unreliableChannels.set(fromSocketId, ch);
    } else {
      this.#reliableChannels.set(fromSocketId, ch);
    }

    // Prior bug: only the answerer's `ondatachannel`-supplied channels had an
    // implicit open event consumed by the runtime — the offerer's `createDataChannel`
    // channels never had `onopen` wired, so we never knew when they were actually
    // ready, and never re-broadcast a fresh snapshot to the late-opening peer.
    ch.onopen = () => {
      this.#log('channel-open', `peer=${fromSocketId.slice(0, 4)}`, `label=${ch.label}`);
      // Force a fresh position snapshot to the newly-opened channel — fixes the
      // Cause #4 "stationary player invisible" bug where #lastSentSnapshot diff-skip
      // suppresses sends after the first packet, leaving late-opening channels stuck.
      this.#lastSentSnapshot = null;
    };

    ch.onclose = () => {
      this.#log('channel-close', `peer=${fromSocketId.slice(0, 4)}`, `label=${ch.label}`);
    };

    ch.onerror = (e) => {
      if (NETWORK_DEBUG) console.warn(`[NM] channel error peer=${fromSocketId.slice(0, 4)} label=${ch.label}`, e);
    };

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
        case 'beam-start':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_BEAM_START, { ...msg, playerId } as BeamStartBroadcast);
          break;
        case 'beam-update':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_BEAM_UPDATE, { ...msg, playerId } as BeamUpdateBroadcast);
          break;
        case 'beam-end':
          EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_BEAM_END, { ...msg, playerId } as BeamEndBroadcast);
          break;
      }
    };
  }

  #broadcastUnreliable(data: object): void {
    const msg = JSON.stringify(data);
    for (const ch of this.#unreliableChannels.values()) {
      if (ch.readyState !== 'open') continue;
      // Backpressure guard: if the underlying SCTP send buffer is over the safety
      // threshold for THIS peer, skip the position send for this tick. Real Chrome
      // refuses send() once bufferedAmount exceeds ~16 MB; this guard fires far
      // earlier so the mesh degrades to "stale position for one peer" rather than
      // "all sends throw". Only applies to the unreliable position channel —
      // spell/event sends on the reliable channel must NOT be dropped silently.
      if (ch.bufferedAmount > MAX_UNRELIABLE_BUFFERED_BYTES) {
        this.#droppedDueToBuffer++;
        continue;
      }
      ch.send(msg);
      this.#msgSentCount++;
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

  /**
   * Schedules a one-shot post-`lobby:started` health check. If, after
   * #MESH_HEALTH_CHECK_DELAY_MS, any expected peer is missing a peer connection
   * or an open data channel, emit a warning to the EVENT_BUS so the UI can
   * surface it instead of silently presenting a phantom-peer game.
   */
  #scheduleMeshHealthCheck(): void {
    if (this.#meshHealthTimer) clearTimeout(this.#meshHealthTimer);
    this.#meshHealthTimer = setTimeout(() => {
      const snap = this.debugSnapshot();
      this.#log('mesh-health-check', JSON.stringify(snap.meshHealth));
      if (!snap.meshHealth.healthy && snap.meshHealth.expectedPeers > 0) {
        const reasons: string[] = [];
        if (snap.peerConnections.length < snap.meshHealth.expectedPeers) {
          reasons.push(`peer-connections=${snap.peerConnections.length}/${snap.meshHealth.expectedPeers}`);
        }
        if (snap.meshHealth.unreliableOpen < snap.meshHealth.expectedPeers) {
          reasons.push(`unreliable=${snap.meshHealth.unreliableOpen}/${snap.meshHealth.expectedPeers}`);
        }
        if (snap.meshHealth.reliableOpen < snap.meshHealth.expectedPeers) {
          reasons.push(`reliable=${snap.meshHealth.reliableOpen}/${snap.meshHealth.expectedPeers}`);
        }
        const msg = `Partial mesh: ${reasons.join(', ')}`;
        console.warn(`[NM] ${msg}`);
        EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_MESH_PARTIAL, { snapshot: snap, reasons });
      }
    }, NetworkManager.#MESH_HEALTH_CHECK_DELAY_MS);
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
    this.#pendingIceCandidates.clear();
    if (this.#metricsInterval) {
      clearInterval(this.#metricsInterval);
      this.#metricsInterval = null;
    }
  }
}
