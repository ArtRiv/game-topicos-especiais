import { randomUUID } from 'crypto';
import type { Lobby, PlayerInfo, LobbyConfig, LobbyFormat } from './types.js';
import { MAP_POOL } from './types.js';

export class LobbyManager {
  #lobbies: Map<string, Lobby> = new Map();
  // socketId → lobbyId for quick reverse lookup
  #socketToLobby: Map<string, string> = new Map();

  createLobby(socketId: string, playerName: string): Lobby {
    const playerId = randomUUID();
    const lobbyId = randomUUID();
    const player: PlayerInfo = { id: playerId, name: playerName, socketId };
    const lobby: Lobby = {
      id: lobbyId,
      hostPlayerId: playerId,
      players: [player],
      mode: null,
      status: 'waiting',
      config: { format: '3v3', mapId: 'WORLD', maxPlayers: 6 },
    };
    this.#lobbies.set(lobbyId, lobby);
    this.#socketToLobby.set(socketId, lobbyId);
    return lobby;
  }

  listLobbies(): Lobby[] {
    return Array.from(this.#lobbies.values()).filter(l => l.status === 'waiting');
  }

  joinLobby(lobbyId: string, socketId: string, playerName: string): Lobby {
    const lobby = this.#lobbies.get(lobbyId);
    if (!lobby) throw new Error('Lobby not found');
    const playerId = randomUUID();
    const player: PlayerInfo = { id: playerId, name: playerName, socketId };
    lobby.players.push(player);
    this.#socketToLobby.set(socketId, lobbyId);
    return lobby;
  }

  leaveLobby(socketId: string): Lobby | null {
    const lobbyId = this.#socketToLobby.get(socketId);
    if (!lobbyId) return null;
    const lobby = this.#lobbies.get(lobbyId);
    if (!lobby) return null;

    // Remove the player
    const leavingPlayer = lobby.players.find(p => p.socketId === socketId);
    lobby.players = lobby.players.filter(p => p.socketId !== socketId);
    this.#socketToLobby.delete(socketId);

    if (lobby.players.length === 0) {
      this.#lobbies.delete(lobbyId);
      return null;
    }

    // If the host left, assign a new host
    if (leavingPlayer && leavingPlayer.id === lobby.hostPlayerId) {
      lobby.hostPlayerId = lobby.players[0].id;
    }

    return lobby;
  }

  getLobbyBySocketId(socketId: string): Lobby | undefined {
    const lobbyId = this.#socketToLobby.get(socketId);
    if (!lobbyId) return undefined;
    return this.#lobbies.get(lobbyId);
  }

  setMode(socketId: string, mode: string): Lobby | null {
    const lobby = this.getLobbyBySocketId(socketId);
    if (!lobby) return null;
    const player = lobby.players.find(p => p.socketId === socketId);
    if (!player || player.id !== lobby.hostPlayerId) return null;
    lobby.mode = mode;
    return lobby;
  }

  startLobby(socketId: string): Lobby | null {
    const lobby = this.getLobbyBySocketId(socketId);
    if (!lobby) return null;
    // CR-02 fix: reject redundant lobby:start while match is already in progress
    if (lobby.status !== 'waiting') return null;
    const player = lobby.players.find(p => p.socketId === socketId);
    if (!player || player.id !== lobby.hostPlayerId) return null;
    lobby.status = 'in-progress';
    return lobby;
  }

  setPlayerTeam(requesterSocketId: string, targetPlayerId: string, team: number): Lobby | null {
    const lobby = this.getLobbyBySocketId(requesterSocketId);
    if (!lobby) return null;
    const requester = lobby.players.find(p => p.socketId === requesterSocketId);
    if (!requester || requester.id !== lobby.hostPlayerId) return null;  // host-only
    const target = lobby.players.find(p => p.id === targetPlayerId);
    if (!target) return null;
    target.team = team;
    return lobby;
  }

  setConfig(
    socketId: string,
    partial: Partial<LobbyConfig>
  ): { ok: true; lobby: Lobby } | { ok: false; reason: string } {
    const lobby = this.getLobbyBySocketId(socketId);
    if (!lobby) return { ok: false, reason: 'No lobby' };
    if (lobby.status !== 'waiting') return { ok: false, reason: 'Match already in progress' };
    const player = lobby.players.find(p => p.socketId === socketId);
    if (!player || player.id !== lobby.hostPlayerId) {
      return { ok: false, reason: 'Only the host can change lobby settings' };
    }

    // Validate format if provided
    const validFormats: LobbyFormat[] = ['1v1','2v2','3v3','4v4','5v5','6v6','7v7','8v8','9v9','10v10'];
    if (partial.format !== undefined && !validFormats.includes(partial.format)) {
      return { ok: false, reason: 'Invalid format' };
    }

    // Validate mapId if provided
    if (partial.mapId !== undefined && !MAP_POOL.some(m => m.id === partial.mapId)) {
      return { ok: false, reason: 'Invalid map' };
    }

    // Compute new config (partial merge; maxPlayers always derived from format, never trusted from client)
    const nextFormat: LobbyFormat = partial.format ?? lobby.config.format;
    const nextMapId: string = partial.mapId ?? lobby.config.mapId;
    const nextMaxPlayers = this.#maxPlayersForFormat(nextFormat);

    // Capacity downshift guard (D-11) — verbatim copy
    if (lobby.players.length > nextMaxPlayers) {
      return { ok: false, reason: `Reduce players first (${lobby.players.length} > ${nextMaxPlayers} cap)` };
    }

    lobby.config = { format: nextFormat, mapId: nextMapId, maxPlayers: nextMaxPlayers };
    return { ok: true, lobby };
  }

  #maxPlayersForFormat(format: LobbyFormat): number {
    return parseInt(format, 10) * 2;
  }
}
