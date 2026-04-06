# Phase 2 Research: Multi-Player Control

**Researched:** 2026-03-30
**Domain:** Phaser 3 / TypeScript / Socket.io multiplayer — lobby, remote player rendering, HUD
**Confidence:** HIGH (all findings from direct source-code inspection)

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- No fixed player roles — all players are `Player[i]` identified by `localPlayerId`
- Team assignment done in lobby/waiting room; communicated via `MatchConfig`
- `MatchConfig.players` carries `PlayerInfo[]` — teams added as `team: number` field on `PlayerInfo`
- Local player driven by `KeyboardComponent` (unchanged)
- Remote players driven by `RemoteInputComponent` receiving snapshots + `stateMachine.setState(state)` + `direction` setter
- Each remote player created on first `NETWORK_PLAYER_UPDATE`; keyed by `playerId` in `#remotePlayers Map`
- Each `Player` instance already has its own `HealthComponent` and `ManaComponent`; HP is independent per player
- Per HUD-01: each client only shows their own HP bar (multi-player HUD deferred)
- No hard cap on player count in code

### Agent's Discretion
- Visual distinction between teams (per-slot tint, group by team if possible)
- Lobby waiting room team assignment UX (simple toggle is fine)
- Whether to add player name labels above remote player sprites

### Deferred Ideas (OUT OF SCOPE)
- Full multi-player HUD (all players' HP visible)
- Per-player spell loadout restrictions
- Player name tags above sprites (nice-to-have only)
- FFA / battle royale mode

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLR-01 | Each player controls their own character via keyboard — no fixed role assignments | Area 2: Host detection bug found; GameScene has no P1/P2 hardcoding |
| PLR-02 | Each player has independent health and mana | Area 4: Confirmed — each `Player` instance owns its own `LifeComponent` + `ManaComponent`; DataManager HP gate is `_isPlayer`-scoped to local context |
| PLR-03 | Remote players rendered via RemoteInputComponent snapshots on all clients | Area 3: Pipeline verified; one redundancy found (applySnapshot not consumed); no blocking issues |
| PLR-04 | Lobby supports N players; no hard cap; teams configurable per session | Area 1+5: Type system changes needed; new socket event needed; UX approach documented |
| HUD-01 | Each player sees their own HP bar on their screen | Area 4: Already satisfied — HP update path only fires from `DataManager.updatePlayerCurrentHealth()` which is called only for `_isPlayer=true` objects that are hit on the client |

</phase_requirements>

---

## Current State Audit

### What Already Works After Phase 1
- WebRTC P2P mesh fully operational — `NetworkManager` connects peers, creates unreliable+reliable data channels
- `sendPlayerUpdate` / `sendSpellCast` wire correctly into GameScene via `CUSTOM_EVENTS.NETWORK_*`
- `#remotePlayers: Map<string, Player>` in GameScene correctly keyed by `playerId`
- Remote player direction + state machine are set directly in `#onRemotePlayerUpdate` before `applySnapshot` (UAT fix applied)
- Lerp-based position reconciliation (`Phaser.Math.Linear(..., 0.3)`) is in place
- Tint palette `[0xffffff, 0x00aaff, 0xff4444, 0x44ff44, 0xff44ff]` applied to remote players at slot index `remotePlayers.size + 1`
- Disconnect handling via `NETWORK_PLAYER_DISCONNECTED` destroys the remote `Player` instance

### What Is Missing for Phase 2
1. `PlayerInfo` has no `team` field — needed by PLR-04
2. No `lobby:assign-team` socket event — team assignment requires server coordination
3. **Bug**: LobbyScene START button shown to ALL clients (logic error, see Area 2)
4. **Bug**: `nm.localPlayerId` is not available during waiting room (set only after `lobby:started`)
5. Lobby waiting room has no team assignment UI
6. GameScene tint assignment is slot-order based, not team-based — needs optional team grouping

### What Needs Verification Only (No Code Change Expected)
- HUD-01 (own HP only) — confirmed correct as-is
- PLR-02 (independent HP/mana) — confirmed by `Player` constructor design
- `applySnapshot` redundancy — harmless, does not break PLR-03

---

## Area 1: Team Assignment Protocol

### Current State of Relevant Types

**`src/networking/types.ts` (client)**:
```typescript
export type PlayerInfo = {
  id: string;
  name: string;
  socketId: string;
  element?: string;   // exists, set at match start
  // team: missing
};

export type MatchConfig = {
  lobbyId: string;
  players: PlayerInfo[];  // PlayerInfo[] already — just needs team on each
  mode: string;
};
```
**`game-server/src/types.ts` (server)**: Identical mirror — both files must be changed in sync.

### Required Type Change

Add optional `team` field to `PlayerInfo` in **both** files:
```typescript
export type PlayerInfo = {
  id: string;
  name: string;
  socketId: string;
  element?: string;
  team?: number;          // 0 = Team A, 1 = Team B; undefined = unassigned
};
```
`optional` (`?`) avoids breaking existing code paths that don't set a team.

### Where Team Assignment Happens

**Recommended: Server-authoritative via new `lobby:assign-team` socket event.**

Flow:
1. Host emits `lobby:assign-team { targetPlayerId: string, team: number }` via socket.io
2. Server validates the requesting socket is the lobby host (same guard as `lobby:set-mode`)
3. `LobbyManager.setPlayerTeam(socketId, targetPlayerId, team)` updates the `PlayerInfo.team` field in the live lobby
4. Server emits `lobby:updated { lobby }` to all clients — existing `#onWaitingRoomUpdate` handler rebuilds the player list automatically

### What the Server Needs

**`LobbyManager`** — add one method:
```typescript
setPlayerTeam(requesterSocketId: string, targetPlayerId: string, team: number): Lobby | null {
  const lobby = this.getLobbyBySocketId(requesterSocketId);
  if (!lobby) return null;
  const requester = lobby.players.find(p => p.socketId === requesterSocketId);
  if (!requester || requester.id !== lobby.hostPlayerId) return null;  // only host
  const target = lobby.players.find(p => p.id === targetPlayerId);
  if (!target) return null;
  target.team = team;
  return lobby;
}
```

**`server.ts`** — add one handler:
```typescript
socket.on('lobby:assign-team', ({ targetPlayerId, team }: { targetPlayerId: string; team: number }) => {
  const lobby = lobbyManager.setPlayerTeam(socket.id, targetPlayerId, team);
  if (lobby) io.to(`lobby:${lobby.id}`).emit('lobby:updated', { lobby });
});
```

**`NetworkManager`** — add one method:
```typescript
sendLobbyAssignTeam(targetPlayerId: string, team: number): void {
  this.#socket.emit('lobby:assign-team', { targetPlayerId, team });
}
```

### What Happens at Match Start

`lobby:start` already emits `matchConfig = { lobbyId, players: lobby.players, mode }`. Since team assignments are stored on `PlayerInfo` objects inside the lobby, they flow automatically into `matchConfig.players[i].team`. **No changes needed to the start flow.**

### Client Consumption of Team Data

In `NetworkManager.#bindSocketEvents()`, the `lobby:started` handler:
```typescript
this.#socket.on('lobby:started', ({ matchConfig }) => {
  const me = matchConfig.players.find(p => p.socketId === this.#socket.id);
  if (me) this.#localPlayerId = me.id;
  this.#matchPlayers = matchConfig.players;  // ← matchConfig.players[i].team available here
  EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, { matchConfig });
  this.#initWebRTCMesh(matchConfig.players);
});
```
`#matchPlayers` carries team data. GameScene subscribing to `NETWORK_LOBBY_STARTED` can store the matchConfig to look up a player's team by `playerId`.

---

## Area 2: Dynamic Player Role Assignment

### GameScene — No Hardcoded P1/P2 Assumptions Found

- `#remotePlayers = new Map<string, Player>()` — keyed by `playerId`, fully dynamic ✓
- `#onRemotePlayerUpdate` skips local player by comparing `payload.playerId === nm.localPlayerId` ✓
- Player creation in `#onRemotePlayerUpdate` uses `this.#remotePlayers.size + 1` for slot index — correct for up to 4 remotes ✓
- `#setupPlayer()` creates the local player without any role label or hardcoded ID ✓
- `Player` constructor passes `id: 'player'` to `StateMachine` (used only for debug logging) — not a functional assumption

### LobbyScene — **CRITICAL BUG: START Button Shown to All Clients**

Source (`src/scenes/lobby-scene.ts`, line ~202):
```typescript
if (lobby.hostPlayerId === nm.localPlayerId || lobby.players[0]?.socketId) {
```
**Problem 1**: `nm.localPlayerId` is empty string during the waiting room because it is only set inside the `lobby:started` handler — which fires when the game begins, not when players join. During the waiting room, `nm.localPlayerId === ''`, so `lobby.hostPlayerId === nm.localPlayerId` is always `false`.

**Problem 2**: `lobby.players[0]?.socketId` is truthy for any non-empty lobby (the string is non-empty). The `||` short-circuits and the START button is always rendered for every client.

**Fix — Track `#isHost` boolean in LobbyScene**:
```typescript
#isHost: boolean = false;

// When lobby is created by this client:
socket.on('lobby:created') → this.#isHost = true
// When this client joins someone else's lobby:
socket.on('lobby:updated') → this.#isHost = false (remains false from default)

// In #showWaitingRoomView:
if (this.#isHost) { /* show START button */ }
```

Set `#isHost = true` after `NetworkManager.sendLobbyCreate()` (before the response), or set it in `#onLobbyUpdated` by checking if the updated lobby has `hostPlayerId` matching the socket's own `playerId`. The most reliable approach: set it in `#showWaitingRoomView` when `#onLobbyUpdated` is called with a `data.lobby` (join/create response) rather than `data.lobbies` — combine with a `#wasCreatedByMe` flag set on `sendLobbyCreate()`.

**Recommended approach**: Add `#isHost = false` field; set to `true` in `#onConnect` callback immediately after `sendLobbyCreate()` is called. Reset to `false` in `#clearView`.

### No Other Role Assumptions in GameScene

The `#PLAYER_TINT_PALETTE` array (index 0 = local player = white, remotes get blue/red/green/purple) is purely cosmetic and not a role assignment. Slot ordering is non-deterministic (depends on who joins first) and doesn't affect gameplay logic.

---

## Area 3: Remote Player Rendering

### The `#onRemotePlayerUpdate` Pipeline (Verified Correct)

```typescript
#onRemotePlayerUpdate = (payload: PlayerUpdateBroadcast): void => {
  // 1. Skip own updates
  if (nm && payload.playerId === nm.localPlayerId) return;

  // 2. Lazy-create remote Player on first update
  let remote = this.#remotePlayers.get(payload.playerId);
  if (!remote) { /* create Player with RemoteInputComponent */ }

  // 3. Lerp position
  remote.x = Phaser.Math.Linear(remote.x, payload.x, 0.3);
  remote.y = Phaser.Math.Linear(remote.y, payload.y, 0.3);

  // 4. Set direction + state DIRECTLY on the Player
  remote.direction = payload.direction as Direction;
  remote.stateMachine.setState(payload.state);

  // 5. applySnapshot() — redundant but harmless
  ric.applySnapshot({ ... });
};
```

Steps 4 sets direction and state before any frame update runs. `stateMachine.setState(payload.state)` triggers the animation for that state (IDLE/MOVE/CASTING). `RemoteInputComponent.isMovementLocked = true` blocks state-machine-driven velocity changes, so the remote character won't drift. **PLR-03 is satisfied with no additional changes.**

### Does `applySnapshot` Overwrite the Direction/State Set in Step 4?

No. `RemoteInputComponent.applySnapshot()` stores data in `this.#snapshot`. The `getSnapshot()` method exists but is **never called** in GameScene — the stored snapshot is never read back. The actual driving happens via direct property setters in `#onRemotePlayerUpdate` (step 4). `applySnapshot` is purely a data store that currently has no consumer. It does not overwrite anything.

### Does `PlayerUpdatePayload` Need Extension for Phase 2?

**HP field**: No. Phase 2 does not broadcast HP to other clients (PLR-02 is about independent HP, not synchronized HP). The full multi-player HUD is deferred.

**Team field**: No. Team is a match-start property, not a per-tick payload field. Team is already in `PlayerInfo` within `MatchConfig`, available at game start.

### Tint Assignment vs Team Assignment

Currently `slotIndex = this.#remotePlayers.size + 1` — this means the tint a remote player gets depends on the order they first send an update, which is non-deterministic. For Phase 2, the CONTEXT.md allows team-grouped tints at discretion. If team data is available on `MatchConfig`, tints can be assigned deterministically at game start (red tint for Team B, etc.) rather than on first update.

**Recommended improvement** (agent's discretion scope): Store `matchConfig` in GameScene when `NETWORK_LOBBY_STARTED` fires. Assign tint from team field when creating remote player: `team === 0 → 0x0055ff (blue), team === 1 → 0xff2200 (red), undefined → slot-based default`.

---

## Area 4: HUD — Own HP Only

### How UIScene Renders HP

`UIScene` listens to `CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED` on the EventBus:
```typescript
EVENT_BUS.on(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, this.updateHealthInHud, this);
```
The event is emitted from `DataManager.updatePlayerCurrentHealth()`:
```typescript
EVENT_BUS.emit(CUSTOM_EVENTS.PLAYER_HEALTH_UPDATED, dataToPass);
```

### When Is `DataManager.updatePlayerCurrentHealth()` Called?

Only from `CharacterGameObject.hit()`:
```typescript
public hit(direction: Direction, damage: number): void {
  // ...
  this._lifeComponent.takeDamage(damage);
  if (this._isPlayer) {
    DataManager.instance.updatePlayerCurrentHealth(this._lifeComponent.life);  // ← only for _isPlayer
  }
  // ...
}
```

### Are Remote Players `_isPlayer = true`?

Yes — `Player` always calls `super({ ..., isPlayer: true, ... })`. Remote players are `Player` instances, so their `_isPlayer` is `true`. However, in Phase 2:

- **Remote players are never registered as overlap targets against enemy groups.** `#registerColliders()` only registers `this.#player` (local) against all enemy groups. Remote `Player` instances are added to the scene but have no collider registration. They cannot receive `hit()` calls from enemies on remote clients.
- Therefore, `DataManager.updatePlayerCurrentHealth()` will never be called by a remote player receiving enemy damage.

**HUD-01 is already satisfied.** The UIScene exclusively shows the local player's HP via the EventBus pathway, and that pathway is only triggered by the local player taking damage.

### No Changes Required for HUD-01

The existing architecture is correct for single-HP-bar display. The UIScene initializes HP from `DataManager.instance.data.currentHealth` and `DataManager.instance.data.maxHealth` at creation — both are single-player values. No multi-player awareness needed in Phase 2.

**Verification task only**: Confirm in a networked test that the HP bar depletes when the local player takes damage and is unaffected when a remote player would logically take damage.

---

## Area 5: Lobby UX for Team Assignment

### Current Waiting Room (View C) Inventory

What it shows:
- Title: "WAITING ROOM"
- Host name subtitle
- Hint text: "Waiting for host to start..."
- Player list: colored dot + name + "(HOST)" badge, rendered at `baseY = 120` with 28px row spacing
- START button — currently shown to ALL clients (see Area 2 bug)

What it does NOT show:
- Team assignments
- Player count / max capacity
- Connection status per player

### Recommended Minimal Team Assignment UX

Keep it to the waiting room without a separate view. Modify `#renderPlayerList` to include team badges and host-only toggle buttons.

**For host rendering a row:**
```
[dot] PlayerName   Team A [▼] Team B
```
- Two clickable buttons "Team A" and "Team B" that call `NetworkManager.sendLobbyAssignTeam(player.id, team)`
- Active team highlighted (fill color), inactive grayed out

**For non-host rendering a row:**
```
[dot] PlayerName   [Team A]   or   [Team B]
```
- Read-only colored badge (blue = Team A, red = Team B, gray = unassigned)

### Socket Event Needed?

Yes — `lobby:assign-team` (see Area 1). The assignment must go through the server so all clients receive consistent state via `lobby:updated`. A client-only approach (host commits teams at start time) would work but loses live preview for other clients.

### Host Detection for UX Gating

For the team toggle buttons to appear only for the host, rely on the `#isHost` boolean described in Area 2 (not `nm.localPlayerId`).

### Lobby Re-render Path

`lobby:assign-team` → server updates `PlayerInfo.team` → `lobby:updated` broadcast → `#onWaitingRoomUpdate` → `#renderPlayerList(data.lobby.players)` → team badges show for all clients.

This reuses the **existing update pathway** with zero new event handlers on the client. The only change is `#renderPlayerList` rendering team badges/toggles.

---

## Implementation Risks

### Risk 1: LocalPlayerId Not Available During Waiting Room
**What goes wrong:** Any host-detection code that uses `nm.localPlayerId` during the waiting room will silently fail (empty string). This is the root cause of the START button bug.
**Mitigation:** Use a `#isHost` boolean on `LobbyScene` set when `sendLobbyCreate()` is called (before the response), or when the `lobby:created` event arrives.

### Risk 2: Remote Player Colliders Accidentally Added
**What goes wrong:** If Phase 2 implementation code registers physics colliders between remote `Player` instances and the `enemyGroup` (e.g., to give visual feedback), `hit()` would call `DataManager.updatePlayerCurrentHealth()` and corrupt the local HP bar.
**Mitigation:** Never register physics colliders for `#remotePlayers` against enemy groups. Remote player positioning is fully driven by network snapshots; simulated damage on remote clients is out of scope for Phase 2.

### Risk 3: `stateMachine.setState` on the Remote Player Triggering Unintended Side Effects
**What goes wrong:** Some states have `onEnter()` side-effects (e.g., `HurtState` plays a flash animation, `DeathState` starts the death sequence). If a remote player's state update arrives late or out of order, the remote client could briefly run a death animation.
**Current status:** For Phase 2 (no authoritative HP sync), remote players will not receive DEATH/HURT states via `PlayerUpdatePayload` unless the local player is actually in those states and broadcasting them. `buildLocalPlayerSnapshot()` reads `stateMachine.currentStateName` — so it can broadcast HURT/DEATH if the local player enters those states. This would trigger animations on remote clients' versions of that player. This is acceptable for Phase 2 (cosmetic only).
**Mitigation:** No change needed for Phase 2; document that full death/respawn sync is deferred to Phase 4.

### Risk 4: Tint Slot Non-Determinism
**What goes wrong:** With `slotIndex = this.#remotePlayers.size + 1`, the tint assigned to a player depends on message arrival order, not player identity. If 3+ players join and arrival order varies between clients, different clients see different color assignments for the same player.
**Mitigation (within agent's discretion):** Store `matchConfig` in GameScene from `NETWORK_LOBBY_STARTED`. When creating a remote player, look up their index in `matchConfig.players` for a consistent tint. This is a 2-line change.

### Risk 5: `lobby:assign-team` Only Accepted from Host
**What goes wrong:** A non-host client could emit `lobby:assign-team` if they bypass the UI-level gating (e.g., from browser devtools).
**Mitigation:** Server-side guard in `setPlayerTeam()` — verify `requesterSocketId` is the lobby's `hostPlayerId`. This is already in the recommended implementation.

---

## Recommended Plan Structure

### Plan 1 — Type System + Server Event (PLAN-01)
**Files:** `src/networking/types.ts`, `game-server/src/types.ts`, `game-server/src/lobby-manager.ts`, `game-server/src/server.ts`, `src/networking/network-manager.ts`

Tasks:
1. Add `team?: number` to `PlayerInfo` in both type files
2. Add `setPlayerTeam()` method to `LobbyManager`
3. Add `lobby:assign-team` handler in `server.ts`
4. Add `sendLobbyAssignTeam()` to `NetworkManager`
5. Verify `matchConfig.players` carries `team` through `lobby:started`

This plan has no UI changes and can be verified by unit tests.

### Plan 2 — LobbyScene Fix + Team Assignment UX (PLAN-02)
**Files:** `src/scenes/lobby-scene.ts`

Tasks:
1. Add `#isHost: boolean = false` field
2. Set `#isHost = true` when `sendLobbyCreate()` is called; reset in `#clearView()`
3. Fix `#showWaitingRoomView` host detection: `if (this.#isHost)` guards START button
4. Extend `#renderPlayerList` to show team badges (read-only, all clients)
5. For `#isHost` case: render Team A / Team B toggle buttons per player row
6. Wire toggle buttons to `NetworkManager.sendLobbyAssignTeam(player.id, team)`

### Plan 3 — GameScene: MatchConfig Storage + Consistent Tinting (PLAN-03)
**Files:** `src/scenes/game-scene.ts`

Tasks:
1. Store `matchConfig` in GameScene as `#matchConfig: MatchConfig | null = null`
2. Listen to `CUSTOM_EVENTS.NETWORK_LOBBY_STARTED` in `#setupNetworking()` to capture it
3. In `#onRemotePlayerUpdate`, when creating a new remote player: look up player in `#matchConfig.players` by `playerId` for deterministic tint (team-based if team is set, index-based otherwise)
4. Verify PLR-01: no player-role assumptions anywhere in GameScene
5. Verify PLR-02: remote player creation still uses `PLAYER_START_MAX_HEALTH` and never shares DataManager HP state

### Plan 4 — Verification + Smoke Test (PLAN-04)
**Files:** Tests and manual verification checklist

Tasks:
1. Write integration test: 2+ clients connect, each sees the other's movement (PLR-03)
2. Verify local HP bar depletes only for local player (HUD-01)
3. Verify each player's mana/HP is independent (PLR-02)
4. Verify N-player lobby list, team assignment, and match start flow (PLR-04)
5. Verify each client drives their own character from keyboard only (PLR-01)

---

## Environment Availability

Step 2.6: SKIPPED — all dependencies (Node.js, socket.io, Phaser 3, WebRTC) are already in use in the codebase and confirmed working from Phase 1.

---

## Sources

All findings from direct source-code inspection (HIGH confidence):
- `src/networking/types.ts` — PlayerInfo, MatchConfig, PlayerUpdatePayload
- `src/networking/network-manager.ts` — WebRTC mesh, localPlayerId timing, sendLobbyStart, lobby:started handler
- `game-server/src/types.ts` — server-side mirror
- `game-server/src/server.ts` — lobby:start creates matchConfig from `lobby.players`
- `game-server/src/lobby-manager.ts` — setMode host guard pattern (reusable for setPlayerTeam)
- `game-server/src/game-room.ts` — player slot tracking (no team awareness)
- `src/scenes/game-scene.ts` — `#remotePlayers`, `#setupNetworking`, `#onRemotePlayerUpdate` (full body read), `#PLAYER_TINT_PALETTE`, `#registerColliders` (remote players NOT in colliders)
- `src/scenes/lobby-scene.ts` — host detection bug on line ~202, `#renderPlayerList`, `#isHost` absence confirmed
- `src/scenes/ui-scene.ts` — `PLAYER_HEALTH_UPDATED` listener, HP hearts driven from EventBus only
- `src/game-objects/player/player.ts` — `isPlayer: true` always passed to super
- `src/game-objects/common/character-game-object.ts` — `hit()` calls `DataManager.updatePlayerCurrentHealth` only when `_isPlayer`
- `src/components/input/remote-input-component.ts` — `applySnapshot`, `getSnapshot` (not called anywhere)
- `src/components/game-object/life-component.ts` — `LifeComponent` is per-instance, no shared state
- `src/common/data-manager.ts` — `updatePlayerCurrentHealth` → emits `PLAYER_HEALTH_UPDATED`
- `src/common/event-bus.ts` — all `CUSTOM_EVENTS` confirmed
- `.planning/phases/02-multi-player-control/02-CONTEXT.md` — locked decisions, deferred items
