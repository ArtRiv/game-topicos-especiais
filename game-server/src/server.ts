import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import { LobbyManager } from './lobby-manager.js';
import { GameRoom } from './game-room.js';
import type { PlayerUpdatePayload, SpellCastPayload, RoomTransitionPayload } from './types.js';

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
  });

  socket.on('lobby:list', () => {
    socket.emit('lobby:list', { lobbies: lobbyManager.listLobbies() });
  });

  socket.on('lobby:join', ({ lobbyId, playerName }: { lobbyId: string; playerName: string }) => {
    try {
      const lobby = lobbyManager.joinLobby(lobbyId, socket.id, playerName);
      socket.join(`lobby:${lobbyId}`);
      io.to(`lobby:${lobbyId}`).emit('lobby:updated', { lobby });
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
  });

  socket.on('lobby:set-mode', ({ gameMode }: { gameMode: string }) => {
    const lobby = lobbyManager.setMode(socket.id, gameMode);
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

  // --- Game phase ---
  socket.on('game:player-update', (payload: PlayerUpdatePayload) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const playerId = room.getPlayerIdBySocketId(socket.id);
    const others = room.getOtherSocketIds(socket.id);
    others.forEach((sid) => io.to(sid).emit('game:player-update', { ...payload, playerId }));
  });

  socket.on('game:spell-cast', (payload: SpellCastPayload) => {
    const room = findRoomBySocket(socket.id);
    if (!room) return;
    const playerId = room.getPlayerIdBySocketId(socket.id);
    const others = room.getOtherSocketIds(socket.id);
    others.forEach((sid) => io.to(sid).emit('game:spell-cast', { ...payload, playerId }));
  });

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

httpServer.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
});
