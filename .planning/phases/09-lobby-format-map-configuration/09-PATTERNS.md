# Phase 9: Lobby Format & Map Configuration — Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 8 (5 modify, 1 new TS, 2 new assets)
**Analogs found:** 8 / 8 (all in-repo)

All new code mirrors existing patterns in the same files it modifies — this phase is an extension, not a greenfield addition. Every concrete excerpt below is copy-paste ready.

---

## File Classification

| File | New/Modified | Role | Data Flow | Closest Analog | Match Quality |
|------|--------------|------|-----------|----------------|---------------|
| `game-server/src/types.ts` | modify | shared types | n/a (type defs) | `game-server/src/types.ts` (existing `Lobby`, `MatchConfig`) | exact (self) |
| `game-server/src/lobby-manager.ts` | modify | service / state store | request-response (host-gated mutator) | `LobbyManager.setMode` / `setPlayerTeam` (same file) | exact (self) |
| `game-server/src/server.ts` | modify | controller (socket handler) | request-response → broadcast | `lobby:set-mode` / `lobby:assign-team` handlers (same file, lines 129–137) | exact (self) |
| `src/networking/types.ts` | modify | shared types (client mirror) | n/a | existing client `Lobby` / `MatchConfig` (same file) | exact (self) |
| `src/networking/network-manager.ts` | modify | service (socket client) | request-response | `sendLobbyAssignTeam` / `sendLobbySetMode` (same file, line 137) | exact (self) |
| `src/scenes/lobby-scene.ts` | modify | scene / UI controller | event-driven (EVENT_BUS) | `#showWaitingRoomView` + `#renderLobbyList` + `#renderPlayerList` (same file) | exact (self) |
| `src/scenes/preload-scene.ts` (or `assets.json`) | modify | preloader | file-I/O | existing level image entries in `assets.json` lines 318–334 | exact (self) |
| `public/assets/images/levels/world/thumbnail.png` & `dungeon_1/thumbnail.png` | new | asset | n/a | colocated with existing `world_background.png` etc. | n/a |

---

## Pattern Assignments

### `game-server/src/types.ts` (shared types) — extend `Lobby`, add `LobbyConfig` + `MAP_POOL`

**Analog:** the existing `Lobby` and `MatchState` declarations in the same file.

**Existing type-extension pattern** (lines 12–24):
```ts
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
```

**Existing const-typed enum pattern** (lines 90–94, mirrored as `as const` in `src/common/common.ts:23`):
```ts
export const COUNTDOWN_DURATION_MS = 3000;
export const FIGHT_HOLD_MS = 500;
```

**Apply for Phase 9:** Add a new `LobbyConfig` type beside `Lobby`; add `MAP_POOL` as a `readonly` exported array; extend `Lobby` with `config: LobbyConfig`; extend `MatchConfig` with `config: LobbyConfig` (or add a separate `config` field — see CONTEXT D-16 Discretion). Mirror **verbatim** to `src/networking/types.ts` per the file header comment ("Mirrored in src/networking/types.ts on the client — keep in sync when protocol changes.").

---

### `game-server/src/lobby-manager.ts` (service, request-response) — add `setConfig`

**Analog:** `LobbyManager.setMode` (lines 69–76) and `LobbyManager.setPlayerTeam` (lines 89–98) in the same file.

**Imports pattern** (line 2):
```ts
import type { Lobby, PlayerInfo } from './types.js';
```
Extend to: `import type { Lobby, PlayerInfo, LobbyConfig } from './types.js';`

**Default-on-create pattern** (lines 9–23, `createLobby`):
```ts
createLobby(socketId: string, playerName: string): Lobby {
  const playerId = randomUUID();
  const lobbyId = randomUUID();
  const player: PlayerInfo = { id: playerId, name: playerName, socketId };
  const lobby: Lobby = {
    id: lobbyId,
    hostPlayerId: playerId,
    players: [player],
    mode: null,
    status: 'waiting',
  };
  // [Phase 9 INSERT HERE] lobby.config = { format: '3v3', mapId: 'WORLD', maxPlayers: 6 };
  this.#lobbies.set(lobbyId, lobby);
  this.#socketToLobby.set(socketId, lobbyId);
  return lobby;
}
```

**Host-gate mutator pattern — CORE COPY** (`setMode`, lines 69–76):
```ts
setMode(socketId: string, mode: string): Lobby | null {
  const lobby = this.getLobbyBySocketId(socketId);
  if (!lobby) return null;
  const player = lobby.players.find(p => p.socketId === socketId);
  if (!player || player.id !== lobby.hostPlayerId) return null;
  lobby.mode = mode;
  return lobby;
}
```

**Host-gate with target validation** (`setPlayerTeam`, lines 89–98) — adds one more layer of validation, useful for `setConfig` since it also needs to validate the incoming `mapId` against `MAP_POOL` and the `format` against the capacity check:
```ts
setPlayerTeam(requesterSocketId: string, targetPlayerId: string, team: number): Lobby | null {
  const lobby = this.getLobbyBySocketId(requesterSocketId);
  if (!lobby) return null;
  const requester = lobby.players.find(p => p.socketId === requesterSocketId);
  if (!requester || requester.id !== lobby.hostPlayerId) return null;  // host-only
  const target = lobby.players.find(p => p.id === targetPlayerId);
  if (!target) return null;
  target.team = team;
  return lobby;
}
```

**Status-gate pattern** (`startLobby`, line 82) — for D-deferred "config edits only while `status === 'waiting'`":
```ts
if (lobby.status !== 'waiting') return null;
```

**Apply for Phase 9:**
```ts
setConfig(socketId: string, partial: Partial<LobbyConfig>): { ok: true; lobby: Lobby } | { ok: false; reason: string } {
  const lobby = this.getLobbyBySocketId(socketId);
  if (!lobby) return { ok: false, reason: 'No lobby' };
  if (lobby.status !== 'waiting') return { ok: false, reason: 'Match already in progress' };
  const player = lobby.players.find(p => p.socketId === socketId);
  if (!player || player.id !== lobby.hostPlayerId) return { ok: false, reason: 'Only the host can change lobby settings' };
  // validate mapId ∈ MAP_POOL, validate format, recompute maxPlayers,
  // reject if players.length > new maxPlayers (LBC D-11)
  // mutate lobby.config; return { ok: true, lobby }.
}
```
Return-shape note: existing mutators return `Lobby | null` — planner may either follow that and emit a separate `lobby:error` from the server handler on `null`, or adopt the discriminated-union shown above. Discriminated union is recommended because the reject case carries copy that the server handler needs to forward verbatim (LBC D-11: `Reduce players first (8 > 4 cap)`).

---

### `game-server/src/server.ts` (controller, request-response → broadcast) — add `lobby:set-config` handler

**Analog:** `socket.on('lobby:set-mode', ...)` (lines 129–132) and `socket.on('lobby:assign-team', ...)` (lines 134–137).

**Single-mutate-then-broadcast pattern — CORE COPY** (lines 129–137):
```ts
socket.on('lobby:set-mode', ({ gameMode }: { gameMode: string }) => {
  const lobby = lobbyManager.setMode(socket.id, gameMode);
  if (lobby) io.to(`lobby:${lobby.id}`).emit('lobby:updated', { lobby });
});

socket.on('lobby:assign-team', ({ targetPlayerId, team }: { targetPlayerId: string; team: number }) => {
  const lobby = lobbyManager.setPlayerTeam(socket.id, targetPlayerId, team);
  if (lobby) io.to(`lobby:${lobby.id}`).emit('lobby:updated', { lobby });
});
```

**Error-emit pattern** (line 103, inside `lobby:join` catch):
```ts
socket.emit('lobby:error', { message: (err as Error).message });
```
This is the existing `lobby:error` channel referenced by CONTEXT D-11; reuse it for the capacity-downshift reject.

**List-rebroadcast pattern** (lines 88, 101, 126, 245) — every mutator that changes a field visible in the lobby browser (`lobby:list-updated`) also broadcasts:
```ts
io.emit('lobby:list-updated', { lobbies: lobbyManager.listLobbies() });
```
Because LBC D-16 puts `format + mapId + capacity` in the browser row, **`lobby:set-config` MUST also `io.emit('lobby:list-updated', ...)` on success**, paralleling `lobby:join` / `lobby:leave`. The existing `lobby:set-mode` and `lobby:assign-team` handlers do NOT do this — they're not browser-visible. The new handler is.

**Match-config snapshot point** (line 153, inside `lobby:start`):
```ts
const matchConfig = { lobbyId: lobby.id, players: lobby.players, mode: lobby.mode ?? 'team-deathmatch' };
io.to(`lobby:${lobby.id}`).emit('lobby:started', { matchConfig });
```
Phase 9 extends `matchConfig` to carry `lobby.config` (or a deep-copied snapshot) so `LoadingScene` knows which `mapId` to preload (CONTEXT integration point line 120).

**Apply for Phase 9:**
```ts
socket.on('lobby:set-config', ({ config }: { config: Partial<LobbyConfig> }) => {
  const result = lobbyManager.setConfig(socket.id, config);
  if (!result.ok) {
    socket.emit('lobby:error', { message: result.reason });
    return;
  }
  io.to(`lobby:${result.lobby.id}`).emit('lobby:updated', { lobby: result.lobby });
  io.emit('lobby:list-updated', { lobbies: lobbyManager.listLobbies() });
});
```

---

### `src/networking/types.ts` (shared types, client mirror) — mirror server changes

**Analog:** the same file's existing mirror of `Lobby` / `MatchConfig` (lines 12–24).

**Mirroring rule** (file header, lines 1–2):
```ts
// Client-side network payload types.
// These mirror game-server/src/types.ts — keep in sync when protocol changes.
```

**Apply for Phase 9:** Copy `LobbyConfig`, `MAP_POOL` (and any `MapPoolEntry` helper type), the extended `Lobby.config` field, and the extended `MatchConfig.config` field **verbatim** from `game-server/src/types.ts`. No client-only additions.

---

### `src/networking/network-manager.ts` (service, request-response) — add `sendLobbySetConfig`

**Analog:** `sendLobbySetMode`, `sendLobbyAssignTeam` (line 137 region) — the one-line emit helpers in the "Lobby methods" block.

**Imports pattern** (lines 20–26):
```ts
import type {
  ...
  Lobby,
  MatchConfig,
  ...
  PlayerInfo,
} from './types.js';
```
Extend to add `LobbyConfig`.

**One-line emit helpers — CORE COPY** (lines 131–137):
```ts
sendLobbyCreate(playerName: string): void { this.#socket.emit('lobby:create', { playerName }); }
sendLobbyList(): void { this.#socket.emit('lobby:list'); }
sendLobbyJoin(lobbyId: string, playerName: string): void { this.#socket.emit('lobby:join', { lobbyId, playerName }); }
sendLobbyLeave(): void { this.#socket.emit('lobby:leave'); }
sendLobbySetMode(gameMode: string): void { this.#socket.emit('lobby:set-mode', { gameMode }); }
sendLobbyStart(): void { this.#socket.emit('lobby:start'); }
sendLobbyAssignTeam(targetPlayerId: string, team: number): void { this.#socket.emit('lobby:assign-team', { targetPlayerId, team }); }
```

**Apply for Phase 9:**
```ts
sendLobbySetConfig(config: Partial<LobbyConfig>): void { this.#socket.emit('lobby:set-config', { config }); }
```

**Inbound-listener note:** `lobby:updated` and `lobby:list-updated` are already wired (lines 241–247) and forward to `EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_UPDATED, ...)`. The new `config` field rides along in the existing payload — **no new socket listener required**, no new `CUSTOM_EVENTS` entry. This satisfies LBC-06.

**`lobby:error` listener gap:** The existing `network-manager.ts` does NOT bind `lobby:error` (grep confirms — only `server.ts` emits it; only `lobby-scene.ts:90` references error UX via `#statusText` on connect failure). Phase 9 MUST add:
```ts
this.#socket.on('lobby:error', (data: { message: string }) => {
  EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, data);
});
```
…plus a new `CUSTOM_EVENTS.NETWORK_LOBBY_ERROR` entry in `src/common/event-bus.ts` (follow the existing `NETWORK_*` enum pattern, line 29–36). This is the only NEW EVENT_BUS event the phase needs.

---

### `src/scenes/lobby-scene.ts` (scene / UI controller, event-driven) — host controls, capacity header, list row

**Analog (all in same file):** `#showWaitingRoomView` (lines 181–212), `#renderPlayerList` (lines 239–293), `#renderLobbyList` (lines 141–169).

**FONT / palette constants** (lines 7–13) — reuse all, add none:
```ts
const FONT = { fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#ffffff' };
const FONT_TITLE = { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#ffdd55' };
const FONT_SMALL = { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#cccccc' };
const FONT_SMALL_WHITE = { fontFamily: '"Press Start 2P"', fontSize: '8px', color: '#ffffff' };
const BTN_COLOR = 0x3355aa;
const BTN_HOVER = 0x4477cc;
const BTN_DISABLED = 0x223366;
```

**Host-gate pattern in UI** (lines 175–179 + line 201, 259):
```ts
get #isHost(): boolean {
  if (!this.#currentLobby) return false;
  const me = this.#currentLobby.players.find(p => p.socketId === this.#localSocketId);
  return me !== undefined && me.id === this.#currentLobby.hostPlayerId;
}

// ...
if (this.#isHost) { /* render host controls */ }
else { /* render read-only label */ }
```
This is the EXACT precedent for LBC D-10 ("Non-host view: read-only labels"). The team-A/team-B buttons (lines 259–292) vs. team-badge text branch is the model.

**DOM `<input>` creation pattern** (lines 53–55) — adapt to `<select>` for the format dropdown:
```ts
this.#ipInput = this.add.dom(cx + 30, cy - 50).createFromHTML(
  '<input type="text" value="localhost" style="width:160px;background:#111;color:#fff;border:1px solid #555;padding:4px;font-size:10px;font-family:monospace">'
);
```
Apply for Phase 9 — `<select>` with 10 `<option>` elements (1v1..10v10), same inline styling palette (background `#111`, color `#fff`, border `#555`, font 10px). Wire `change` listener inside `#showWaitingRoomView`:
```ts
const selectEl = (formatDom.node as HTMLElement).querySelector('select') as HTMLSelectElement;
selectEl.addEventListener('change', () => {
  NetworkManager.getInstance().sendLobbySetConfig({ format: selectEl.value as LobbyConfig['format'] });
});
```

**`#createButton` helper** (lines 296–306) — do NOT use for map preview cards (UI-SPEC says use custom border-highlight rectangle), but available for any other CTA:
```ts
#createButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
  const bg = this.add.rectangle(0, 0, label.length * 10 + 24, 28, BTN_COLOR).setInteractive();
  const text = this.add.text(0, 0, label, FONT_SMALL_WHITE).setOrigin(0.5);
  const container = this.add.container(x, y, [bg, text]);
  bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
  bg.on('pointerout', () => bg.setFillStyle(BTN_COLOR));
  bg.on('pointerdown', onClick);
  return container;
}
```

**Map preview card pattern** — adapt the player-row interactive-rect pattern (line 157):
```ts
const bg = this.add.rectangle(cx, rowY + 12, 380, 30, 0x223366).setInteractive();
bg.on('pointerover', () => bg.setFillStyle(BTN_HOVER));
bg.on('pointerout', () => bg.setFillStyle(0x223366));
bg.on('pointerdown', () => { /* … */ });
```
…combined with `this.add.image(x, y, thumbnailKey)` for the texture and a 2-px stroke for the selected-card highlight (UI-SPEC: gold `0xffdd55` selected, grey `0x444444` non-selected). Wrap in `this.add.container(...)` per UI-SPEC `Component Inventory` `MapPreviewCard`.

**View-objects bookkeeping pattern** (lines 195–196, 313–317):
```ts
this.#waitingRoomObjects = [title, subtitle, hint];
this.#viewObjects = [...this.#waitingRoomObjects];
// ...
this.#clearView(); // destroys all four object-arrays
```
Phase 9 host-controls block (format `<select>`, label, map cards, map label) MUST push every new GameObject onto `this.#waitingRoomObjects` (or a new `#configBlockObjects` array also cleared in `#clearView`) so scene shutdown doesn't leak DOM elements.

**`#renderLobbyList` row-content pattern** (lines 155–168) — extend with format + map + capacity:
```ts
this.#lobbies.slice(0, 6).forEach((lobby, i) => {
  const rowY = baseY + i * 36;
  const bg = this.add.rectangle(cx, rowY + 12, 380, 30, 0x223366).setInteractive();
  const label = this.add.text(cx - 185, rowY, `${lobby.players[0]?.name ?? '?'}\'s lobby`, FONT_SMALL_WHITE);
  const count = this.add.text(cx + 140, rowY, `${lobby.players.length} player(s)`, FONT_SMALL);
  // ...
});
```
Replace `count` text with the UI-SPEC row format: `${players[0].name}'s lobby — ${config.format} • ${displayName(config.mapId)} • ${players.length}/${config.maxPlayers}` (em dash U+2014, bullet U+2022, both literal in source). `displayName` is looked up in `MAP_POOL`.

**`#onWaitingRoomUpdate` re-render pattern** (lines 214–219) — already swaps the player list on every `lobby:updated`; Phase 9 must extend it to also re-render the capacity header and the read-only labels (non-host) and the `<select>` value (host, only when value differs from current selection to avoid clobbering an in-flight edit):
```ts
#onWaitingRoomUpdate = (data: { lobby?: Lobby }): void => {
  if (data.lobby) {
    this.#currentLobby = data.lobby;
    this.#renderPlayerList(data.lobby.players);
    // [Phase 9 INSERT HERE] re-render capacity header + config block
  }
};
```

---

### `src/scenes/preload-scene.ts` / `public/assets/data/assets.json` (preloader, file-I/O) — register thumbnails

**Analog:** existing world / dungeon_1 image entries in `assets.json` lines 318–334.

**Asset-pack image-entry pattern — CORE COPY** (lines 318–334):
```json
{
  "path": "assets/images/levels/world",
  "files": [
    { "type": "image", "key": "WORLD_BACKGROUND", "url": "world_background.png" },
    { "type": "image", "key": "WORLD_FOREGROUND", "url": "world_foreground.png" },
    { "type": "tilemapTiledJSON", "key": "WORLD_LEVEL", "url": "world.json" }
  ]
}
```

**Apply for Phase 9:** Add `{ "type": "image", "key": "MAP_THUMB_WORLD", "url": "thumbnail.png" }` (and the dungeon equivalent) to the existing `levels/world` and `levels/dungeon_1` packs. No changes to `preload-scene.ts` itself — the existing line 16 `this.load.pack(ASSET_PACK_KEYS.MAIN, 'assets/data/assets.json')` picks up the new entries automatically. Also add `MAP_THUMB_WORLD` / `MAP_THUMB_DUNGEON_1` to `src/common/assets.ts` (`ASSET_KEYS` enum — grep confirms convention) so callers reference the texture key by constant, not literal.

**Thumbnail-key convention:** UI-SPEC uses lowercase-kebab `map-thumb-world`; the codebase ASSET_KEYS convention is SCREAMING_SNAKE (`WORLD_BACKGROUND`). Planner SHOULD reconcile to `MAP_THUMB_WORLD` (SCREAMING_SNAKE) to match the existing convention; the `thumbnailKey` field in `MAP_POOL` then stores the same string the asset-pack `key` uses. UI-SPEC's `map-thumb-world` was illustrative.

---

## Shared Patterns

### Mirrored client/server types
**Source:** `game-server/src/types.ts` ↔ `src/networking/types.ts` (file header comment on both)
**Apply to:** every new type added in Phase 9 (`LobbyConfig`, `MAP_POOL`, the extended `Lobby` and `MatchConfig`)
**Rule:** every change to `game-server/src/types.ts` MUST land in `src/networking/types.ts` in the same commit. No client-only fields, no server-only fields.

### Host-gate guard
**Source:** `game-server/src/lobby-manager.ts` lines 73, 84, 93
**Apply to:** every server-side mutator that edits `Lobby` state on behalf of a player
```ts
const player = lobby.players.find(p => p.socketId === socketId);
if (!player || player.id !== lobby.hostPlayerId) return null;
```
**Client-side mirror:** `src/scenes/lobby-scene.ts:175-179` `get #isHost()` — gates rendering of interactive controls. The two together implement defense-in-depth: client hides the control, server rejects the call if the client lies.

### Single broadcast per state change
**Source:** `game-server/src/server.ts:131, 136` (`lobby:set-mode`, `lobby:assign-team`)
**Apply to:** `lobby:set-config` — exactly one `io.to('lobby:<id>').emit('lobby:updated', { lobby })` per successful mutation. No partial updates, no diff payloads. Satisfies LBC-06.

### Browser-visible state ⇒ also re-emit list
**Source:** `game-server/src/server.ts:88, 101, 126, 245`
**Apply to:** `lobby:set-config` — because `format` / `mapId` / `maxPlayers` are surfaced in the browser row (LBC D-16), the handler MUST also `io.emit('lobby:list-updated', ...)`. `setMode` and `assign-team` do NOT do this because those fields are not browser-visible.

### Reuse existing `lobby:error` channel
**Source:** `game-server/src/server.ts:103` (only existing emitter)
**Apply to:** capacity-downshift reject (LBC D-11). Wire a new client-side `lobby:error` listener in `network-manager.ts` → new `CUSTOM_EVENTS.NETWORK_LOBBY_ERROR` → display in `LobbyScene.#statusText` using existing `setColor('#ff4444')` precedent (line 79).

### Phaser `EVENT_BUS` pattern
**Source:** `src/common/event-bus.ts:4-36`, listener registration in `src/scenes/lobby-scene.ts:209-211`, cleanup in `lines 32-41`
**Apply to:** any new event in Phase 9. Cleanup in scene `SHUTDOWN` is mandatory — the existing scene already removes all five `NETWORK_*` listeners on shutdown; the new `NETWORK_LOBBY_ERROR` listener (if added by the scene) MUST be cleaned up alongside them.

---

## No Analog Found

None. Every file in this phase extends an existing file with patterns drawn from the same file or a sibling. Phase 9 is a pure extension phase — no new architectural surface.

---

## Metadata

**Analog search scope:**
- `game-server/src/` (3 files read in full: `types.ts`, `lobby-manager.ts`, `server.ts`)
- `src/networking/` (2 files read in full: `types.ts`, `network-manager.ts`)
- `src/scenes/` (`lobby-scene.ts` read in full; `preload-scene.ts` partial)
- `src/common/` (`common.ts` full, `event-bus.ts` head)
- `public/assets/data/assets.json` (level-pack section)

**Files scanned:** 8 source files + 1 asset manifest
**Pattern extraction date:** 2026-05-21
