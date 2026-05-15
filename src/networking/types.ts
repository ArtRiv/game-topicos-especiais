// Client-side network payload types.
// These mirror game-server/src/types.ts — keep in sync when protocol changes.

export type PlayerInfo = {
  id: string;
  name: string;
  socketId: string;
  element?: string;
  team?: number;          // 0 = Team A, 1 = Team B; undefined = unassigned
};

export type Lobby = {
  id: string;
  hostPlayerId: string;
  players: PlayerInfo[];
  mode: string | null;
  status: 'waiting' | 'in-progress';
};

export type MatchConfig = {
  lobbyId: string;
  players: PlayerInfo[];
  mode: string;
};

/** Outbound: local player sends this every 20 Hz tick */
export type PlayerUpdatePayload = {
  x: number;
  y: number;
  direction: string;
  state: string;
  element: string;
};

/** Inbound: server relays other players' updates */
export type PlayerUpdateBroadcast = PlayerUpdatePayload & { playerId: string };

export type SpellCastPayload = {
  spellId: string;
  element: string;
  x: number;
  y: number;
  direction: string;
  targetX: number;
  targetY: number;
};

export type SpellCastBroadcast = SpellCastPayload & { playerId: string };

/** FireBreath channeled spell — start event */
export type BreathStartPayload = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

export type BreathStartBroadcast = BreathStartPayload & { playerId: string };

/** FireBreath channeled spell — per-tick aim update (sent at 20 Hz via unreliable channel) */
export type BreathUpdatePayload = {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
};

export type BreathUpdateBroadcast = BreathUpdatePayload & { playerId: string };

/** FireBreath channeled spell — end event */
export type BreathEndPayload = Record<string, never>;

export type BreathEndBroadcast = { playerId: string };

/** EarthWall — single pillar placement */
export type EarthWallPillarPayload = {
  x: number;
  y: number;
};

export type EarthWallPillarBroadcast = EarthWallPillarPayload & { playerId: string };

/** EarthWall — single pillar destruction (crumbled) */
export type EarthWallPillarDestroyPayload = {
  x: number;
  y: number;
};

export type EarthWallPillarDestroyBroadcast = EarthWallPillarDestroyPayload & { playerId: string };

export type RoomTransitionPayload = {
  levelName: string;
  doorId: number;
  roomId: number;
};

export type PlayerDisconnectedPayload = {
  playerId: string;
};

/** Match-lifecycle FSM states (LFC-01). Mirrors game-server/src/types.ts MatchState. */
export type MatchState = 'LOBBY' | 'LOADING' | 'COUNTDOWN' | 'ACTIVE' | 'ENDED';

/** Inbound broadcast: server informs all clients of a match-state transition (LFC-02). */
export type MatchStateChangedPayload = {
  lobbyId: string;
  state: MatchState;
  /** Server epoch ms when the transition was performed; useful for COUNTDOWN sync in Phase 8. */
  serverTs: number;
};

/** Outbound: client tells server it has finished loading and is ready to enter COUNTDOWN (LFC-05). */
export type MatchLoadedPayload = {
  lobbyId: string;
};
