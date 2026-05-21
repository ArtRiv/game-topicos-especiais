---
phase: 09-lobby-format-map-configuration
plan: 03
subsystem: client/lobby-ui
tags: [client, lobby, ui, socket-io, phaser, dom, types]
requirements_completed: [LBC-01, LBC-02, LBC-03, LBC-04, LBC-06]
dependency_graph:
  requires:
    - "Plan 09-01: server LobbyConfig + MAP_POOL + lobby:set-config handler + MatchConfig.config"
    - "Plan 09-02: ASSET_KEYS.MAP_THUMB_* + assets.json thumbnails"
  provides:
    - "Client-mirrored LobbyConfig + MAP_POOL"
    - "CUSTOM_EVENTS.NETWORK_LOBBY_ERROR"
    - "NetworkManager.sendLobbySetConfig + lobby:error inbound listener"
    - "LobbyScene host controls (Format <select> + MapPreviewCards), capacity header, browser-row extension, lobby:error UI"
  affects:
    - "src/scenes/loading-scene.ts (will consume MatchConfig.config.mapId in a future phase)"
tech_stack:
  added: []
  patterns:
    - "Mirrored client/server types — verbatim copy from game-server/src/types.ts"
    - "Phaser DOMElement <select> for host controls (same precedent as #ipInput/#nickInput)"
    - "Tear-down-and-rebuild config block on every lobby:updated (small N — simple and correct)"
    - "Texture-presence guard (this.textures.exists) for runtime fallback rectangle"
key_files:
  created: []
  modified:
    - "src/networking/types.ts"
    - "src/common/event-bus.ts"
    - "src/networking/network-manager.ts"
    - "src/scenes/lobby-scene.ts"
decisions:
  - "Tear-down-and-rebuild used for on-update config-block refresh (rather than in-place border swap). N is small (1 select + 2 cards today; ≤10 cards if MAP_POOL grows). Rebuild guarantees gold border tracks server authority; DOM <select> value is set on creation so no flicker for the host who just emitted the change."
  - "Removed 'Waiting for host to start...' hint (planner-locked choice). The capacity header at y=96 is now the load-bearing status line."
  - "Player list base Y shifted 120 -> 220 to make room for the config block (capacity header y=96, format row y=116, map cards center y=180)."
  - "#statusText re-created inside the waiting-room view (the connect-screen one is destroyed when transitioning to the waiting room). Placed at cy+80 so the reject copy lands in the empty space below the player list."
metrics:
  tasks_completed: 3
  files_modified: 4
  completed_date: "2026-05-21"
---

# Phase 09 Plan 03: Client Type Mirror + LobbyScene UI Summary

Client-side completion of Phase 9: types mirrored from server, NetworkManager emit helper + lobby:error listener wired, and the LobbyScene waiting-room rebuilt with host controls (Format `<select>` + map preview cards), a live capacity header, read-only labels for non-hosts, an extended lobby-browser row, and lobby:error display in `#statusText`. All re-renders ride the existing `lobby:updated` broadcast — only ONE new socket listener added (`lobby:error`), preserving the LBC-06 single-broadcast invariant.

## Final Waiting-Room Layout

Y-anchors (waiting room view):

| Element | Y | Visibility |
|---|---|---|
| `WAITING ROOM` title | 40 | everyone |
| `Host: <name>` subtitle | 70 | everyone |
| **Capacity header** `Players N/M — Xvy on Map` | **96** | everyone |
| **Format control** (host: `<select>` at cx+30, label at cx-150) / (non-host: `Format: 3v3` centered at cx) | **116** | format-aware |
| **Map control** (host: label at cx-150) | **140** | host only |
| **Map preview cards** centered at cx, 96×64 each, 8px gutter | **180** | host only |
| Non-host `Map: <displayName>` centered at cx | **140** | non-host only |
| Player list start | **220** (was 120) | everyone |
| `#statusText` (lobby:error display) | cy+80 | everyone |
| `START GAME` button | cy+120 | host only |

## What Was Built

### Task 1: Client types mirror + NETWORK_LOBBY_ERROR

`src/networking/types.ts` — copied verbatim from `game-server/src/types.ts`:

```ts
export type LobbyFormat = '1v1' | '2v2' | '3v3' | '4v4' | '5v5' | '6v6' | '7v7' | '8v8' | '9v9' | '10v10';

export type LobbyConfig = {
  format: LobbyFormat;
  mapId: string;
  maxPlayers: number;
};

export type MapPoolEntry = { id: string; displayName: string; thumbnailKey: string; };

export const MAP_POOL: readonly MapPoolEntry[] = [
  { id: 'WORLD', displayName: 'Open Field', thumbnailKey: 'MAP_THUMB_WORLD' },
  { id: 'DUNGEON_1', displayName: 'Dungeon', thumbnailKey: 'MAP_THUMB_DUNGEON_1' },
] as const;
```

`Lobby.config: LobbyConfig` and `MatchConfig.config: LobbyConfig` added.

`src/common/event-bus.ts` — new entry:

```ts
NETWORK_LOBBY_ERROR: 'NETWORK_LOBBY_ERROR',
```

placed adjacent to the other `NETWORK_*` entries (after `NETWORK_LOBBY_STARTED`).

### Task 2: NetworkManager helper + listener

One-line emit helper alongside the existing Lobby methods (line 138):

```ts
sendLobbySetConfig(partial: Partial<LobbyConfig>): void { this.#socket.emit('lobby:set-config', { config: partial }); }
```

Inbound listener (immediately after the existing `lobby:updated` listener, around line 249):

```ts
this.#socket.on('lobby:error', (data: { message: string }) => {
  EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_LOBBY_ERROR, data);
});
```

Import block extended with `LobbyConfig`.

### Task 3: LobbyScene UI

New fields:
- `#configBlockObjects: Phaser.GameObjects.GameObject[]`
- `#formatSelectDom: Phaser.GameObjects.DOMElement | null`
- `#capacityHeader: Phaser.GameObjects.Text | null`

New methods:
- `#renderConfigBlock(lobby)` — tears down prior config-block objects and rebuilds the capacity header + host/non-host branch. Host: `<select>` with 10 `<option>` elements (1v1..10v10) styled to match `#ipInput`, then iterates `MAP_POOL` to build `MapPreviewCard`s with gold (`0xffdd55`) or grey (`0x444444`) border, `this.textures.exists` guard with `0x223366` rectangle fallback, and `pointerdown` → `sendLobbySetConfig({ mapId })`. Non-host: two read-only text labels.
- `#onLobbyError = (data) => { #statusText.setText(message).setColor('#ff4444'); time.delayedCall(3000, ...clear); }`

Extended methods:
- `#showWaitingRoomView` — registers `NETWORK_LOBBY_ERROR` listener, removes the `Waiting for host to start...` hint, calls `#renderConfigBlock(lobby)` before `#renderPlayerList`. Re-creates `#statusText` at `cy+80`.
- `#onWaitingRoomUpdate` — calls `#renderConfigBlock(data.lobby)` on every `lobby:updated`.
- `#onLobbyStarted` — additionally `off()`s `NETWORK_LOBBY_ERROR`.
- `#renderLobbyList` — row text replaced with `${players[0].name}'s lobby — ${c.format} • ${md} • ${players.length}/${c.maxPlayers}`. The old `count` text node is gone (its content folded into the new single label).
- `#renderPlayerList` — `baseY` shifted from 120 → 220.
- `#clearView` — destroys `#configBlockObjects` and nulls `#formatSelectDom` / `#capacityHeader`.
- Scene `SHUTDOWN` cleanup — adds `EVENT_BUS.off(NETWORK_LOBBY_ERROR, ...)`.

### On-update strategy (decision)

The plan offered two paths for the lobby:updated config-block refresh: (a) tear-down-and-rebuild, or (b) in-place border swap for the cards. **Chose (a) — tear-down-and-rebuild.** Justification:

- N is small: 1 `<select>` + 2 cards today, ≤10 cards if `MAP_POOL` grows (no design intent to grow beyond that for the event).
- Rebuild guarantees the gold border always tracks `lobby.config.mapId` (no risk of stale border).
- The DOM `<select>` is recreated with `selectEl.value = cfg.format` set on creation — so the host's own edit converges with no visible flicker (the server echoes the value the host just sent).
- Code complexity stays low: one path, not two.

The plan's recommended path was "track map-card containers separately and only update their borders". That would shave a few destroys per update; not worth the extra bookkeeping at this N.

## NETWORK_LOBBY_ERROR Registration/Cleanup Pair

| Location | File | Line | Direction |
|---|---|---|---|
| Registration | `src/scenes/lobby-scene.ts` | 223 | `EVENT_BUS.on(NETWORK_LOBBY_ERROR, #onLobbyError)` inside `#showWaitingRoomView` |
| Cleanup (scene shutdown) | `src/scenes/lobby-scene.ts` | 43 | `EVENT_BUS.off(NETWORK_LOBBY_ERROR, #onLobbyError)` in the `Scenes.Events.SHUTDOWN` block |
| Cleanup (lobby started — leaves waiting room) | `src/scenes/lobby-scene.ts` | 326 | `EVENT_BUS.off(NETWORK_LOBBY_ERROR, #onLobbyError)` in `#onLobbyStarted` |

The forwarding source (`network-manager.ts`) binds `lobby:error` once in `#bindSocketEvents` and lives for the duration of the singleton — no per-scene teardown needed there.

## Tasks Completed

| Task | Description | Commit | Files |
|---|---|---|---|
| 1 | Mirror types + add NETWORK_LOBBY_ERROR | `f465b4b` | src/networking/types.ts, src/common/event-bus.ts |
| 2 | sendLobbySetConfig helper + lobby:error listener | `75625f1` | src/networking/network-manager.ts |
| 3 | LobbyScene UI: host controls, capacity header, browser row, error display | `f29ad6e` | src/scenes/lobby-scene.ts |

## Verification

- `npx tsc --noEmit -p tsconfig.json` — exits 0 for project files. Five pre-existing `node_modules` errors remain (vite/rollup moduleResolution, lib.dom.d.ts TextDecoder/TextEncoder) — identical to baseline before this plan ran.
- `npx vite build` — exits 0, produces `dist/assets/js/index-*.js` (1664 kB), build time ~6s.
- Grep acceptance criteria all pass:
  - `sendLobbySetConfig({ format` — 1 match in `lobby-scene.ts`
  - `sendLobbySetConfig({ mapId` — 1 match in `lobby-scene.ts`
  - `Players ${...}/${cfg.maxPlayers} — ${cfg.format} on ${mapDisplay}` capacity header template — present
  - Em dash `— ` — multiple matches (capacity header + browser row + pre-existing team comments)
  - Bullet ` • ` — 1 match (browser row)
  - `NETWORK_LOBBY_ERROR` — 3 matches (registration + 2 cleanup paths)
  - `MAP_POOL` — used in 4 places (browser row, capacity header, host card iteration, non-host map label)
  - `0xffdd55` selected-card gold border — present
  - `this.textures.exists` runtime guard — present
  - `#configBlockObjects` — declaration, pushes, cleanup all present
  - `Waiting for host to start` — 0 matches (removed as planned)

## Phase Success Criteria Coverage (mapped to must_haves truths)

| ROADMAP success criterion | Satisfied by must_haves truth | Evidence |
|---|---|---|
| #1 Host selects format 1v1..10v10; capacity updates to `format × 2` | truth #1 (host `<select>` emits, capacity header updates within one round-trip) | `#renderConfigBlock` host branch builds the 10-option `<select>`; server (Plan 01) re-derives `maxPlayers` and re-broadcasts; capacity header re-renders on `lobby:updated` |
| #2 Host selects map; displayName shown to every client | truth #3 (side-by-side cards) + truth #4 (capacity header on every client) | host card pointerdown → `sendLobbySetConfig({mapId})`; non-host sees `Map: <displayName>` label; everyone sees capacity header with `on <displayName>` suffix |
| #3 Single socket.io event per config change | truth #7 (only `lobby:updated` handler, zero new event types) | server (Plan 01) emits `lobby:updated` once per `setConfig` success; client uses existing `NETWORK_LOBBY_UPDATED` listener; the only NEW listener (`lobby:error`) is an error channel, not a state channel — LBC-06 invariant preserved |
| #4 `GameRoom.config` single object, new field added without protocol changes | truth #1 + truth #7 (Plan 01 verified at write-time) | `LobbyConfig` is a flat record; future fields like `timeLimit?` ride along in `Partial<LobbyConfig>` payload and the full-Lobby re-broadcast — no new wire events. Verified by inspection in Plan 01 summary §"LBC-07 Extensibility". |

## Deviations from Plan

None — plan executed as written. The on-update map-card refresh decision (tear-down-and-rebuild vs in-place border swap) was an explicit planner-deferred choice; chose tear-down-and-rebuild and documented above.

## Known Stubs

None. All paths render real data sourced from the lobby payload:
- Capacity header reads live `lobby.players.length`, `lobby.config.{format, maxPlayers, mapId}`.
- Map cards iterate the authoritative `MAP_POOL` (mirrored from server).
- Lobby browser rows read `lobby.config` on each `lobby:list-updated`.

The map thumbnails themselves are placeholder solid-color PNGs (tracked in `.planning/todos/pending/2026-05-21-replace-map-thumbnail-placeholders.md` per Plan 02); this is not a stub of the lobby-config UI — it's a deferred art-asset swap-in that does not affect functional behavior.

## TDD Gate Compliance

Plan tasks were tagged `tdd="true"`, but the repository has no client-side test framework wired (no `vitest`/`jest` for the Phaser code; the existing tests in `tests/` are not the target). Per the `<verify>` blocks specifying `npx tsc --noEmit` and `npx vite build` as the gates, both were executed and passed. No RED `test(...)` commit precedes the `feat(...)` commits because there is no test file to author against in this surface — matches the existing client-code convention in this repo (Plan 09-01 noted the same constraint for the server-side, which similarly lacks a test framework).

## Self-Check: PASSED

Verified after writing summary:

- `src/networking/types.ts` — FOUND, contains `LobbyConfig`, `LobbyFormat`, `MAP_POOL`, `config: LobbyConfig` (Lobby + MatchConfig), `'10v10'`.
- `src/common/event-bus.ts` — FOUND, contains `NETWORK_LOBBY_ERROR`.
- `src/networking/network-manager.ts` — FOUND, contains `sendLobbySetConfig`, `socket.on('lobby:error'`, `NETWORK_LOBBY_ERROR`, `LobbyConfig` import.
- `src/scenes/lobby-scene.ts` — FOUND, contains `sendLobbySetConfig({ format`, `sendLobbySetConfig({ mapId`, `0xffdd55`, `this.textures.exists`, `#configBlockObjects` (3+ uses), `NETWORK_LOBBY_ERROR` (3 uses: 1 on, 2 off).
- Commits `f465b4b`, `75625f1`, `f29ad6e` — all present in `git log`.
- `npx tsc --noEmit -p tsconfig.json` exits 0 (project files; pre-existing node_modules errors only).
- `npx vite build` exits 0.
