export class GameRoom {
  #players: Map<string, string> = new Map(); // socketId → playerId
  public transitionLock: boolean = false;

  addPlayer(playerId: string, socketId: string): void {
    this.#players.set(socketId, playerId);
  }

  removePlayer(socketId: string): string | undefined {
    const playerId = this.#players.get(socketId);
    this.#players.delete(socketId);
    return playerId;
  }

  getPlayerIdBySocketId(socketId: string): string | undefined {
    return this.#players.get(socketId);
  }

  getOtherSocketIds(socketId: string): string[] {
    return Array.from(this.#players.keys()).filter(id => id !== socketId);
  }

  get playerCount(): number {
    return this.#players.size;
  }
}
