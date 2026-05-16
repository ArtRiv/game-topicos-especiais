import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('GameRoom — countdown timer handles (LFC-08, WR-07)', () => {
  // Helper: drive the FSM from LOBBY to COUNTDOWN with the given socket(s).
  const driveToCountdown = (room: GameRoom, sockets: string[]): void => {
    sockets.forEach((s, i) => room.addPlayer(`p${i + 1}`, s));
    room.transitionTo('LOADING');
    sockets.forEach((s) => room.markLoaded(s));
    room.transitionTo('COUNTDOWN');
  };

  it('pushCountdownHandle stores the handle and clearCountdownTimers cancels it', () => {
    vi.useFakeTimers();
    try {
      const room = new GameRoom();
      const spy = vi.fn();
      const h = setTimeout(spy, 999_999) as unknown as ReturnType<typeof setTimeout>;
      room.pushCountdownHandle(h);
      room.clearCountdownTimers();
      vi.advanceTimersByTime(999_999);
      expect(spy).not.toHaveBeenCalled();
      // Idempotent — calling again is a no-op (no throw, nothing left to cancel).
      expect(() => room.clearCountdownTimers()).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('transitionTo(ACTIVE) from COUNTDOWN clears pending handles', () => {
    vi.useFakeTimers();
    try {
      const room = new GameRoom();
      driveToCountdown(room, ['socket-1']);
      const spy = vi.fn();
      const h = setTimeout(spy, 999_999) as unknown as ReturnType<typeof setTimeout>;
      room.pushCountdownHandle(h);
      room.transitionTo('ACTIVE');
      vi.advanceTimersByTime(999_999);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('transitionTo(ENDED) from COUNTDOWN clears pending handles', () => {
    vi.useFakeTimers();
    try {
      const room = new GameRoom();
      driveToCountdown(room, ['socket-1']);
      const spy = vi.fn();
      const h = setTimeout(spy, 999_999) as unknown as ReturnType<typeof setTimeout>;
      room.pushCountdownHandle(h);
      room.transitionTo('ENDED');
      vi.advanceTimersByTime(999_999);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('removePlayer clears countdown handles when the room becomes empty', () => {
    vi.useFakeTimers();
    try {
      const room = new GameRoom();
      driveToCountdown(room, ['socket-1', 'socket-2']);

      // Handle #1: tested after the FIRST removePlayer (room still has 1 player → live).
      const spyA = vi.fn();
      const hA = setTimeout(spyA, 1000) as unknown as ReturnType<typeof setTimeout>;
      room.pushCountdownHandle(hA);

      // First removal — room.playerCount is now 1, so handles must NOT be cancelled yet.
      room.removePlayer('socket-1');
      vi.advanceTimersByTime(1000);
      expect(spyA).toHaveBeenCalledTimes(1);

      // Handle #2: pushed AFTER first removal; tested after the SECOND removePlayer
      // (room becomes empty → handle cancelled, callback never fires).
      const spyB = vi.fn();
      const hB = setTimeout(spyB, 1000) as unknown as ReturnType<typeof setTimeout>;
      room.pushCountdownHandle(hB);

      // Second removal — room.playerCount goes 1 → 0, clearCountdownTimers MUST fire.
      room.removePlayer('socket-2');
      vi.advanceTimersByTime(1000);
      expect(spyB).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
