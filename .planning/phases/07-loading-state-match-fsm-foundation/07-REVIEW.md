---
phase: 07-loading-state-match-fsm-foundation
reviewed: 2026-05-15T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - game-server/src/types.ts
  - game-server/src/game-room.ts
  - game-server/src/server.ts
  - game-server/src/game-room.test.ts
  - src/scenes/loading-scene.ts
  - src/networking/types.ts
  - src/common/event-bus.ts
  - src/scenes/scene-keys.ts
  - src/networking/network-manager.ts
  - src/scenes/lobby-scene.ts
  - src/main.ts
findings:
  critical: 2
  warning: 7
  info: 3
  total: 12
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-05-15
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 7 introduces a server-side match FSM (`LOBBY -> LOADING -> COUNTDOWN -> ACTIVE -> ENDED`), a `match:loaded` exact-once sync barrier, and a client-side `LoadingScene` that gates entry to `PreloadScene`/`GameScene` on the server's broadcast. The FSM table and `markLoaded()` Set-based exact-once contract are solid, and the post-merge LFC-04 visibility fixes (`#ackSentAt`, `#scheduleTransition`, `#pendingTransition`) correctly handle all event-ordering permutations between local ack and server broadcast.

However, two BLOCKER-class defects exist on the server:

1. **Sync barrier can deadlock when a non-acked peer disconnects during LOADING.** `removePlayer()` drops the peer from `#players` but does not re-evaluate whether the remaining acked sockets now constitute a complete set. The match permanently stalls in LOADING with `#loadedSocketIds.size < #players.size` impossible to ever close, because no surviving client can produce a state-changing ack (their entries are already in the Set).

2. **`lobby:start` is not idempotent.** A host who double-clicks (or a malicious client) re-runs the whole bootstrap: `gameRooms.set(lobby.id, room)` overwrites the in-flight GameRoom, destroying any `match:loaded` acks already received. The first wave of clients sees their acks vanish, the new room waits forever, and the FSM cannot advance — same deadlock as above, different cause.

Both are reachable in normal play (a player closing a tab mid-LOADING; a laggy host clicking twice) and both leave the entire match stuck on the LoadingScene with no client-side recovery path. The LoadingScene has no timeout or "give up" affordance, so users will see "Waiting for other players..." indefinitely.

Several warning-tier issues compound the BLOCKERs: GameRoom instances are never deleted from `gameRooms` (memory leak), the server handlers don't validate inbound payload shape (a malicious client can crash a handler with `socket.emit('match:loaded', null)`), and there are stale duplicate-listener and stuck-on-ENDED issues in LoadingScene/LobbyScene.

## Critical Issues

### CR-01: Sync barrier deadlocks when a non-acked player disconnects during LOADING

**File:** `game-server/src/game-room.ts:23-28, 69-79`
**Issue:**
`removePlayer(socketId)` removes the socket from `#players` AND from `#loadedSocketIds`. This correctly handles the case where the disconnecting socket had already acked. But it does NOT trigger any re-check of "is the set now complete?" against the new player count, and `markLoaded()` only returns `true` on the call that *changes* the set size. Consider:

1. Players A and B both join LOADING.
2. B acks first. `#loadedSocketIds = {B}`, size=1; `#players.size=2`; `markLoaded` returns `false`.
3. A disconnects without acking. `removePlayer('A')` runs: `#players.size=1`, `#loadedSocketIds={B}` (B still there).
4. Now `loadedSocketIds.size === players.size === 1` — the set is logically complete, but no future event can cause `markLoaded` to return `true`. B has already acked (duplicate ack returns `false` per the size-unchanged guard at line 77). A is gone, can't ack.

Result: the server never transitions LOADING -> COUNTDOWN, every surviving client sits on `LoadingScene` showing "Waiting for other players..." forever. The Phase 7 stub auto-advance never fires either (it's gated on COUNTDOWN, which never arrives). There is no client-side timeout — `LoadingScene` has no exit other than this broadcast.

This is reachable in normal play any time a peer's browser tab closes (or network drops) between scene entry and ack.

**Fix:**
After `removePlayer`, check whether the remaining acks cover the remaining players, and if so, perform the transition. Return a boolean so the server can act on it:

```typescript
// game-room.ts
removePlayer(socketId: string): { playerId: string | undefined; nowComplete: boolean } {
  const playerId = this.#players.get(socketId);
  this.#players.delete(socketId);
  this.#loadedSocketIds.delete(socketId);
  const nowComplete =
    this.#state === 'LOADING' &&
    this.#players.size > 0 &&
    this.#loadedSocketIds.size === this.#players.size;
  return { playerId, nowComplete };
}
```

```typescript
// server.ts — disconnect handler
if (room) {
  const { playerId, nowComplete } = room.removePlayer(socket.id);
  if (playerId && lobbyId) {
    io.to(`lobby:${lobbyId}`).emit('game:player-disconnected', { playerId });
  }
  if (nowComplete && lobbyId) {
    try { room.transitionTo('COUNTDOWN'); broadcastMatchState(lobbyId, room); /* + Phase 7 stub */ }
    catch { /* ignore */ }
  }
}
```

Also add a test case mirroring the scenario in `game-room.test.ts` — the existing "removing a player drops their pending loaded ack" test (line 110) does not cover the case where the *remaining* player has already acked.

---

### CR-02: `lobby:start` is not idempotent — re-runs overwrite the in-flight GameRoom and destroy acks

**File:** `game-server/src/server.ts:89-103`, `game-server/src/lobby-manager.ts:78-85`
**Issue:**
`lobbyManager.startLobby` only checks host identity, not lobby `status`. If `lobby:start` fires twice (host double-clicks the START button; lost-then-resent socket.io packet; malicious client), the handler runs end-to-end both times:

```typescript
// server.ts:89
socket.on('lobby:start', () => {
  const lobby = lobbyManager.startLobby(socket.id);   // sets status='in-progress' both times, returns lobby both times
  if (!lobby) return;
  const room = new GameRoom();                         // FRESH GameRoom — second call discards the previous one
  lobby.players.forEach((p) => room.addPlayer(p.id, p.socketId));
  gameRooms.set(lobby.id, room);                       // overwrites the in-flight room
  room.transitionTo('LOADING');                        // succeeds: new room is in LOBBY
  broadcastMatchState(lobby.id, room);
  ...
});
```

Concrete failure sequence:
1. Host clicks START. Room A created, all 4 players join `LoadingScene`, 3 of 4 send `match:loaded`. Room A's `#loadedSocketIds.size = 3`.
2. Host clicks START again (or the click event fires twice). Room B replaces Room A in `gameRooms`. Room B has `#loadedSocketIds.size = 0`.
3. The 4th player sends `match:loaded`. Server looks up `gameRooms.get(lobbyId)` -> Room B. `markLoaded` adds to Room B's set, size=1, not complete, returns false.
4. The 3 already-acked clients have no event that would cause them to resend `match:loaded` (the local `#ackSent` flag in `LoadingScene` line 96 blocks any retry).
5. Match is stuck in LOADING forever.

Server also re-broadcasts `match:state-changed: LOADING` and re-emits `lobby:started`. Clients receive duplicate `lobby:started`, which re-runs `NetworkManager.#initWebRTCMesh` — creating duplicate `RTCPeerConnection`s and orphaning the originals (the existing entry is overwritten on `this.#peerConnections.set(peerSocketId, pc)` at game-room/network-manager.ts:328). That's a second, independent corruption.

**Fix:**
Guard `startLobby` to reject reruns:

```typescript
// lobby-manager.ts
startLobby(socketId: string): Lobby | null {
  const lobby = this.getLobbyBySocketId(socketId);
  if (!lobby) return null;
  if (lobby.status !== 'waiting') return null;  // <-- new: already started
  const player = lobby.players.find(p => p.socketId === socketId);
  if (!player || player.id !== lobby.hostPlayerId) return null;
  lobby.status = 'in-progress';
  return lobby;
}
```

Defense-in-depth: also reject in server.ts if `gameRooms.has(lobby.id)`:

```typescript
// server.ts:89
if (gameRooms.has(lobby.id)) return;
```

## Warnings

### WR-01: `gameRooms` map never cleaned up — memory leak across match lifetimes

**File:** `game-server/src/server.ts:18, 89-103, 105-132, 174-206`
**Issue:**
`gameRooms.set(lobby.id, room)` is called on `lobby:start`, but no code path removes from `gameRooms`. When the lobby is destroyed (all players disconnect — see `lobbyManager.leaveLobby` returning null and the `#lobbies.delete(lobbyId)` at lobby-manager.ts:51), the GameRoom stays in `gameRooms` indefinitely, along with its closed-but-still-referenced socket IDs. A long-running server accumulates one stale GameRoom per played match.

Also enables a subtle bug with the Phase 7 stub at server.ts:121-131: the `setTimeout(50ms)` callback dereferences `gameRooms.get(lobbyId)` after the room may logically be over (no players left). The guard `if (!gameRooms.has(lobbyId)) return;` is never satisfied because nothing ever deletes from the map.

**Fix:**
Delete the room when the underlying lobby is destroyed (i.e. when `lobbyManager.leaveLobby` returned null because the lobby became empty):

```typescript
// server.ts disconnect handler, after leaveLobby:
const lobbyAfterLeave = lobbyManager.leaveLobby(socket.id);
if (!lobbyAfterLeave && lobbyId) {
  gameRooms.delete(lobbyId);  // lobby was destroyed -> drop the GameRoom too
}
```

Plus, when the match ends (future LFC-06 ENDED transition), remove the room then as well.

---

### WR-02: Server socket handlers crash on malformed inbound payloads (no schema validation)

**File:** `game-server/src/server.ts:33-104, 105-132, 135-172`
**Issue:**
Every handler destructures untrusted client input with a TypeScript type assertion, which is erased at runtime. A client (intentional or buggy) emitting a non-object payload causes a synchronous TypeError that socket.io will log but otherwise swallows. Phase-7 example:

```typescript
socket.on('match:loaded', ({ lobbyId }: MatchLoadedPayload) => { ... });
// client: socket.emit('match:loaded', null) -> TypeError: Cannot destructure property 'lobbyId' of 'null' as it is null.
// client: socket.emit('match:loaded', { lobbyId: { $eval: '...' } }) -> passes through to gameRooms.get(non-string)
```

The same pattern exists in every handler in server.ts. While socket.io traps the throw and keeps the connection alive, repeated malformed payloads from a malicious peer leave noisy logs and (more importantly) blow past every other handler in the same packet that depends on shared state.

For `match:loaded` specifically, `gameRooms.get(lobbyId)` does not require `lobbyId` to be a string — a Map will happily look up any key — so passing `{ lobbyId: someObject }` simply returns undefined and bails. Safe-ish in this case, but the pattern is fragile for any handler that interpolates the value (e.g. `\`lobby:${lobbyId}\``, which stringifies arbitrary objects).

**Fix:**
Add a minimal validator at the top of each handler:

```typescript
socket.on('match:loaded', (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || typeof (payload as any).lobbyId !== 'string') return;
  const { lobbyId } = payload as MatchLoadedPayload;
  ...
});
```

Or extract a typed-validator helper. At minimum, wrap each handler body in try/catch so a single malformed packet from one client cannot interrupt a multi-step sequence.

---

### WR-03: `LoadingScene` never exits on `ENDED` — stranded on host disconnect during LOADING

**File:** `src/scenes/loading-scene.ts:106-112`
**Issue:**
`#onMatchStateChanged` only acts on `COUNTDOWN` and `ACTIVE`:

```typescript
if (payload.state !== 'COUNTDOWN' && payload.state !== 'ACTIVE') return;
```

If the server transitions the room to `ENDED` while `LoadingScene` is still up — a real path in future phases when the host disconnects during LOADING (Phase 8/9) or when CR-01 triggers a deliberate teardown rather than a deadlock — clients are stranded on the loading screen with no path to recover. There's also no handler for `NETWORK_DISCONNECTED` on this scene, so a socket drop leaves the user staring at "Waiting for other players..." with no feedback.

**Fix:**
Handle `ENDED` by returning to `LobbyScene`, and handle disconnect by surfacing a status update:

```typescript
#onMatchStateChanged = (payload: MatchStateChangedPayload): void => {
  if (payload.lobbyId !== this.#matchConfig.lobbyId) return;
  if (payload.state === 'ENDED') {
    this.scene.stop(SCENE_KEYS.LOADING_SCENE);
    this.scene.start(SCENE_KEYS.LOBBY_SCENE);
    return;
  }
  if (payload.state !== 'COUNTDOWN' && payload.state !== 'ACTIVE') return;
  if (this.#pendingTransition) return;
  this.#pendingTransition = true;
  this.#scheduleTransition();
};
```

Also wire up `NETWORK_DISCONNECTED` -> update `#statusText` so the user sees "Disconnected from server" instead of an infinite wait.

---

### WR-04: `LobbyScene.#onHostChanged` registers duplicate listeners every time host migrates

**File:** `src/scenes/lobby-scene.ts:181-226`
**Issue:**
`#onHostChanged` (line 221) calls `#showWaitingRoomView(...)` again. `#showWaitingRoomView` (line 181) unconditionally registers three EVENT_BUS listeners at lines 209-211 without first un-registering the prior ones:

```typescript
EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
```

After N host migrations, each event fires N+1 times. `#onLobbyStarted` (line 228) will call `this.scene.start(LOADING_SCENE, ...)` N+1 times — Phaser typically dedupes start-on-an-already-started scene, but `LoadingScene.init()` re-runs each time, resetting `#ackSent` and re-triggering ack sends. The match flow becomes noisy and order-sensitive.

Pre-existing pattern in Phase 6 host-migration but in scope for Phase 7 because `#onLobbyStarted` now routes through LoadingScene, making the duplicate-emit failure mode more visible (multiple `match:loaded` sends, multiple scene starts).

**Fix:**
Off the listeners at the top of `#showWaitingRoomView` before re-registering:

```typescript
#showWaitingRoomView(lobby: Lobby): void {
  EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onLobbyUpdated, this);
  EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, this.#onWaitingRoomUpdate, this);
  EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, this.#onLobbyStarted, this);
  EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_HOST_CHANGED, this.#onHostChanged, this);
  this.#clearView();
  ...
```

---

### WR-05: `LoadingScene.#renderUI` crashes if scene started without `matchConfig`

**File:** `src/scenes/loading-scene.ts:35, 45-50, 67-93`
**Issue:**
`#matchConfig!: MatchConfig` uses a definite-assignment assertion. `init(data)` reads `data.matchConfig` without checking that it exists. If anything starts the scene without the data argument (Phaser dev tools, a refactor regression, a future scene transition), `#matchConfig` is `undefined`, and `#renderUI` crashes at line 73 (`this.#matchConfig.mode`) or 79 (`this.#matchConfig.players`).

The TypeScript signature `init(data: LoadingSceneData)` is also lying: Phaser passes `{}` when no data is provided, not the typed object.

**Fix:**
Validate `data` and bail out gracefully:

```typescript
init(data: LoadingSceneData | undefined): void {
  if (!data?.matchConfig) {
    console.warn('[LoadingScene] No matchConfig — returning to lobby');
    this.scene.start(SCENE_KEYS.LOBBY_SCENE);
    return;
  }
  this.#matchConfig = data.matchConfig;
  this.#ackSent = false;
  this.#ackSentAt = -1;
  this.#pendingTransition = false;
}
```

Also defensively guard `players` rendering against `undefined`/empty.

---

### WR-06: `sendMatchLoaded` doesn't surface failure when called before socket connect

**File:** `src/scenes/loading-scene.ts:95-104`, `src/networking/network-manager.ts:138-141`
**Issue:**
`#sendLoadedAck` emits via `socket.emit('match:loaded', ...)` unconditionally. socket.io buffers the emit when disconnected and re-sends on reconnect — but with the **new** socket.id, which won't be in the server's `GameRoom.#players` (those were registered against the old socket.id). The server's `markLoaded` early-returns false (line 71), and the client's `#ackSent=true` blocks any retry.

This is reachable in two ways:
1. The client is disconnected during the brief window between `lobby:started` and entering `LoadingScene` (server crashed, network hiccup).
2. The user has multiple tabs and one drops, triggering a reconnection that allocates a new socket.id.

Result: the same deadlock as CR-01, with no recovery path.

**Fix:**
Gate the emit on connection state and surface a clear error to the user:

```typescript
#sendLoadedAck(): void {
  if (this.#ackSent) return;
  const nm = NetworkManager.getInstance();
  if (!nm.isConnected) {
    if (this.#statusText) this.#statusText.setText('Disconnected — returning to lobby').setColor('#ff4444');
    this.time.delayedCall(2000, () => {
      this.scene.stop(SCENE_KEYS.LOADING_SCENE);
      this.scene.start(SCENE_KEYS.LOBBY_SCENE);
    });
    return;
  }
  this.#ackSent = true;
  this.#ackSentAt = this.time.now;
  nm.sendMatchLoaded(this.#matchConfig.lobbyId);
  ...
}
```

A more robust fix is server-side: track players by `playerId` rather than `socketId` so reconnects can resume their `match:loaded` slot. That's a Phase 8 conversation.

---

### WR-07: `setTimeout(50ms)` stub in `match:loaded` handler can leak when room is destroyed mid-window

**File:** `game-server/src/server.ts:121-131`
**Issue:**
The Phase 7 stub schedules an unconditional `setTimeout` callback. The guard `if (!gameRooms.has(lobbyId)) return;` works only if WR-01 is fixed (rooms get deleted). With the current memory leak, every match permanently retains a 50ms-delayed transition attempt; if `lobbyId` is somehow re-used or a new GameRoom replaces it (see CR-02), the callback runs against the wrong room. The handle is also not retained anywhere, so it cannot be cleared on disconnect or shutdown.

**Fix:**
Stop using a free-floating `setTimeout`. Store the handle on the GameRoom and clear it in `removePlayer`/teardown:

```typescript
// game-room.ts
#countdownTimer: NodeJS.Timeout | null = null;
setCountdownTimer(t: NodeJS.Timeout): void { this.clearCountdownTimer(); this.#countdownTimer = t; }
clearCountdownTimer(): void { if (this.#countdownTimer) { clearTimeout(this.#countdownTimer); this.#countdownTimer = null; } }
```

Also gate the callback on identity: capture the room reference at schedule time and verify `gameRooms.get(lobbyId) === capturedRoom` before transitioning.

## Info

### IN-01: `GameRoom.getAllSocketIds` is unused dead code

**File:** `game-server/src/game-room.ts:38-40`
**Issue:**
`getAllSocketIds()` has no callers in the workspace (`grep -rn "getAllSocketIds" game-server src`). It was likely added speculatively for the FSM phase.
**Fix:**
Remove the method or add the planned caller in the same commit.

---

### IN-02: `MatchState` includes `LOBBY` on client but client never receives a `LOBBY` broadcast

**File:** `src/networking/types.ts:102`
**Issue:**
The server only broadcasts on transitions, never on initial-state, and the only initial state is `LOBBY`. The `'LOBBY'` member of the client's `MatchState` union is therefore unreachable in `#onMatchStateChanged`. Not harmful, but indicates the protocol surface is wider than the wire format.
**Fix:**
Either drop `LOBBY` from the client type (since clients can never see it) or add a comment explicitly noting that the value exists only for symmetry with the server enum.

---

### IN-03: Phase 7 stub auto-transition COUNTDOWN -> ACTIVE leaves test-visibility gap

**File:** `game-server/src/server.ts:119-131`, `game-server/src/game-room.test.ts`
**Issue:**
The 50ms auto-advance is documented as "Phase 7 STUB" — fine for production. But there are no tests covering the auto-transition path itself (only the `markLoaded` exact-once contract). The match-flow integration is therefore untested in unit/integration land; only an end-to-end run would catch a regression in the stub.

The existing tests at game-room.test.ts:62-122 are focused on `GameRoom` directly. Consider adding a test in `server.test.ts` (or equivalent) that drives the full `lobby:start -> match:loaded -> match:state-changed COUNTDOWN -> match:state-changed ACTIVE` sequence.
**Fix:**
Add an integration test once Phase 8 replaces the stub, OR remove the stub entirely and have Phase 7 stop at COUNTDOWN (since LoadingScene already accepts either COUNTDOWN or ACTIVE as the "go" signal). The stub adds a complication that isn't load-bearing for the LFC-05 sync barrier.

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
