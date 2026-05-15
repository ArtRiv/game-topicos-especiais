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

describe('GameRoom — match state machine (LFC-01, LFC-05)', () => {
  it('starts in LOBBY', () => {
    const room = new GameRoom();
    expect(room.state).toBe('LOBBY');
  });

  it('allows LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED', () => {
    const room = new GameRoom();
    room.addPlayer('p1', 'socket-1');
    room.transitionTo('LOADING');
    expect(room.state).toBe('LOADING');
    room.markLoaded('socket-1');
    room.transitionTo('COUNTDOWN');
    expect(room.state).toBe('COUNTDOWN');
    room.transitionTo('ACTIVE');
    expect(room.state).toBe('ACTIVE');
    room.transitionTo('ENDED');
    expect(room.state).toBe('ENDED');
  });

  it('throws on invalid transitions', () => {
    const room = new GameRoom();
    expect(() => room.transitionTo('ACTIVE')).toThrow(/Invalid match transition/);
    expect(() => room.transitionTo('COUNTDOWN')).toThrow(/Invalid match transition/);
  });

  it('markLoaded returns false until every player has acked, then true exactly once', () => {
    const room = new GameRoom();
    room.addPlayer('p1', 'socket-1');
    room.addPlayer('p2', 'socket-2');
    room.transitionTo('LOADING');
    expect(room.markLoaded('socket-1')).toBe(false);
    expect(room.loadedCount).toBe(1);
    expect(room.markLoaded('socket-2')).toBe(true);
    expect(room.loadedCount).toBe(2);
    // duplicate ack does NOT re-trigger (Set semantics)
    expect(room.markLoaded('socket-1')).toBe(false);
  });

  it('markLoaded ignores acks from non-members and from non-LOADING states', () => {
    const room = new GameRoom();
    room.addPlayer('p1', 'socket-1');
    expect(room.markLoaded('socket-1')).toBe(false); // still in LOBBY
    expect(room.markLoaded('ghost-socket')).toBe(false);
    room.transitionTo('LOADING');
    expect(room.markLoaded('ghost-socket')).toBe(false);
  });

  it('removing a player drops their pending loaded ack', () => {
    const room = new GameRoom();
    room.addPlayer('p1', 'socket-1');
    room.addPlayer('p2', 'socket-2');
    room.transitionTo('LOADING');
    room.markLoaded('socket-1');
    expect(room.loadedCount).toBe(1);
    room.removePlayer('socket-1');
    expect(room.loadedCount).toBe(0);
    // p2 alone is now the full set
    expect(room.markLoaded('socket-2')).toBe(true);
  });
});
