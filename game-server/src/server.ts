import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { LobbyManager } from './lobby-manager.js';
import { GameRoom } from './game-room.js';
import { StarRelay, STAR_SERVER_ID } from './star-relay.js';
import type {
  RoomTransitionPayload,
  MatchState,
  MatchStateChangedPayload,
  MatchLoadedPayload,
  MatchCountdownTickPayload,
  MatchMode,
  LobbyConfig,
  SpellHitPayload,
  DamageConfirmedPayload,
  EliminationPayload,
  RespawnPayload,
  SpellHitEnvironmentPayload,
  SpellDestroyedPayload,
  PosMirrorPayload,
  TeamScorePayload,
  MatchEndedPayload,
  SpawnAssignment,
  MatchSpawnsPayload,
} from './types.js';
import { COUNTDOWN_DURATION_MS, FIGHT_HOLD_MS, PLAYER_MAX_HP } from './types.js';
import type { PickupSpawnedPayload, PickupClaimPayload, PickupCollectedPayload } from './types.js';
import { decode as msgpackDecode } from '@msgpack/msgpack';
import { randomUUID } from 'crypto';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// ── Special-spell pickups (server-authoritative, seeded per match) ────────────────────────────
// FEATURE FLAG: set false to disable pickups entirely (e.g. if anything misbehaves at the booth —
// the rest of the match is unaffected). Can also be toggled via env: PICKUPS_ENABLED=false.
const PICKUPS_ENABLED = process.env.PICKUPS_ENABLED !== 'false';
const PICKUP_SPELLS = ['DARK_BOLT', 'VOID_ORB'] as const;
// Conservative interior box (px) inside the spawnpoint cluster (teamA/teamB span x 96..384, y 96..224)
// so pickups land on walkable floor. The server has no tile-collision data, so this is best-effort —
// do NOT widen it to the full map or pickups will drop inside walls.
const PICKUP_BOX = { minX: 120, maxX: 360, minY: 110, maxY: 210 };
// Spawn times (ms after ACTIVE). First is ≥45s so every client's GameScene is alive (its ~8s loading
// cinematic finished) before the first pickup — sidesteps the late-boot replay problem. ±10s jitter.
const PICKUP_TIMES_MS = [45_000, 105_000, 165_000, 225_000];

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const lobbyManager = new LobbyManager();
const gameRooms = new Map<string, GameRoom>(); // lobbyId → GameRoom
const starRelay = new StarRelay(io); // arch-webrtc-star: server-side WebRTC peer for the star topology

function broadcastMatchState(lobbyId: string, room: GameRoom): void {
  const payload: MatchStateChangedPayload = {
    lobbyId,
    state: room.state,
    serverTs: Date.now(),
  };
  io.to(`lobby:${lobbyId}`).emit('match:state-changed', payload);
}

/**
 * Schedule the 5 countdown-tick broadcasts (5, 4, 3, 2, 1) + the final COUNTDOWN→ACTIVE transition.
 * Phase 14 (D-18 step 6, TDM-05 server half): replaces the old 3 → 2 → 1 → FIGHT sequence with a
 * 5 → 4 → 3 → 2 → 1 cadence for the intro cinematic. The client #onCountdownTick just renders
 * payload.label, so the label change happens here (server-driven).
 *
 * Identity-bound safety: every callback verifies `gameRooms.get(lobbyId) === room` AND
 * `room.state === 'COUNTDOWN'` before emitting, so a destroyed/replaced room cannot leak ticks.
 * (T-08-02 mitigation)
 *
 * Handle storage: every scheduled handle is pushed onto room.pushCountdownHandle so the room
 * itself can cancel them on COUNTDOWN→* transitions or when the room becomes empty. (WR-07)
 */
function startCountdown(lobbyId: string, room: GameRoom): void {
  const TICKS: readonly { atMs: number; remaining: number; label: string }[] = [
    { atMs: 0,    remaining: 5, label: '5' },
    { atMs: 1000, remaining: 4, label: '4' },
    { atMs: 2000, remaining: 3, label: '3' },
    { atMs: 3000, remaining: 2, label: '2' },
    { atMs: 4000, remaining: 1, label: '1' },
  ];

  for (const tick of TICKS) {
    const handle = setTimeout(() => {
      // Identity check: the room must still be the same object we captured AND still in COUNTDOWN.
      if (gameRooms.get(lobbyId) !== room) return;
      if (room.state !== 'COUNTDOWN') return;
      const payload: MatchCountdownTickPayload = {
        lobbyId,
        remaining: tick.remaining,
        label: tick.label,
        serverTs: Date.now(),
      };
      io.to(`lobby:${lobbyId}`).emit('match:countdown-tick', payload);
    }, tick.atMs);
    room.pushCountdownHandle(handle);
  }

  // Final transition: COUNTDOWN → ACTIVE at t+5500 ms (5000 ms of ticks + 500 ms trailing hold).
  const transitionHandle = setTimeout(() => {
    if (gameRooms.get(lobbyId) !== room) return;
    if (room.state !== 'COUNTDOWN') return;
    try {
      room.transitionTo('ACTIVE');
    } catch {
      return;
    }
    // Phase 14 (D-10): farthest-from-enemy spawn assignment at match start, replacing the naive
    // per-index offset. Two passes: register everyone first so #playerInfo is fully populated (the
    // living-enemy team lookups inside pickSpawn need all players present), then resolve each player's
    // spawn via room.pickSpawn(id, mapId) and re-register at that position. Each player also gets an
    // opening invuln window (D-12) so the first moments after the cinematic are protected.
    const lobby = lobbyManager.getLobbyById(lobbyId);
    const spawnAssignments: SpawnAssignment[] = [];
    if (lobby) {
      const maxHp = PLAYER_MAX_HP; // mirror CONFIG.PLAYER_START_MAX_HEALTH (server-authoritative copy)
      const mapId = lobby.config.mapId ?? 'WORLD';
      // Pass 1: register every player so pickSpawn can see all teams/HP/positions.
      lobby.players.forEach((info) => room.registerPlayer(info, 0, 0, maxHp));
      // Pass 2: resolve farthest-from-enemy spawn per player and re-register at that position.
      lobby.players.forEach((info) => {
        const s = room.pickSpawn(info.id, mapId);
        room.registerPlayer(info, s.x, s.y, maxHp);
        room.startInvuln(info.id);   // D-12: opening invuln, consistent with respawn invuln
        spawnAssignments.push({ playerId: info.id, x: s.x, y: s.y });
      });
    }
    broadcastMatchState(lobbyId, room);
    // Phase 14 bugfix (TDM playtest #4): broadcast the match-start spawn assignments so clients
    // place every player at their team spawnpoint instead of the tilemap door ("spawn in the
    // middle"). Emitted AFTER match:state-changed(ACTIVE) so the client's #exitCountdownMode
    // (which unlocks movement) and the spawn snap are both in flight; the client applies the snap
    // on receipt. Empty list (no lobby) is harmless.
    if (spawnAssignments.length > 0) {
      // Phase 14 bugfix (#1/#2): persist the spawns on the room so a client whose GameScene boots
      // AFTER this broadcast (its ~8s LoadingScene cinematic outlasts the 5.5s server countdown,
      // so it never sees this emit) can request a replay via `match:scene-ready`.
      room.setMatchSpawns(spawnAssignments);
      const spawnsPayload: MatchSpawnsPayload = { spawns: spawnAssignments };
      io.to(`lobby:${lobbyId}`).emit('match:spawns', spawnsPayload);
    }
    // Start this match's special-spell pickup spawns (server picks places/times, broadcasts).
    schedulePickups(lobbyId, room);
  }, COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS);
  room.pushCountdownHandle(transitionHandle);
}

/**
 * Schedule this match's special-spell pickups. Server-authoritative: positions, times, and spell
 * types are chosen HERE (once) and broadcast to the whole lobby, so every client renders the same
 * pickup at the same place — there's no client RNG to desync. Each match gets its own random layout
 * (Math.random per spawn). Pickups are collected first-touch-wins (resolved in the pickup:claimed
 * handler). Identity-bound + ACTIVE-gated like the countdown ticks so a destroyed/ended room can't leak.
 */
function schedulePickups(lobbyId: string, room: GameRoom): void {
  if (!PICKUPS_ENABLED) return;
  for (const atMs of PICKUP_TIMES_MS) {
    const jitter = Math.floor((Math.random() * 2 - 1) * 10_000); // ±10s
    const handle = setTimeout(() => {
      if (gameRooms.get(lobbyId) !== room) return;
      if (room.state !== 'ACTIVE') return;
      const spellType = PICKUP_SPELLS[Math.floor(Math.random() * PICKUP_SPELLS.length)];
      const x = Math.round(PICKUP_BOX.minX + Math.random() * (PICKUP_BOX.maxX - PICKUP_BOX.minX));
      const y = Math.round(PICKUP_BOX.minY + Math.random() * (PICKUP_BOX.maxY - PICKUP_BOX.minY));
      const pickupId = randomUUID();
      room.addPendingPickup(pickupId, spellType, x, y);
      const payload: PickupSpawnedPayload = { pickupId, spellType, x, y };
      io.to(`lobby:${lobbyId}`).emit('pickup:spawned', payload);
    }, Math.max(0, atMs + jitter));
    room.pushPickupHandle(handle);
  }
}

io.on('connection', (socket) => {
  console.log(`[SERVER] Client connected: ${socket.id}`);

  // --- Lobby phase ---
  socket.on('lobby:create', ({ playerName }: { playerName: string }) => {
    const lobby = lobbyManager.createLobby(socket.id, playerName);
    socket.join(`lobby:${lobby.id}`);
    socket.emit('lobby:created', { lobby });
    // Notify all clients browsing the lobby list that a new lobby is available
    io.emit('lobby:list-updated', { lobbies: lobbyManager.listLobbies() });
  });

  socket.on('lobby:list', () => {
    socket.emit('lobby:list', { lobbies: lobbyManager.listLobbies() });
  });

  socket.on('lobby:join', ({ lobbyId, playerName }: { lobbyId: string; playerName: string }) => {
    try {
      const lobby = lobbyManager.joinLobby(lobbyId, socket.id, playerName);
      socket.join(`lobby:${lobbyId}`);
      io.to(`lobby:${lobbyId}`).emit('lobby:updated', { lobby });
      // Update player count visible in lobby list for other browsing clients
      io.emit('lobby:list-updated', { lobbies: lobbyManager.listLobbies() });
    } catch (err) {
      socket.emit('lobby:error', { message: (err as Error).message });
    }
  });

  socket.on('lobby:leave', () => {
    // Check if leaver is host before removing
    const lobbyBefore = lobbyManager.getLobbyBySocketId(socket.id);
    const wasHost = lobbyBefore
      ? lobbyBefore.players.find(p => p.socketId === socket.id)?.id === lobbyBefore.hostPlayerId
      : false;

    const lobby = lobbyManager.leaveLobby(socket.id);
    if (lobby) {
      socket.leave(`lobby:${lobby.id}`);
      io.to(`lobby:${lobby.id}`).emit('lobby:updated', { lobby });
      // Broadcast host change if the host left voluntarily
      if (wasHost) {
        io.to(`lobby:${lobby.id}`).emit('host:changed', {
          newHostPlayerId: lobby.hostPlayerId,
        });
      }
    }
    // Lobby may have been removed (empty) or player count changed — update all browsing clients
    io.emit('lobby:list-updated', { lobbies: lobbyManager.listLobbies() });
  });

  socket.on('lobby:set-mode', ({ gameMode }: { gameMode: string }) => {
    const lobby = lobbyManager.setMode(socket.id, gameMode);
    if (lobby) io.to(`lobby:${lobby.id}`).emit('lobby:updated', { lobby });
  });

  socket.on('lobby:assign-team', ({ targetPlayerId, team }: { targetPlayerId: string; team: number }) => {
    const lobby = lobbyManager.setPlayerTeam(socket.id, targetPlayerId, team);
    if (lobby) io.to(`lobby:${lobby.id}`).emit('lobby:updated', { lobby });
  });

  socket.on('lobby:set-config', ({ config }: { config: Partial<LobbyConfig> }) => {
    const result = lobbyManager.setConfig(socket.id, config);
    if (!result.ok) {
      socket.emit('lobby:error', { message: result.reason });
      return;
    }
    io.to(`lobby:${result.lobby.id}`).emit('lobby:updated', { lobby: result.lobby });
    io.emit('lobby:list-updated', { lobbies: lobbyManager.listLobbies() });
  });

  socket.on('lobby:start', () => {
    const lobby = lobbyManager.startLobby(socket.id);
    if (!lobby) return;
    // CR-02 defense-in-depth: never overwrite an existing GameRoom
    if (gameRooms.has(lobby.id)) return;
    const room = new GameRoom();
    lobby.players.forEach((p) => room.addPlayer(p.id, p.socketId));
    // Phase 14 (D-03, runtime-critical): apply the lobby's mode to the room. GameRoom defaults
    // to 'respawn'; without this every `matchMode === 'team-deathmatch'` branch is dead code.
    // The mode is read ONLY from the server-side lobby record (host-gated by startLobby) — never
    // from a client message (T-14-10).
    room.setMatchMode((lobby.mode ?? 'team-deathmatch') as MatchMode);
    // Per-match TDM kill target from lobby config (host-gated). Read ONLY from the server-side lobby
    // record, never from a client message — same trust model as setMatchMode.
    room.setWinTarget(lobby.config.winTarget ?? 30);
    gameRooms.set(lobby.id, room);

    // Transition LOBBY → LOADING and broadcast (LFC-03). Order matters: state must change BEFORE
    // lobby:started fires so any client handler can rely on `match:state-changed` already being in flight.
    room.transitionTo('LOADING');
    broadcastMatchState(lobby.id, room);

    const matchConfig = {
      lobbyId: lobby.id,
      players: lobby.players,
      mode: lobby.mode ?? 'team-deathmatch',
      config: { ...lobby.config },   // snapshot — protect in-flight match from later lobby edits
    };
    io.to(`lobby:${lobby.id}`).emit('lobby:started', { matchConfig });
  });

  socket.on('match:loaded', ({ lobbyId }: MatchLoadedPayload) => {
    const room = gameRooms.get(lobbyId);
    if (!room) return;
    const allLoaded = room.markLoaded(socket.id);
    if (!allLoaded) return;

    // Sync barrier complete (LFC-05): every match member reported loaded → LOADING → COUNTDOWN.
    try {
      room.transitionTo('COUNTDOWN');
    } catch {
      return; // already past LOADING (e.g., everyone reconnected after ENDED) — ignore
    }
    broadcastMatchState(lobbyId, room);

    startCountdown(lobbyId, room);
  });

  // Phase 14 bugfix (#1/#2): a client's GameScene reports it has booted and is listening. Because
  // the LoadingScene cinematic (~8s) outlasts the server countdown (5.5s), the client is typically
  // born AFTER the COUNTDOWN→ACTIVE `match:spawns` broadcast and never saw it. Replay the stored
  // match-start spawns to JUST this socket so it can snap players to their team spawnpoints. If the
  // spawns aren't computed yet (a rare fast-loader that booted before ACTIVE), do nothing — the
  // ACTIVE broadcast will reach this now-listening client normally.
  socket.on('match:scene-ready', () => {
    const lobbyId = findLobbyIdBySocket(socket.id);
    if (!lobbyId) return;
    const room = gameRooms.get(lobbyId);
    if (!room) return;
    const spawns = room.getMatchSpawns();
    if (spawns.length === 0) return;
    socket.emit('match:spawns', { spawns } satisfies MatchSpawnsPayload);
  });

  // --- Game phase (WebRTC handles player-update and spell-cast P2P; only room transitions use server) ---
  socket.on('game:room-transition-request', (payload: RoomTransitionPayload) => {
    const room = findRoomBySocket(socket.id);
    if (!room || room.transitionLock) return;
    room.transitionLock = true;
    const lobbyId = findLobbyIdBySocket(socket.id);
    if (lobbyId) io.to(`lobby:${lobbyId}`).emit('game:room-transition', payload);
    // Release lock after short delay
    setTimeout(() => {
      if (room) room.transitionLock = false;
    }, 2000);
  });

  // WebRTC signaling relay — server just forwards these between peers
  socket.on('webrtc:offer', ({ targetSocketId, offer }: { targetSocketId: string; offer: { sdp: string; type: string } }) => {
    // Star topology: an offer addressed to the reserved server id is consumed by the StarRelay
    // (the server itself answers as a WebRTC peer) instead of being forwarded to another client.
    if (targetSocketId === STAR_SERVER_ID) {
      const lobbyId = findLobbyIdBySocket(socket.id);
      if (lobbyId) starRelay.handleOffer(socket, lobbyId, offer);
      return;
    }
    io.to(targetSocketId).emit('webrtc:offer', { fromSocketId: socket.id, offer });
  });

  socket.on('webrtc:answer', ({ targetSocketId, answer }: { targetSocketId: string; answer: object }) => {
    // (No server branch: in the star the SERVER answers; clients never send answers to the server.)
    io.to(targetSocketId).emit('webrtc:answer', { fromSocketId: socket.id, answer });
  });

  socket.on('webrtc:ice', ({ targetSocketId, candidate }: { targetSocketId: string; candidate: { candidate: string; sdpMid?: string | null } }) => {
    if (targetSocketId === STAR_SERVER_ID) {
      starRelay.handleIce(socket.id, candidate);
      return;
    }
    io.to(targetSocketId).emit('webrtc:ice', { fromSocketId: socket.id, candidate });
  });

  // --- MessagePack position relay (stress-test & future server-relay path) ---
  // Accepts a binary MessagePack-encoded PlayerUpdatePayload, relays raw bytes to all
  // other players in the same lobby room, and acks with server timestamp for RTT measurement.
  socket.on('game:player-update-mp', (data: Buffer, ack?: (serverTs: number) => void) => {
    const lobbyId = findLobbyIdBySocket(socket.id);
    if (!lobbyId) { if (typeof ack === 'function') ack(Date.now()); return; }

    // Validate the payload is parseable MessagePack (drops malformed frames silently)
    try { msgpackDecode(data); } catch { return; }

    socket.to(`lobby:${lobbyId}`).emit('game:player-update-mp', data, socket.id);
    if (typeof ack === 'function') ack(Date.now());
  });

  // --- Phase 9.3: host-authoritative damage pipeline (D-01..D-04) ---

  /** 20 Hz client → server position mirror. Feeds GameRoom plausibility cache (RESEARCH.md §2). */
  socket.on('game:pos-mirror', ({ x, y }: PosMirrorPayload) => {
    const lobbyId = findLobbyIdBySocket(socket.id);
    if (!lobbyId) return;
    const room = gameRooms.get(lobbyId);
    if (!room) return;
    const playerId = room.getPlayerIdBySocketId(socket.id);
    if (!playerId) return;
    room.recordPosition(playerId, x, y);
  });

  /** Client claims a hit on a remote player (D-01). Server dedupes by spellId, validates
   *  via plausibility cache + FF check, applies capped damage, broadcasts damage:confirmed.
   *  On HP-zero, broadcasts EliminationPayload and schedules RespawnPayload after RESPAWN_DELAY_MS (D-08). */
  socket.on('spell:hit', (claim: SpellHitPayload) => {
    const lobbyId = findLobbyIdBySocket(socket.id);
    if (!lobbyId) return;
    const room = gameRooms.get(lobbyId);
    if (!room || room.state !== 'ACTIVE') return;

    // Dedupe: N clients can each emit the same overlap.
    if (!room.tryConsumeHit(claim.spellId)) return;

    // Validate (range + freshness + FF). Bad/late claims are silently dropped per D-02.
    if (!room.validateHit(
      { targetId: claim.targetId, hitX: claim.hitX, hitY: claim.hitY, casterId: claim.casterId },
      Date.now(),
    )) {
      return;
    }

    const result = room.applyDamage(claim.targetId, claim.damage);
    const confirmed: DamageConfirmedPayload = {
      spellId: claim.spellId,
      targetId: claim.targetId,
      amount: result.cappedAmount,
      spellType: claim.spellType,
      hitX: claim.hitX,
      hitY: claim.hitY,
      targetHp: result.newHp,        // Phase 14 bugfix: authoritative HP after the hit
      maxHp: room.getMaxHp(),
    };
    io.to(`lobby:${lobbyId}`).emit('damage:confirmed', confirmed);

    if (result.eliminated) {
      const elim: EliminationPayload = { playerId: claim.targetId, eliminatedAt: Date.now() };
      io.to(`lobby:${lobbyId}`).emit('elimination', elim);

      room.scheduleRespawn(claim.targetId, () => {
        // Phase 14 (D-10): pick a FRESH farthest-from-enemy spawn each respawn (not the original
        // single spawn point) and start the respawn invuln window (D-12/D-14) before broadcasting.
        const mapId = lobbyManager.getLobbyById(lobbyId)?.config.mapId ?? 'WORLD';
        const spawn = room.pickSpawn(claim.targetId, mapId);
        room.startInvuln(claim.targetId);
        const payload: RespawnPayload = { playerId: claim.targetId, x: spawn.x, y: spawn.y };
        io.to(`lobby:${lobbyId}`).emit('respawn', payload);
      });

      // Phase 14 (D-04, D-05, D-07): team-deathmatch scoring + win-check. LIVE because the
      // lobby:start handler set the room mode via setMatchMode. Server-authoritative:
      // attribution reads the caster's team from #playerInfo, never from the client (T-14-01).
      if (room.matchMode === 'team-deathmatch') {
        room.recordDeath(claim.targetId);
        if (!room.isSameTeam(claim.casterId, claim.targetId)) {
          room.addTeamKill(claim.casterId);   // FF already short-circuited in validateHit; guard anyway (D-05)
        }
        const scores = room.getTeamScores();
        const lastScoringTeam = room.getTeam(claim.casterId) ?? 0;
        const scorePayload: TeamScorePayload = { teamScores: scores, lastScoringTeam };
        io.to(`lobby:${lobbyId}`).emit('match:team-score', scorePayload);

        const winTarget = room.winTarget;   // per-match target from lobby config (default 30)
        if (scores[0] >= winTarget || scores[1] >= winTarget) {
          // Snapshot stats/MVP BEFORE transitioning — transitionTo('ENDED') calls
          // clearCombatState() which wipes #kills/#deaths/#playerInfo (D-07 data loss otherwise).
          const winningTeam = scores[0] >= winTarget ? 0 : 1;
          const endedPayload: MatchEndedPayload = {
            winningTeam,
            teamScores: scores,
            mvpPlayerId: room.getMvpPlayerId(),
            stats: room.getMatchStats(),
          };
          try {
            room.transitionTo('ENDED');   // ACTIVE -> ENDED is a valid FSM transition
          } catch {
            return;
          }
          io.to(`lobby:${lobbyId}`).emit('match:ended', endedPayload);
        }
      }
    }
  });

  /** Client claims a spell hit a wall / environment object (D-04 wall desync fix).
   *  Server dedupes by spellId then broadcasts SpellDestroyed so every client removes the projectile. */
  socket.on('spell:hit-environment', (claim: SpellHitEnvironmentPayload) => {
    const lobbyId = findLobbyIdBySocket(socket.id);
    if (!lobbyId) return;
    const room = gameRooms.get(lobbyId);
    if (!room || room.state !== 'ACTIVE') return;
    if (!room.tryConsumeHit(claim.spellId)) return;
    const out: SpellDestroyedPayload = { spellId: claim.spellId, hitX: claim.hitX, hitY: claim.hitY };
    io.to(`lobby:${lobbyId}`).emit('spell:destroyed', out);
  });

  /** A client claims its local player touched a pickup. First-claim-wins (resolved by socket
   *  identity, never a client-supplied playerId). The winning claim broadcasts pickup:collected so
   *  the sprite disappears for everyone; losing/duplicate claims are silently dropped. */
  socket.on('pickup:claimed', ({ pickupId }: PickupClaimPayload) => {
    const lobbyId = findLobbyIdBySocket(socket.id);
    if (!lobbyId) return;
    const room = gameRooms.get(lobbyId);
    if (!room || room.state !== 'ACTIVE') return;
    const playerId = room.getPlayerIdBySocketId(socket.id);  // anti-spoof: derive from socket
    if (!playerId) return;
    if (!room.tryClaimPickup(pickupId, playerId)) return;     // first-claim-wins; dupes dropped
    const out: PickupCollectedPayload = { pickupId, playerId };
    io.to(`lobby:${lobbyId}`).emit('pickup:collected', out);
  });

  // Late-boot replay: a client whose GameScene booted after an early pickup spawned (its loading
  // cinematic outlasts the countdown) requests un-collected pickups via match:scene-ready. We piggy-
  // back the existing scene-ready hook isn't possible here (different handler), so emit on a dedicated
  // request. The first pickup is ≥45s in, so this is belt-and-suspenders.
  socket.on('pickup:request-active', () => {
    const lobbyId = findLobbyIdBySocket(socket.id);
    if (!lobbyId) return;
    const room = gameRooms.get(lobbyId);
    if (!room || room.state !== 'ACTIVE') return;
    for (const p of room.getActivePickups()) {
      socket.emit('pickup:spawned', p satisfies PickupSpawnedPayload);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SERVER] Client disconnected: ${socket.id}`);
    starRelay.removePeer(socket.id); // tear down this client's server-side WebRTC peer (star topology)
    const lobbyId = findLobbyIdBySocket(socket.id);
    const room = gameRooms.get(lobbyId ?? '');

    // Check if this player was the host BEFORE removing them
    const lobbyBeforeLeave = lobbyId ? lobbyManager.getLobbyBySocketId(socket.id) : undefined;
    const wasHost = lobbyBeforeLeave
      ? lobbyBeforeLeave.players.find(p => p.socketId === socket.id)?.id === lobbyBeforeLeave.hostPlayerId
      : false;

    if (room) {
      // Phase 8: removePlayer also calls clearCountdownTimers() when the room becomes empty (WR-07 fix).
      const playerId = room.removePlayer(socket.id);
      // note: removePlayer also drops any pending match:loaded ack for this socket (handled inside GameRoom)
      if (playerId && lobbyId) {
        io.to(`lobby:${lobbyId}`).emit('game:player-disconnected', { playerId });
      }
    }

    const lobbyAfterLeave = lobbyManager.leaveLobby(socket.id);

    // If the host left and lobby still exists, broadcast new host to all remaining players (FND-02)
    if (wasHost && lobbyAfterLeave && lobbyAfterLeave.players.length > 0) {
      io.to(`lobby:${lobbyAfterLeave.id}`).emit('host:changed', {
        newHostPlayerId: lobbyAfterLeave.hostPlayerId,
      });
    }

    // Update lobby list for browsing clients
    if (lobbyId) {
      io.emit('lobby:list-updated', { lobbies: lobbyManager.listLobbies() });
    }
  });
});

function findRoomBySocket(socketId: string): GameRoom | undefined {
  // Find the lobby this socket belongs to, then get the room
  const lobby = lobbyManager.getLobbyBySocketId(socketId);
  if (!lobby) return undefined;
  return gameRooms.get(lobby.id);
}

function findLobbyIdBySocket(socketId: string): string | undefined {
  const lobby = lobbyManager.getLobbyBySocketId(socketId);
  return lobby?.id;
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
});