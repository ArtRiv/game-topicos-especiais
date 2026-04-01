import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { LobbyManager } from './lobby-manager.js';
import { GameRoom } from './game-room.js';
import type { RoomTransitionPayload } from './types.js';
import { decode as msgpackDecode } from '@msgpack/msgpack';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const lobbyManager = new LobbyManager();
const gameRooms = new Map<string, GameRoom>(); // lobbyId → GameRoom

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
    const lobby = lobbyManager.leaveLobby(socket.id);
    if (lobby) {
      socket.leave(`lobby:${lobby.id}`);
      io.to(`lobby:${lobby.id}`).emit('lobby:updated', { lobby });
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
    const room = new GameRoom();
    lobby.players.forEach((p) => room.addPlayer(p.id, p.socketId));
    gameRooms.set(lobby.id, room);
    const matchConfig = { lobbyId: lobby.id, players: lobby.players, mode: lobby.mode ?? 'team-deathmatch' };
    io.to(`lobby:${lobby.id}`).emit('lobby:started', { matchConfig });
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
    if (room) {
      const playerId = room.removePlayer(socket.id);
      if (playerId && lobbyId) {
        io.to(`lobby:${lobbyId}`).emit('game:player-disconnected', { playerId });
      }
    }
    lobbyManager.leaveLobby(socket.id);
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