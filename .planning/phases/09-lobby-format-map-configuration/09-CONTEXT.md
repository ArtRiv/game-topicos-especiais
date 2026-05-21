# Phase 9: Lobby Format & Map Configuration - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

The host configures match format (1v1 → 10v10) and map from the waiting room. Both selections are reflected on every client in real time. All lobby configuration lives on a single extensible object so future fields (timeLimit, friendlyFire, spellModifiers) can be added without protocol or event changes.

**In scope:** LBC-01..LBC-07 — format selector, capacity derivation, map picker, single config object on Lobby, single-event broadcast, extensible schema.

**Out of scope:** Ready-up toggle, AFK detection, host-kick of arbitrary players (all Phase 10). Time-limit / friendly-fire / spell-modifier *modes* (only the schema slots for them).

</domain>

<decisions>
## Implementation Decisions

### Config Object — Shape & Location
- **D-01:** Config lives on the existing `Lobby` type in `game-server/src/lobby-manager.ts` (mirrored on the client in `src/networking/types.ts`). It does **not** live on `GameRoom` — `GameRoom` is the per-match FSM and stays focused on state transitions. The literal LBC-05 phrase "GameRoom.config" is interpreted as "the single config object that the room's match runs with"; the object is owned by `Lobby` and snapshotted into `MatchConfig` at the `LOBBY → LOADING` transition.
- **D-02:** Schema is a **flat record**:
  ```ts
  type LobbyConfig = {
    format: '1v1' | '2v2' | '3v3' | '4v4' | '5v5' | '6v6' | '7v7' | '8v8' | '9v9' | '10v10';
    mapId: string;        // value from MAP_POOL
    maxPlayers: number;   // derived: parseInt(format) * 2
  };
  ```
  Future fields (`timeLimit?`, `friendlyFire?`, `spellModifiers?`) are added as optional top-level keys — no nesting, no version envelope.
- **D-03:** `format` is typed as a **string literal union** on the wire. Human-readable in logs, naturally enumerable, easy to validate. `maxPlayers` is derived server-side.
- **D-04:** Defaults at lobby creation: `format: '3v3'`, `mapId: 'WORLD'`, `maxPlayers: 6`. (Planner: confirm WORLD default against current `LEVEL_NAME` constants.)

### Broadcast
- **D-05:** Config changes reuse the existing `lobby:updated` socket event — no new event type. The server re-emits the full lobby (including the updated `config`) on every change. Client already listens to `lobby:updated` in `LobbyScene`; satisfies LBC-06 ("single event per change") with zero new plumbing.
- **D-06:** Config edits are host-gated server-side (same gate as `setMode` / `setPlayerTeam` in `LobbyManager`).

### Host UI Controls (Waiting Room)
- **D-07:** **Format selector:** compact DOM `<select>` with 10 options (1v1..10v10). Matches the existing DOM-input style used for IP/nickname in `LobbyScene`. Host-only.
- **D-08:** **Map picker:** side-by-side preview cards (one per `MAP_POOL` entry — currently 2). Each card shows the map's displayName and a thumbnail; selected card is highlighted. Host-only.
- **D-09:** **Capacity / lobby header line:** one subtitle in the waiting room visible to every player — `Players 3/6 — 3v3 on Open Field`. Updates on every `lobby:updated`.
- **D-10:** **Non-host view:** read-only plain-text labels (`Format: 3v3`, `Map: Open Field`). Matches the existing precedent where non-host sees a team badge instead of A/B buttons. No disabled-but-rendered controls.

### Capacity Downshift Behavior
- **D-11:** Server **rejects** format changes that would make `players.length > maxPlayers`. Returns a `lobby:error` (existing channel) with a short message: `Reduce players first (8 > 4 cap)`. Host removes players (after Phase 10's host-kick) or picks a larger format. No surprise kicks, no team-state to reshuffle.
- **D-12:** Individual player kick by host is **deferred to Phase 10** (folds naturally into LBC-11 host-kick of AFK-flagged players, generalized).

### Map Pool
- **D-13:** **Hardcoded `MAP_POOL` constant** mirrored in `game-server/src/types.ts` and `src/networking/types.ts`. Initial entries: `WORLD`, `DUNGEON_1` (from existing `LEVEL_NAME`). Server validates `mapId ∈ MAP_POOL` on every config edit.
- **D-14:** Each `MAP_POOL` entry carries `{ id, displayName, thumbnailKey }`:
  - `id` — wire identifier (compact, stable)
  - `displayName` — human-readable name shown in lobby UI ("Open Field", "Dungeon")
  - `thumbnailKey` — Phaser texture key for the preview thumbnail
- **D-15:** Thumbnails are loaded in `PreloadScene` from a known asset path (planner: pick path; the existing tilemap JSON for each map is in `public/assets/images/levels/<map>/`).

### Lobby Browser List
- **D-16:** Each lobby row in the browser shows format + map + capacity: `Host's lobby — 3v3 • Open Field • 3/6`. The config field travels for free in the existing `lobby:list-updated` payload. Big UX win for the event — joiners pick informed.

### Claude's Discretion
- Exact DOM/CSS styling of the format select, preview cards, and header line (within the existing FONT/BTN palette in `LobbyScene`).
- Specific thumbnail dimensions and asset path conventions.
- Where in the waiting-room layout the host controls sit (header area vs. dedicated panel) — UI-SPEC will refine.
- Naming inside the codebase (`LobbyConfig` vs `MatchConfig` reuse — note that `MatchConfig` already exists and currently flows `{ lobbyId, players, mode }` to `LoadingScene`; planner decides whether to extend `MatchConfig` to carry the full config or add a separate `config` field).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 9: Lobby Format & Map Configuration" — Goal, Depends on (Phase 7), Success Criteria (4).
- `.planning/REQUIREMENTS.md` §"Lobby Configuration (LBC)" lines 100–108 — LBC-01..LBC-07 acceptance criteria; out-of-scope notes for time-limit/friendly-fire on line 142.
- `.planning/PROJECT.md` §"Target features" — confirms extensible single-config-object architecture as a milestone goal.

### Server-side foundations to extend
- `game-server/src/lobby-manager.ts` — `Lobby` type (line ~12), `createLobby/joinLobby/setMode/setPlayerTeam` — host-gating pattern (`requester.id !== lobby.hostPlayerId`) to mirror for config edits.
- `game-server/src/game-room.ts` — `GameRoom` FSM; config is **not** placed here per D-01.
- `game-server/src/types.ts` — `Lobby`, `MatchConfig`, `MatchState` shared shape; add `LobbyConfig` and `MAP_POOL` here, mirror to client.
- `game-server/src/server.ts` lines 83–155 — `lobby:*` socket handlers; new `lobby:set-config` handler follows the `lobby:set-mode` / `lobby:assign-team` pattern (host gate → mutate → re-emit `lobby:updated`).

### Client-side foundations to extend
- `src/networking/types.ts` — mirror server `LobbyConfig`, `MAP_POOL`, extend `Lobby` (lines 12–18); decide on `MatchConfig` extension for the start-match snapshot.
- `src/scenes/lobby-scene.ts` — waiting-room UI (lines 181–235): add host controls, capacity header, read-only labels for non-host; reuse `#createButton` / FONT constants. Browser list at lines 141–169: extend row rendering with format+map+capacity.
- `src/networking/network-manager.ts` — add `sendLobbySetConfig(config)` paralleling `sendLobbyAssignTeam`.

### Asset surface
- `public/assets/images/levels/world/` and `public/assets/images/levels/dungeon_1/` — existing map directories whose names feed `MAP_POOL` initial entries.
- `src/common/common.ts` line 23 `LEVEL_NAME` — source of truth for the two existing map ids.

### Prior phase context
- `.planning/phases/07-loading-state-match-fsm-foundation/07-01-PLAN.md` — how `MatchConfig` flows `LOBBY → LOADING` today; Phase 9 must keep that flow intact (mapId reaches `LoadingScene`).
- `.planning/phases/08-countdown-state/08-RESEARCH.md` — recent precedent for typed server payloads + client mirroring.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`Lobby` type and `LobbyManager`** (`game-server/src/lobby-manager.ts`) — already has host-gated mutators (`setMode`, `setPlayerTeam`) and the broadcast pattern. New `setConfig(socketId, partialConfig)` follows the same shape.
- **`lobby:updated` socket event** — already serializes the full lobby to every member on team-assign and join/leave; carries the new `config` field for free.
- **`LobbyScene` DOM input pattern** (lines 53–60) — existing `<select>`-ready DOM helper for the format dropdown.
- **`#createButton` helper** (lines 296–306) — used for the per-card map selection click target.
- **`PlayerInfo.team` precedent** — host-only editable field that all clients see read-only; map this pattern to `LobbyConfig`.
- **`LEVEL_NAME`** (`src/common/common.ts:23`) — initial `MAP_POOL` entries derive from this constant.

### Established Patterns
- **Mirrored types client/server** — `src/networking/types.ts` and `game-server/src/types.ts` are kept in sync by hand. `LobbyConfig` and `MAP_POOL` follow the same pattern.
- **Host gate via `requester.id === lobby.hostPlayerId`** — duplicated across `setMode`, `setPlayerTeam`, `startLobby`. New `setConfig` uses the same check.
- **Single broadcast per state change** — every lobby mutator returns the updated `Lobby` and the server emits `lobby:updated` once. Config edits inherit this.
- **Per-tick / per-state server timestamps (`serverTs`)** — established in Phase 7/8 for FSM payloads; not required for config edits but planner can consider adding it for future debug.
- **No persistence** — all lobby state is in-memory (`Map` in `LobbyManager`); config inherits that.

### Integration Points
- **Server `server.ts`** — add `lobby:set-config` handler in the existing `socket.on('lobby:*', ...)` block (line 83–155).
- **Client `network-manager.ts`** — add `sendLobbySetConfig` next to `sendLobbyAssignTeam`.
- **Client `lobby-scene.ts`** — extend `#showWaitingRoomView` (host controls + capacity header) and `#renderLobbyList` (format/map/capacity per row).
- **`MatchConfig` → `LoadingScene`** — `lobby:started` payload (line 154 in server.ts) currently carries `{ lobbyId, players, mode }`; planner extends it to carry the full `LobbyConfig` so `LoadingScene` knows which map to preload.
- **`PreloadScene`** — loads map thumbnails for the preview cards (asset paths to be specified in PLAN.md).

</code_context>

<specifics>
## Specific Ideas

- **Capacity header copy:** `Players 3/6 — 3v3 on Open Field` (header line in waiting room; same line shown to host and non-host).
- **Browser list row copy:** `<Host>'s lobby — 3v3 • Open Field • 3/6` (replaces current `<Host>'s lobby (N players)` row in `#renderLobbyList`).
- **Reject error copy:** `Reduce players first (8 > 4 cap)` (sent via existing `lobby:error` channel when format downshift would exceed capacity).
- **Default config on lobby create:** `{ format: '3v3', mapId: 'WORLD', maxPlayers: 6 }`.
- **`MAP_POOL` initial entries:**
  ```ts
  const MAP_POOL = [
    { id: 'WORLD', displayName: 'Open Field', thumbnailKey: 'map-thumb-world' },
    { id: 'DUNGEON_1', displayName: 'Dungeon', thumbnailKey: 'map-thumb-dungeon-1' },
  ];
  ```
  (Planner: confirm displayNames against any existing in-game labels.)

</specifics>

<deferred>
## Deferred Ideas

- **Host-kick of arbitrary players** — generalize Phase 10's LBC-11 AFK-kick to any player; folds the Phase 9 capacity-downshift workflow into Phase 10.
- **Team auto-balance / auto-fill teams on format change** — currently team assignment is fully manual (Team A/B buttons per row). Auto-balance at 5v5+ is plausible polish but not in any LBC requirement; revisit in Phase 10 or a backlog item.
- **Mid-LOADING / mid-COUNTDOWN config changes** — server FSM only allows config edits while `lobby.status === 'waiting'`; mid-match changes are out of scope (planner: confirm `setConfig` is gated on status, mirroring `startLobby`'s `status !== 'waiting'` reject).
- **Server-discovered map manifest** — only useful if maps ship outside the build. Not needed while map authoring is out-of-scope.
- **`timeLimit` / `friendlyFire` / `spellModifiers` fields** — schema must accept them as optional top-level keys, but the *modes themselves* are explicitly out of v1.2 (REQUIREMENTS.md line 142).
- **Versioned config envelope** — overkill for in-memory event-day server; revisit if persistence is ever added.

</deferred>

---

*Phase: 09-lobby-format-map-configuration*
*Context gathered: 2026-05-21*
