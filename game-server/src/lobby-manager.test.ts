import { describe, it, expect, beforeEach } from 'vitest';
import { LobbyManager } from './lobby-manager.js';

describe('LobbyManager', () => {
  let manager: LobbyManager;

  beforeEach(() => {
    manager = new LobbyManager();
  });

  describe('createLobby', () => {
    it('returns a Lobby with id, hostPlayerId, one player, null mode, and waiting status', () => {
      const lobby = manager.createLobby('socket-1', 'Alice');
      expect(lobby.id).toBeTruthy();
      expect(lobby.hostPlayerId).toBeTruthy();
      expect(lobby.players).toHaveLength(1);
      expect(lobby.players[0].name).toBe('Alice');
      expect(lobby.players[0].socketId).toBe('socket-1');
      expect(lobby.mode).toBeNull();
      expect(lobby.status).toBe('waiting');
    });
  });

  describe('listLobbies', () => {
    it('returns only waiting lobbies', () => {
      manager.createLobby('s1', 'Alice');
      manager.createLobby('s2', 'Bob');
      const list = manager.listLobbies();
      expect(list).toHaveLength(2);
      list.forEach(l => expect(l.status).toBe('waiting'));
    });

    it('does not return in-progress lobbies', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.startLobby('s1');
      const list = manager.listLobbies();
      expect(list.find(l => l.id === lobby.id)).toBeUndefined();
    });
  });

  describe('joinLobby', () => {
    it('adds the joining player and returns updated lobby', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      const updated = manager.joinLobby(lobby.id, 's2', 'Bob');
      expect(updated.players).toHaveLength(2);
      expect(updated.players.find(p => p.name === 'Bob')).toBeTruthy();
    });

    it('throws Error when lobby does not exist', () => {
      expect(() => manager.joinLobby('nonexistent-id', 's2', 'Bob')).toThrow('Lobby not found');
    });
  });

  describe('leaveLobby', () => {
    it('removes the player and returns the updated lobby', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.joinLobby(lobby.id, 's2', 'Bob');
      const updated = manager.leaveLobby('s2');
      expect(updated?.players).toHaveLength(1);
      expect(updated?.players[0].name).toBe('Alice');
    });

    it('assigns a new host when the host leaves', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.joinLobby(lobby.id, 's2', 'Bob');
      const bobId = lobby.players.find(p => p.socketId === 's2')!.id;
      manager.leaveLobby('s1');
      // Bob should now be host
      expect(lobby.hostPlayerId).toBe(bobId);
    });

    it('deletes the lobby when last player leaves', () => {
      manager.createLobby('s1', 'Alice');
      const result = manager.leaveLobby('s1');
      expect(result).toBeNull();
      expect(manager.listLobbies()).toHaveLength(0);
    });

    it('returns null when socket was not in any lobby', () => {
      const result = manager.leaveLobby('unknown-socket');
      expect(result).toBeNull();
    });
  });

  describe('setMode', () => {
    it('sets mode when called by host', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      const updated = manager.setMode('s1', 'team-deathmatch');
      expect(updated?.mode).toBe('team-deathmatch');
    });

    it('returns null when called by non-host', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.joinLobby(lobby.id, 's2', 'Bob');
      const result = manager.setMode('s2', 'team-deathmatch');
      expect(result).toBeNull();
    });
  });

  describe('startLobby', () => {
    it('sets lobby status to in-progress when called by host', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      const started = manager.startLobby('s1');
      expect(started?.status).toBe('in-progress');
    });

    it('returns null when called by non-host', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.joinLobby(lobby.id, 's2', 'Bob');
      const result = manager.startLobby('s2');
      expect(result).toBeNull();
    });
  });

  describe('host migration', () => {
    it('reassigns host to next player when host leaves', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.joinLobby(lobby.id, 's2', 'Bob');
      const bobId = lobby.players.find(p => p.name === 'Bob')!.id;

      const updatedLobby = manager.leaveLobby('s1');
      expect(updatedLobby).not.toBeNull();
      expect(updatedLobby!.hostPlayerId).toBe(bobId);
    });

    it('does not change host when non-host leaves', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.joinLobby(lobby.id, 's2', 'Bob');
      const hostBefore = lobby.hostPlayerId;

      const updatedLobby = manager.leaveLobby('s2');
      expect(updatedLobby).not.toBeNull();
      expect(updatedLobby!.hostPlayerId).toBe(hostBefore);
    });

    it('returns null when last player leaves (lobby destroyed)', () => {
      manager.createLobby('s1', 'Alice');
      const result = manager.leaveLobby('s1');
      expect(result).toBeNull();
    });
  });

  describe('setPlayerTeam', () => {
    it('allows host to assign team to a player', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.joinLobby(lobby.id, 's2', 'Bob');
      const bob = lobby.players.find(p => p.socketId === 's2')!;
      const result = manager.setPlayerTeam('s1', bob.id, 1);
      expect(result).not.toBeNull();
      expect(bob.team).toBe(1);
    });

    it('rejects team assignment from non-host', () => {
      const lobby = manager.createLobby('s1', 'Alice');
      manager.joinLobby(lobby.id, 's2', 'Bob');
      const alice = lobby.players.find(p => p.socketId === 's1')!;
      const result = manager.setPlayerTeam('s2', alice.id, 0);
      expect(result).toBeNull();
      expect(alice.team).toBeUndefined();
    });
  });
});
