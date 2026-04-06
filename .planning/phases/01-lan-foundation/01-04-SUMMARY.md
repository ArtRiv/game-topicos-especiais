# Phase 01-04 Summary — LobbyScene + main.ts wiring

## What Was Built
- `src/scenes/lobby-scene.ts` — `LobbyScene extends Phaser.Scene` with 3 sequential views:
  - **View A (Connect)**: IP input (`http://localhost:3000` default) + nickname input + CONNECT button → calls `NetworkManager.init(url).connect()`; listens for `NETWORK_CONNECTED` once
  - **View B (Lobby List)**: CREATE LOBBY button + paginated list of open lobbies (up to 6); each row is interactive → `sendLobbyJoin`; transitions to waiting room on `NETWORK_LOBBY_UPDATED` with single lobby
  - **View C (Waiting Room)**: Player list with color tints, host label; START GAME button visible to host → `sendLobbyStart()`; transitions to PreloadScene on `NETWORK_LOBBY_STARTED`
- `src/scenes/scene-keys.ts` — Added `LOBBY_SCENE: 'LOBBY_SCENE'`
- `src/main.ts` — Added `LobbyScene` import, registered in scene list, `game.scene.start(SCENE_KEYS.LOBBY_SCENE)`, added `dom: { createContainer: true }` to gameConfig (required for `this.add.dom()`)
- `src/components/input/remote-input-component.test.ts` — Fixed test: removed `playerId` from `applySnapshot` calls (not in the `Pick<PlayerUpdateBroadcast, ...>` type)

## Key Decisions
- DOM inputs (`this.add.dom(...)`) used for IP/nickname text fields → requires `dom: { createContainer: true }` in Phaser game config
- View objects tracked in arrays (`#viewObjects`, `#lobbyListContainer`, etc.) and destroyed on `#clearView()` — prevents Phaser scene object leaks
- `shutdown()` removes all EVENT_BUS listeners to avoid ghost handlers across scene restarts
- Startup scene changed from `PRELOAD_SCENE` to `LOBBY_SCENE`; PRELOAD_SCENE started by `LobbyScene#onLobbyStarted` on match begin

## Files Modified/Created
- **Created**: `src/scenes/lobby-scene.ts`
- **Modified**: `src/scenes/scene-keys.ts`, `src/main.ts`, `src/components/input/remote-input-component.test.ts`

## TypeScript Status
- `npx tsc --noEmit` — zero errors in `src/` files (only pre-existing `lib.dom.d.ts` / `node_modules` incompatibility errors from TS 5.7 + Node 18 type conflict)

## Checkpoint
Awaiting human verification: two browser tabs should be able to connect to a running game-server, meet in a lobby, and host starts the match transitioning both to the game.
