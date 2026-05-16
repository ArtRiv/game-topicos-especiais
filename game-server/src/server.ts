import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { LobbyManager } from './lobby-manager.js';
import { GameRoom } from './game-room.js';
import type { RoomTransitionPayload, MatchState, MatchStateChangedPayload, MatchLoadedPayload, MatchCountdownTickPayload } from './types.js';
import { COUNTDOWN_DURATION_MS, FIGHT_HOLD_MS } from './types.js';
import { decode as msgpackDecode } from '@msgpack/msgpack';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const lobbyManager = new LobbyManager();
const gameRooms = new Map<string, GameRoom>(); // lobbyId → GameRoom

function broadcastMatchState(lobbyId: string, room: GameRoom): void {
  const payload: MatchStateChangedPayload = {
    lobbyId,
    state: room.state,
    serverTs: Date.now(),
  };
  io.to(`lobby:${lobbyId}`).emit('match:state-changed', payload);
}

/**
 * Schedule the 4 countdown-tick broadcasts (3, 2, 1, FIGHT) + the final LOADING→ACTIVE transition.
 * Replaces the Phase 7 50ms auto-advance stub. (LFC-08, LFC-09)
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
    { atMs: 0,    remaining: 3, label: '3' },
    { atMs: 1000, remaining: 2, label: '2' },
    { atMs: 2000, remaining: 1, label: '1' },
    { atMs: 3000, remaining: 0, label: 'FIGHT' },
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

  // Final transition: COUNTDOWN → ACTIVE at t+3500 ms (3000 ms of ticks + 500 ms FIGHT hold).
  const transitionHandle = setTimeout(() => {
    if (gameRooms.get(lobbyId) !== room) return;
    if (room.state !== 'COUNTDOWN') return;
    try {
      room.transitionTo('ACTIVE');
    } catch {
      return;
    }
    broadcastMatchState(lobbyId, room);
  }, COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS);
  room.pushCountdownHandle(transitionHandle);
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

  socket.on('lobby:start', () => {
    const lobby = lobbyManager.startLobby(socket.id);
    if (!lobby) return;
    // CR-02 defense-in-depth: never overwrite an existing GameRoom
    if (gameRooms.has(lobby.id)) return;
    const room = new GameRoom();
    lobby.players.forEach((p) => room.addPlayer(p.id, p.socketId));
    gameRooms.set(lobby.id, room);

    // Transition LOBBY → LOADING and broadcast (LFC-03). Order matters: state must change BEFORE
    // lobby:started fires so any client handler can rely on `match:state-changed` already being in flight.
    room.transitionTo('LOADING');
    broadcastMatchState(lobby.id, room);

    const matchConfig = { lobbyId: lobby.id, players: lobby.players, mode: lobby.mode ?? 'team-deathmatch' };
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
  socket.on('webrtc:offer', ({ targetSocketId, offer }: { targetSocketId: string; offer: object }) => {
    io.to(targetSocketId).emit('webrtc:offer', { fromSocketId: socket.id, offer });
  });

  socket.on('webrtc:answer', ({ targetSocketId, answer }: { targetSocketId: string; answer: object }) => {
    io.to(targetSocketId).emit('webrtc:answer', { fromSocketId: socket.id, answer });
  });

  socket.on('webrtc:ice', ({ targetSocketId, candidate }: { targetSocketId: string; candidate: object }) => {
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

  socket.on('disconnect', () => {
    console.log(`[SERVER] Client disconnected: ${socket.id}`);
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