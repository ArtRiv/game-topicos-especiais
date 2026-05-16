import type { MatchState } from './types.js';

const VALID_NEXT: Record<MatchState, MatchState[]> = {
  LOBBY: ['LOADING'],
  LOADING: ['COUNTDOWN', 'ENDED'],
  COUNTDOWN: ['ACTIVE', 'ENDED'],
  ACTIVE: ['ENDED'],
  ENDED: [],
};

export class GameRoom {
  #players: Map<string, string> = new Map(); // socketId → playerId
  #state: MatchState = 'LOBBY';
  #loadedSocketIds: Set<string> = new Set();
  /** Pending countdown setTimeout handles owned by this room. Cleared on transition out of
   * COUNTDOWN or when the room becomes empty. (WR-07 fix from Phase 07-REVIEW.md.) */
  #countdownHandles: ReturnType<typeof setTimeout>[] = [];
  public transitionLock: boolean = false;

  get state(): MatchState { return this.#state; }

  addPlayer(playerId: string, socketId: string): void {
    this.#players.set(socketId, playerId);
  }

  removePlayer(socketId: string): string | undefined {
    const playerId = this.#players.get(socketId);
    this.#players.delete(socketId);
    this.#loadedSocketIds.delete(socketId);
    if (this.#players.size === 0) this.clearCountdownTimers();
    return playerId;
  }

  getPlayerIdBySocketId(socketId: string): string | undefined {
    return this.#players.get(socketId);
  }

  getOtherSocketIds(socketId: string): string[] {
    return Array.from(this.#players.keys()).filter(id => id !== socketId);
  }

  getAllSocketIds(): string[] {
    return Array.from(this.#players.keys());
  }

  get playerCount(): number {
    return this.#players.size;
  }

  /**
   * Attempt a state transition. Throws if the transition is not in the VALID_NEXT table.
   * Caller (server.ts) is responsible for broadcasting `match:state-changed` after a successful transition.
   */
  transitionTo(next: MatchState): void {
    const allowed = VALID_NEXT[this.#state];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid match transition: ${this.#state} → ${next}`);
    }
    const prev = this.#state;
    this.#state = next;
    if (next !== 'LOADING') {
      this.#loadedSocketIds.clear();
    }
    if (prev === 'COUNTDOWN' && next !== 'COUNTDOWN') this.clearCountdownTimers();
  }

  /**
   * Mark a socket as having reported `match:loaded`. Returns true exactly once per LOADING cycle:
   * the call that completes the set (every player loaded) returns true so the caller can transition.
   * All other calls return false. Invalid-state calls (not LOADING) return false silently.
   *
   * Note: duplicate acks (Set semantics) and acks AFTER the set is already complete both return
   * false. Only the transition from "incomplete set" → "complete set" returns true.
   */
  markLoaded(socketId: string): boolean {
    if (this.#state !== 'LOADING') return false;
    if (!this.#players.has(socketId)) return false;
    const sizeBefore = this.#loadedSocketIds.size;
    this.#loadedSocketIds.add(socketId);
    const sizeAfter = this.#loadedSocketIds.size;
    // Only the call that *completes* the set returns true. Duplicate acks (size unchanged) and
    // acks after the set is already full both return false so the caller transitions exactly once.
    if (sizeAfter === sizeBefore) return false;
    return sizeAfter === this.#players.size;
  }

  /** Append a pending countdown setTimeout handle so the room can cancel it later (WR-07). */
  pushCountdownHandle(h: ReturnType<typeof setTimeout>): void {
    this.#countdownHandles.push(h);
  }

  /** Cancel every pending countdown handle and reset the store. Idempotent. */
  clearCountdownTimers(): void {
    for (const h of this.#countdownHandles) {
      clearTimeout(h);
    }
    this.#countdownHandles = [];
  }

  /** Test/observability accessor — count of acks received in the current LOADING cycle. */
  get loadedCount(): number {
    return this.#loadedSocketIds.size;
  }
}
