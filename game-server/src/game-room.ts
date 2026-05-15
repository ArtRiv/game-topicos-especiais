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
  public transitionLock: boolean = false;

  get state(): MatchState { return this.#state; }

  addPlayer(playerId: string, socketId: string): void {
    this.#players.set(socketId, playerId);
  }

  removePlayer(socketId: string): string | undefined {
    const playerId = this.#players.get(socketId);
    this.#players.delete(socketId);
    this.#loadedSocketIds.delete(socketId);
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
    this.#state = next;
    if (next !== 'LOADING') {
      this.#loadedSocketIds.clear();
    }
  }

  /**
   * Mark a socket as having reported `match:loaded`. Returns true exactly once per LOADING cycle:
   * the call that completes the set (every player loaded) returns true so the caller can transition.
   * All other calls return false. Invalid-state calls (not LOADING) return false silently.
   */
  markLoaded(socketId: string): boolean {
    if (this.#state !== 'LOADING') return false;
    if (!this.#players.has(socketId)) return false;
    this.#loadedSocketIds.add(socketId);
    return this.#loadedSocketIds.size === this.#players.size;
  }

  /** Test/observability accessor — count of acks received in the current LOADING cycle. */
  get loadedCount(): number {
    return this.#loadedSocketIds.size;
  }
}
