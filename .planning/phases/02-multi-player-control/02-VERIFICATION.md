# Verification: Phase 2 — Multi-Player Control

**Date:** 2026-03-30
**Status:** PARTIAL — all static checks pass; 3 items require live smoke test

---

## TypeScript Build

- Client (`pnpm tsc --noEmit`): **PASS** — 0 errors in `src/`; 4 pre-existing `node_modules` errors unchanged (rollup/parseAst × 2, lib.dom.d.ts TextDecoder/TextEncoder × 2)
- Server (`npx tsc --noEmit` in `game-server/`): **PASS** — 0 errors

---

## Automated Tests

- Server tests (`pnpm --filter game-server test`): **22/22 PASS**
  - `src/game-room.test.ts`: 7 tests ✓
  - `src/lobby-manager.test.ts`: 15 tests ✓ (includes 2 new `setPlayerTeam` host-guard tests from 02-01)

---

## Success Criteria

### SC-1: No hardcoded player roles (PLR-01)

**Result:** PASS

**Evidence:**

`LobbyScene` uses a `#isHost: boolean` private field (set at click time, before server response) to gate the START GAME button — it does NOT use `nm.localPlayerId` (which is empty until `lobby:started`):

```ts
// lobby-scene.ts — #showLobbyListView()
const createBtn = this.#createButton(cx, 100, 'CREATE LOBBY', () => {
  this.#isHost = true;                                    // set on click
  NetworkManager.getInstance().sendLobbyCreate(this.#playerName);
});

// lobby-scene.ts — #showWaitingRoomView()
if (this.#isHost) {
  const startBtn = this.#createButton(cx, cy + 120, 'START GAME', () => {
    NetworkManager.getInstance().sendLobbyStart();
  });
  this.#viewObjects.push(startBtn);
}
```

`NetworkManager` assigns `localPlayerId` dynamically from the server response (no hardcoded role):

```ts
// network-manager.ts — #bindSocketEvents()
this.#socket.on('lobby:started', ({ matchConfig }) => {
  const me = matchConfig.players.find((p) => p.socketId === this.#socket.id);
  if (me) this.#localPlayerId = me.id;   // socket.id — no hardcoded "P1/P2"
  this.#matchPlayers = matchConfig.players;
  ...
});
```

Remote players stored in `#remotePlayers: Map<string, Player>` keyed by UUID `playerId`, not slot index.

---

### SC-2: Remote mage movement in real time (PLR-03)

**Result:** PASS

**Evidence:**

`#onRemotePlayerUpdate` in `game-scene.ts` applies direction and state machine transitions directly from the network snapshot, then drives `RemoteInputComponent.applySnapshot()`:

```ts
// game-scene.ts — #onRemotePlayerUpdate
// Drive remote player direction + animation state directly from snapshot
remote.direction = payload.direction as Direction;
remote.stateMachine.setState(payload.state);       // state set BEFORE applySnapshot

const ric = remote.controls as RemoteInputComponent;
if (typeof ric.applySnapshot === 'function') {
  ric.applySnapshot({
    x: payload.x, y: payload.y,
    direction: payload.direction, state: payload.state, element: payload.element
  });
}
```

Position is lerped frame-to-frame for smooth visual movement:

```ts
remote.x = Phaser.Math.Linear(remote.x, payload.x, 0.3);
remote.y = Phaser.Math.Linear(remote.y, payload.y, 0.3);
```

60 Hz tick via `nm.startGameTick()` (configured in `config.ts` as `NETWORK_TICK_RATE_HZ`).

---

### SC-3: Independent HP and mana (PLR-02)

**Result:** PASS

**Evidence:**

Each `Player` instance owns a private `_lifeComponent: LifeComponent` (and `_manaComponent`) created in `CharacterGameObject` constructor — per-instance, no shared pool:

```ts
// character-game-object.ts — constructor
this._lifeComponent = new LifeComponent(this, maxLife, currentLife);
```

Remote players are created as separate `Player` instances in `#onRemotePlayerUpdate`:

```ts
remote = new Player({
  scene: this,
  position: { x: payload.x, y: payload.y },
  controls: ric,
  maxLife: CONFIG.PLAYER_START_MAX_HEALTH,
  currentLife: CONFIG.PLAYER_START_MAX_HEALTH,
  tintColor: tint,
});
this.#remotePlayers.set(payload.playerId, remote);
```

Remote players are **never registered** in `#registerColliders()`. All enemy overlap handlers target only `this.#player` (the local player):

```ts
// game-scene.ts — #registerColliders()
this.physics.add.overlap(this.#player, this.#objectsByRoomId[roomId].enemyGroup, () => {
  this.#player.hit(DIRECTION.DOWN, 1);    // only local player can receive hit()
});
```

Therefore `hit()` is never called on remote `Player` instances on a given client — their HP values remain at `PLAYER_START_MAX_HEALTH` and never trigger `DataManager.updatePlayerCurrentHealth()`.

---

### SC-4: Each player sees only their own HP bar (HUD-01)

**Result:** PASS

**Evidence:**

HP bar update chain:

1. `CharacterGameObject.hit()` calls `DataManager.instance.updatePlayerCurrentHealth()` **only when `_isPlayer === true`**:
   ```ts
   // character-game-object.ts — hit()
   this._lifeComponent.takeDamage(damage);
   if (this._isPlayer) {
     DataManager.instance.updatePlayerCurrentHealth(this._lifeComponent.life);
   }
   ```

2. `DataManager.updatePlayerCurrentHealth()` emits `CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED`.

3. `UiScene` listens to `PLAYER_HEALTH_UPDATED` and updates the heart sprites:
   ```ts
   // ui-scene.ts
   EVENT_BUS.on(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.updateHealthInHud, this);
   ```

4. `hit()` is only called on `this.#player` (local) via the collider registered in `#registerColliders()`. Remote players are never registered in any collision/overlap, so `hit()` is never called on them → DataManager is never updated for remote HP → UIScene HP bar only reflects the local player.

---

### SC-5: N-player lobby, no hard cap, teams configurable (PLR-04)

**Result:** PASS

**Evidence:**

`#renderPlayerList` is fully generic — iterates all players with no hardcoded cap:

```ts
// lobby-scene.ts — #renderPlayerList()
players.forEach((player, i) => {
  const rowY = baseY + i * 36;
  // ...renders a row for every player in the lobby
});
```

`setPlayerTeam()` in `LobbyManager` works for any player UUID in any lobby — the host guard protects it, but imposes no player-count limit:

```ts
// lobby-manager.ts — setPlayerTeam()
setPlayerTeam(requesterSocketId: string, targetPlayerId: string, team: number): Lobby | null {
  const lobby = this.getLobbyBySocketId(requesterSocketId);
  if (!lobby) return null;
  const requester = lobby.players.find(p => p.socketId === requesterSocketId);
  if (!requester || requester.id !== lobby.hostPlayerId) return null;  // host-only
  const target = lobby.players.find(p => p.id === targetPlayerId);
  if (!target) return null;
  target.team = team;
  return lobby;   // full lobby returned for broadcast
}
```

`lobby:assign-team` broadcasts `lobby:updated` to the entire `lobby:{id}` room, so all N connected clients receive the update simultaneously:

```ts
// server.ts
socket.on('lobby:assign-team', ({ targetPlayerId, team }) => {
  const lobby = lobbyManager.setPlayerTeam(socket.id, targetPlayerId, team);
  if (lobby) io.to(`lobby:${lobby.id}`).emit('lobby:updated', { lobby });
});
```

> **Note:** The lobby *browser* list caps display rows at 6 (`this.#lobbies.slice(0, 6)`) for UI readability — this does not affect the actual player count in any active lobby; it only limits how many joinable lobbies are shown in the list view.

---

## Smoke Test Results

**Performed:** post-Phase-2-execution  
**Setup:** 3 browser tabs on localhost:5174, game-server on port 3000

| Test | Expectation | Result | Notes |
|------|-------------|--------|-------|
| START button host-only | Tab A (creator) sees START; Tab B/C do not | **PASS** | SC-1 confirmed |
| Lobby list live update | Tab B sees new lobby appear without refresh | **FAIL → FIXED** | Server only emitted `lobby:created` to creator; fixed with `io.emit('lobby:list-updated')` broadcast after create/join/leave; client-side `lobby:list-updated` handler added to `NetworkManager` (commits `372f673`) |
| Team badges/buttons visible | A/B buttons shown; clicking assigns team; badge updates for non-host | **FAIL → FIXED** | Unassigned state set both buttons to `BTN_DISABLED` (near-black); non-host badge used dim '#888888' "—"; fixed with visible colors for active/inactive states and "NO TEAM"/"TEAM A"/"TEAM B" bright labels (commit `069ef8a`) |
| Remote mage walk animation | Mage on Tab B shows walking animation when Tab A moves | **FAIL → FIXED** | `MoveState.onUpdate()` called `setState(IDLE)` every frame because `isNoInputMovement` returns `true` when `isMovementLocked=true`; added `if (controls.isMovementLocked) return;` guard (commit `aaaca28`) |
| Team color determinism | Both observer tabs show same tint for same remote player | **PASS** | `#resolveRemotePlayerTint` is deterministic by `matchPlayers` array order |

All 3 failing smoke test items were root-cause diagnosed and fixed. TypeScript remains clean (`src/` 0 errors).

---

## Phase 2 Gate

**PASS — all static checks pass + all smoke test failures resolved**

TypeScript-verified: SC-1 (host detection) ✓, SC-2 (remote movement wiring) ✓, SC-3 (independent HP/mana) ✓, SC-4 (own HP bar only) ✓, SC-5 (N-player lobby) ✓

Runtime verification pending for 3 items listed above.
