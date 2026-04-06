import { describe, it, expect, beforeEach } from 'vitest';
import { GameRoom } from './game-room.js';

describe('GameRoom', () => {
  let room: GameRoom;

  beforeEach(() => {
    room = new GameRoom();
  });

  describe('addPlayer', () => {
    it('adds a player slot', () => {
      room.addPlayer('player-1', 'socket-1');
      expect(room.getPlayerIdBySocketId('socket-1')).toBe('player-1');
    });
  });

  describe('removePlayer', () => {
    it('removes the player slot and returns playerId', () => {
      room.addPlayer('player-1', 'socket-1');
      const removed = room.removePlayer('socket-1');
      expect(removed).toBe('player-1');
      expect(room.getPlayerIdBySocketId('socket-1')).toBeUndefined();
    });

    it('returns undefined when socket is not in room', () => {
      const result = room.removePlayer('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getPlayerIdBySocketId', () => {
    it('returns playerId for known socket', () => {
      room.addPlayer('player-2', 'socket-2');
      expect(room.getPlayerIdBySocketId('socket-2')).toBe('player-2');
    });

    it('returns undefined for unknown socket', () => {
      expect(room.getPlayerIdBySocketId('unknown')).toBeUndefined();
    });
  });

  describe('getOtherSocketIds (broadcastTarget)', () => {
    it('returns all OTHER socket IDs in the room', () => {
      room.addPlayer('player-1', 'socket-1');
      room.addPlayer('player-2', 'socket-2');
      room.addPlayer('player-3', 'socket-3');
      const others = room.getOtherSocketIds('socket-1');
      expect(others).toHaveLength(2);
      expect(others).not.toContain('socket-1');
      expect(others).toContain('socket-2');
      expect(others).toContain('socket-3');
    });

    it('returns empty array when only one player in room', () => {
      room.addPlayer('player-1', 'socket-1');
      expect(room.getOtherSocketIds('socket-1')).toHaveLength(0);
    });
  });
});
