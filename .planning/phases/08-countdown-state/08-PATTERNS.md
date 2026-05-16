# Phase 8: COUNTDOWN State — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 5 upcoming Phase 8 concepts
**Analogs found:** 5 / 5 (all concepts have an existing in-repo analog)

## File Classification

| Upcoming Phase 8 Concept | Role | Data Flow | Closest Analog (file:line) | Match Quality |
|---|---|---|---|---|
| Server-driven countdown interval (`countdown:tick` / repeated `match:state-changed`) | networking-handler / interval-broadcaster | event-driven (server push) | `game-server/src/server.ts:121-131` (Phase 7 STUB setTimeout) **+** `src/networking/network-manager.ts:195-214` (`startGameTick` / `stopGameTick`) | exact-role (replace stub) + role-match (interval pattern) |
| Client countdown UI overlay (3, 2, 1, FIGHT!) | scene / hud-overlay | request-response (one event in, text out) | `src/scenes/loading-scene.ts:52-128` (entire LoadingScene) **+** `src/scenes/game-scene.ts:1690-1706` (transient overlay with `delayedCall(...).destroy()`) | exact (sync-barrier scene shape) + role-match (overlay) |
| Camera zoom-in tween (zoomed-out → 1.0× over countdown) | scene-method / animation | request-response | `src/scenes/game-scene.ts:1046-1051` (`#setupCamera` startFollow) **+** `src/scenes/game-scene.ts:1283-1311` (camera-bounds tween via `this.tweens.add` with `onUpdate`) | role-match (camera) + exact (tween shape) |
| Input lock during COUNTDOWN | component-flag / scene-listener | event-driven | `src/components/input/input-component.ts:11-44` (`#isMovementLocked` flag) **+** `src/components/state-machine/states/character/idle-state.ts:31-36` (consumer pattern) **+** `src/scenes/game-scene.ts:1346` (release on tween complete) | exact (mechanism already exists) |
| Server clearTimeout on disconnect mid-countdown | server-cleanup | event-driven | `game-server/src/server.ts:174-206` (`disconnect` handler) **+** `game-server/src/server.ts:121-131` (Phase 7 STUB — owns the orphan timer reference today) | role-match (cleanup site) |

## Pattern Assignments

### Concept 1 — Server-driven countdown ticks

**Analog A:** `game-server/src/server.ts:121-131` — the Phase 7 STUB setTimeout that auto-advances COUNTDOWN→ACTIVE.

```typescript
// Phase 7 STUB: auto-advance COUNTDOWN → ACTIVE after a short delay so existing GameScene flow
// continues to work end-to-end. Phase 8 will REPLACE this stub with the real countdown timing.
setTimeout(() => {
  if (!gameRooms.has(lobbyId)) return;
  const r = gameRooms.get(lobbyId)!;
  if (r.state !== 'COUNTDOWN') return;
  try {
    r.transitionTo('ACTIVE');
  } catch {
    return;
  }
  broadcastMatchState(lobbyId, r);
}, 50);
```

**Pattern to mirror:** Phase 8 deletes this `setTimeout` block and replaces it with either (a) a chained `setTimeout` cascade or (b) a `setInterval` that fires every 1000 ms for `N` ticks. Each tick broadcasts a payload to `lobby:${lobbyId}`. The existing `broadcastMatchState` helper at `server.ts:20-27` is the broadcast template — Phase 8 should add a sibling `broadcastCountdownTick(lobbyId, tickValue)` or extend `MatchStateChangedPayload` with an optional `countdown?: number` field. Keep the same defensive guards (`gameRooms.has`, `r.state !== 'COUNTDOWN'`, try/catch on `transitionTo`).

**Analog B (interval shape):** `src/networking/network-manager.ts:195-214` — `startGameTick`/`stopGameTick` is the canonical "owned timer reference + stop method" idiom in this repo.

```typescript
#tickInterval: ReturnType<typeof setInterval> | null = null;

startGameTick(snapshotGetter: () => PlayerUpdatePayload | null): void {
  if (this.#tickInterval) return;
  const intervalMs = Math.round(1000 / NETWORK_TICK_RATE_HZ);
  this.#tickInterval = setInterval(() => {
    const payload = snapshotGetter();
    if (payload) this.sendPlayerUpdate(payload);
  }, intervalMs);
}

stopGameTick(): void {
  if (this.#tickInterval) {
    clearInterval(this.#tickInterval);
    this.#tickInterval = null;
  }
  ...
}
```

**Pattern to mirror (server side):** Store the countdown timer reference on the `GameRoom` instance (e.g. `#countdownTimer: ReturnType<typeof setTimeout> | null`) with a `clearCountdown()` method, so the disconnect handler can call it cleanly (see Concept 5). The "if (already running) return early" guard at line 196 and the null-after-clear at line 207 are both load-bearing.

---

### Concept 2 — Client countdown UI overlay (3, 2, 1, FIGHT!)

**Analog A (scene shape):** `src/scenes/loading-scene.ts:34-128` — entire LoadingScene class is the canonical "FSM-driven scene that listens for NETWORK_MATCH_STATE_CHANGED, filters by `lobbyId`, and updates UI" pattern.

```typescript
// listener + shutdown cleanup pattern (loading-scene.ts:55-64)
EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);

this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
});

// payload filter pattern (loading-scene.ts:106-112)
#onMatchStateChanged = (payload: MatchStateChangedPayload): void => {
  if (payload.lobbyId !== this.#matchConfig.lobbyId) return;
  if (payload.state !== 'COUNTDOWN' && payload.state !== 'ACTIVE') return;
  ...
};
```

**Analog B (in-scene transient overlay):** `src/scenes/game-scene.ts:1696-1705` — the "A player disconnected" centered text + auto-destroy idiom.

```typescript
const msg = this.add
  .text(this.cameras.main.centerX, this.cameras.main.centerY - 40, 'A player disconnected', {
    fontFamily: '"Press Start 2P"',
    fontSize: '8px',
    color: '#ff4444',
  })
  .setOrigin(0.5)
  .setScrollFactor(0)   // pin to camera, ignore world scroll
  .setDepth(999);       // above everything
this.time.delayedCall(3000, () => msg.destroy());
```

**Pattern to mirror:** Phase 8's countdown overlay can either (a) be added to the existing **GameScene** as a transient overlay (the disconnect pattern at line 1696 — `setScrollFactor(0).setDepth(999)` + `delayedCall().destroy()`) — recommended because the camera zoom tween happens on `cameras.main` of the GameScene; or (b) be a new `CountdownScene` mirroring LoadingScene's shape. If (a), reuse the disconnect overlay's font conventions (`"Press Start 2P"`) but bump `fontSize` to a large value (e.g. `32px` for "3","2","1" and `48px` for "FIGHT!"). Drive the digit changes from the server's `countdown:tick` payload (do NOT use a client-side `setInterval` — that breaks the LFC-02 server-authoritative timing). The text-swap pattern is `existingText.setText('2')`, not destroy-and-recreate, to avoid flicker.

---

### Concept 3 — Camera zoom-in tween

**Analog A (current camera setup):** `src/scenes/game-scene.ts:1046-1051` — `#setupCamera()` is the canonical hook for any camera initialisation work.

```typescript
#setupCamera(): void {
  // updates for camera to stay with level
  const roomSize = this.#objectsByRoomId[this.#levelData.roomId].room;
  this.cameras.main.setBounds(roomSize.x, roomSize.y - roomSize.height, roomSize.width, roomSize.height);
  this.cameras.main.startFollow(this.#player);
}
```

**Analog B (tween shape with `onUpdate`):** `src/scenes/game-scene.ts:1283-1311` — the room-transition camera-bounds tween is the canonical `this.tweens.add(...)` shape used in this repo.

```typescript
this.tweens.add({
  targets: bounds,
  x: roomSize.x,
  y: roomSize.y - roomSize.height,
  duration: CONFIG.ROOM_TRANSITION_CAMERA_ANIMATION_DURATION,
  delay: CONFIG.ROOM_TRANSITION_CAMERA_ANIMATION_DELAY,
  onUpdate: () => {
    this.cameras.main.setBounds(bounds.x, bounds.y, roomSize.width, roomSize.height);
  },
});
```

**Pattern to mirror:** In `#setupCamera` (or a new `#setupCameraForCountdown`), set initial zoom with `this.cameras.main.setZoom(0.5)` (or whichever zoomed-out value the design picks) BEFORE `startFollow`. Then trigger an `add.tween` targeting the camera itself with `{ zoom: 1.0, duration: 3000, ease: 'Sine.easeInOut' }` — Phaser supports tweening `camera.zoom` directly without an `onUpdate` callback because the property has a built-in setter. Use the same `'Sine.easeInOut'` easing already used by the obelisk bob tween at `game-scene.ts:946-953` for stylistic consistency. Co-locate the duration constant with the existing `CONFIG.ROOM_TRANSITION_*` constants (lines 1287, 1306) so future tuning has one home.

---

### Concept 4 — Input locking during COUNTDOWN

**Analog A (the lock mechanism — already exists, do NOT reinvent):** `src/components/input/input-component.ts:11-44` — `isMovementLocked` is a per-input-component boolean already wired into the player state machine.

```typescript
// input-component.ts:38-44
get isMovementLocked(): boolean {
  return this.#isMovementLocked;
}

set isMovementLocked(val: boolean) {
  this.#isMovementLocked = val;
}
```

**Analog B (consumer side — proves the lock already gates movement + spell casting):** `src/components/state-machine/states/character/idle-state.ts:31-36` and `move-state.ts:18-20`, `base-move-state.ts:19`.

```typescript
// idle-state.ts:31-48 — when locked, no transition out of idle (also blocks spell1/spell2)
public onUpdate(): void {
  const controls = this._gameObject.controls;

  if (controls.isMovementLocked) {
    return;
  }

  if (controls.isSpell1KeyJustDown) { ... }
  if (controls.isSpell2KeyJustDown) { ... }
  ...
}
```

**Analog C (release-on-completion pattern):** `src/scenes/game-scene.ts:1346` — room-transition tween's `onComplete` releases the lock.

```typescript
// inside this.tweens.add({...}).onComplete:
// re-enable player input
this.#controls.isMovementLocked = false;
```

**Pattern to mirror:** In Phase 8's countdown setup (likely in `GameScene.create()` after `#setupPlayer()` at line 148), set `this.#controls.isMovementLocked = true` BEFORE the first paint, then wire a NETWORK_MATCH_STATE_CHANGED listener that flips it to `false` exactly when `payload.state === 'ACTIVE'` (the "FIGHT!" moment). The fire-breath code at `game-scene.ts:222`, `257`, `346` already toggles `isMovementLocked`, so this is an established pattern — Phase 8 just adds one more toggle site. **Note:** `isMovementLocked` currently blocks **movement and spell casting** (idle-state.ts gates `isSpell1KeyJustDown` behind it), so a single flag is sufficient for Phase 8's "lock everything" requirement.

---

### Concept 5 — Server clearTimeout on disconnect mid-countdown

**Analog:** `game-server/src/server.ts:174-206` (disconnect handler) — and the orphan timer reference inside the Phase 7 STUB at `server.ts:121-131`.

```typescript
// server.ts:185-191 — existing cleanup in disconnect handler
if (room) {
  const playerId = room.removePlayer(socket.id);
  // note: removePlayer also drops any pending match:loaded ack for this socket (handled inside GameRoom)
  if (playerId && lobbyId) {
    io.to(`lobby:${lobbyId}`).emit('game:player-disconnected', { playerId });
  }
}
```

**Pattern to mirror:** Phase 8 stores the countdown timer on the `GameRoom` instance (e.g. `#countdownTimer: ReturnType<typeof setTimeout> | null`) with a `clearCountdown()` method. The disconnect handler then calls `room.clearCountdown()` immediately after `removePlayer` (i.e. add one line inside the existing `if (room) { ... }` block on line 185-191). The "comment-only change" precedent set at line 187 (the `removePlayer also drops...` comment) is the documentation style to mirror — when the cleanup is hidden inside the GameRoom method, leave a one-line comment at the disconnect site so future readers can find it.

**Edge case to mirror from existing code:** `server.ts:121-128`'s `if (!gameRooms.has(lobbyId)) return;` + `if (r.state !== 'COUNTDOWN') return;` + `try { ... } catch { return; }` triple-guard. Phase 8's countdown tick callback should preserve all three because the disconnect handler at line 193 calls `lobbyManager.leaveLobby(socket.id)` AFTER the room cleanup at line 186, meaning the timer's callback could fire in a state where the lobby is gone but the room reference is stale.

---

## Shared Patterns

### EVENT_BUS listener registration + SHUTDOWN cleanup

**Source:** `src/scenes/loading-scene.ts:55-64` (canonical from Phase 7) — also visible in `src/scenes/ui-scene.ts:104-114` and `src/scenes/game-scene.ts:891-921`.
**Apply to:** Any new Phaser scene or any new EVENT_BUS subscription added to GameScene in Phase 8.

```typescript
EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);

this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
});
```

### Arrow-function class fields for EVENT_BUS handlers

**Source:** `src/scenes/loading-scene.ts:106-112`, `src/scenes/game-scene.ts:1504-1511`, `1690-1706`.
**Apply to:** Phase 8 listener handlers so `this` binds correctly without explicit `.bind` and the `off()` call uses the same function reference.

```typescript
#onMatchStateChanged = (payload: MatchStateChangedPayload): void => { ... };
```

### Server broadcast helper colocated above `io.on('connection')`

**Source:** `game-server/src/server.ts:20-27` (`broadcastMatchState`).
**Apply to:** Any new server broadcast Phase 8 introduces (e.g. `broadcastCountdownTick`). Place it in the same module-level helper block, not inside the connection handler.

```typescript
function broadcastMatchState(lobbyId: string, room: GameRoom): void {
  const payload: MatchStateChangedPayload = {
    lobbyId,
    state: room.state,
    serverTs: Date.now(),
  };
  io.to(`lobby:${lobbyId}`).emit('match:state-changed', payload);
}
```

### Client mirror-type discipline

**Source:** `src/networking/types.ts` mirrors `game-server/src/types.ts` byte-for-byte (Plan 07-02 decision).
**Apply to:** Any new `CountdownTickPayload` Phase 8 introduces — add it to **both** files in the same task, never just one.

### Phaser timer for transient UI

**Source:** `src/scenes/game-scene.ts:1705` (`this.time.delayedCall(3000, () => msg.destroy())`) and `src/scenes/ui-scene.ts:148-151`.
**Apply to:** The post-FIGHT! overlay hide. Do not use raw `setTimeout` inside a scene — `this.time.delayedCall` auto-cancels on scene shutdown.

### "Phase N STUB" grep marker

**Source:** `game-server/src/server.ts:119` (`// Phase 7 STUB: ...`).
**Apply to:** Phase 8 removes the only existing `Phase 7 STUB` marker. If Phase 8 introduces its own temporary code, add an analogous `// Phase 8 STUB: ...` comment so Phase 9 can grep for it.

## No Analog Found

None — every Phase 8 concept has at least a role-match analog already in the codebase.

## Metadata

**Analog search scope:** `game-server/src/`, `src/scenes/`, `src/networking/`, `src/components/input/`, `src/components/state-machine/states/character/`, `src/common/`.
**Files scanned:** 8 (server.ts, lobby-manager.ts on server; loading-scene.ts, game-scene.ts, ui-scene.ts, game-over-scene.ts, network-manager.ts, input-component.ts, idle-state.ts on client).
**Pattern extraction date:** 2026-05-15.

**Key project conventions surfaced (no CLAUDE.md at project root):**
- ESM with `.js` import suffix on server (NodeNext): `from './types.js'`
- Private class fields with `#` prefix throughout (server + client)
- Singleton getter pattern: `NetworkManager.getInstance()` (network-manager.ts:76-81)
- Arrow-function class-field handlers for EVENT_BUS subscriptions
- Vitest as the server test runner (game-room.test.ts)
- Phaser scene listeners registered in `create()`, torn down in `SHUTDOWN` once-handler
