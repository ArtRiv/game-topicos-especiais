// Server-side socket event payload types.
// Mirrored in src/networking/types.ts on the client — keep in sync when protocol changes.

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
};

export type SpellCastBroadcast = SpellCastPayload & { playerId: string };

export type RoomTransitionPayload = {
  levelName: string;
  doorId: number;
  roomId: number;
};

export type PlayerDisconnectedPayload = {
  playerId: string;
};

/** Match-lifecycle FSM states (LFC-01). Order matters: each state can only advance to the next or to ENDED. */
export type MatchState = 'LOBBY' | 'LOADING' | 'COUNTDOWN' | 'ACTIVE' | 'ENDED';

/** Outbound broadcast: server informs all clients of a match-state transition (LFC-02). */
export type MatchStateChangedPayload = {
  lobbyId: string;
  state: MatchState;
  /** Server epoch ms when the transition was performed; useful for COUNTDOWN sync in Phase 8. */
  serverTs: number;
};

/** Inbound: client tells server it has finished loading and is ready to enter COUNTDOWN (LFC-05). */
export type MatchLoadedPayload = {
  lobbyId: string;
};

/** Outbound broadcast: per-second countdown tick during COUNTDOWN state (LFC-08).
 * Server emits exactly 4 of these per cycle: 3 → 2 → 1 → FIGHT, spaced 1000 ms apart. */
export type MatchCountdownTickPayload = {
  lobbyId: string;
  /** Seconds remaining at this tick. 3 | 2 | 1 | 0 at runtime; typed as number so the wire format
   * stays permissive (a future variable-duration mode could ship 4/5/etc. without a protocol bump). */
  remaining: number;
  /** Display label for the tick. '3' | '2' | '1' | 'FIGHT' at runtime; typed as string for the same
   * reason as `remaining` — gives client cinematics room to add new labels without a protocol bump. */
  label: string;
  /** Server epoch ms when the tick was broadcast; mirrors MatchStateChangedPayload.serverTs. */
  serverTs: number;
};

/** Total duration of the COUNTDOWN state in milliseconds — 3 ticks at 1000 ms each.
 * Used by server.ts:startCountdown to schedule the final ACTIVE transition. */
export const COUNTDOWN_DURATION_MS = 3000;

/** Visible hold time of the final 'FIGHT' tick before the LOADING→ACTIVE transition broadcast.
 * Total COUNTDOWN-to-ACTIVE span is COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS = 3500 ms. */
export const FIGHT_HOLD_MS = 500;
