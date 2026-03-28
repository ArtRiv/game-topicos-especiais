# Phase 1: LAN Foundation - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning — but see ⚠️ note below

---

⚠️ **PROJECT PIVOT DETECTED** — During this discussion the user confirmed a full shift from the original 2-player cooperative design to an **N-player team PvP** design. The current ROADMAP.md (phases 2–5) was designed for co-op. Those phases must be rebuilt before planning Phase 2 onward. Phase 1 (LAN Foundation) is largely direction-agnostic and can be planned now since the networking infrastructure is needed regardless.

**Recommended action before planning Phase 2+:** Run `/gsd-new-milestone` to rebuild the roadmap around the PvP vision.

---

<domain>
## Phase Boundary

Set up a dedicated Node.js + socket.io server, a lobby system (create / list / join), and a `NetworkManager` client in the Phaser browser app. By the end of Phase 1, N players can connect on LAN, see each other's positions moving in real time, and room transitions are synchronized across all connected clients.

**Not in scope for Phase 1:** combat logic, team scoring, win conditions, game modes — those come after the connection foundation is solid.

</domain>

<decisions>
## Implementation Decisions

### Project Direction (Pivot)
- **D-01:** The game is now a **fully PvP** experience — players fight each other, not together against enemies.
- **D-02:** Win condition is **team deathmatch** — last team standing wins.
- **D-03:** The game supports **dynamic team modes** (1v1, 2v2, 3v3, etc.). The lobby host picks the mode based on how many players have joined. Example: 6 players in lobby → host can select 3v3.

### Lobby System
- **D-04:** Lobby flow: Player A **creates a lobby** (server registers it) → lobby appears **in a list** visible to players scanning for games → Player B **joins** from the list. No manual IP-per-game entry (players still need the server's IP to connect, but game sessions are browser-listed).
- **D-05:** The **host chooses the game mode** (and by implication team sizes) before starting the match.
- **D-06:** Players **choose their role / element set** in the lobby — not auto-assigned by connection order.

### Networking Transport
- **D-07:** Transport: **socket.io 4.x** (server) + **socket.io-client** (browser). Already decided in STATE.md.
- **D-08:** Server runtime: **Node.js 20** dedicated server in `game-server/` directory.
- **D-09:** Sync model: **full-state broadcast at 20 Hz**. Server-authoritative for enemies and authoritative game events.

### Client Architecture
- **D-10:** `NetworkManager` singleton in the Phaser client — isolated, does not pollute `GameScene` directly.
- **D-11:** `RemoteInputComponent` drives remote player characters from server-delivered state snapshots.
- **D-12:** Remote players are rendered with the **same 'Little Mage' sprite** but with a **per-player color tint** to distinguish them visually. Local player = no tint (or a neutral/highlight tint).

### Room Transitions
- **D-13:** Room transitions are synchronized server-side. When any player triggers a door, the server broadcasts the transition event. All connected clients execute the transition simultaneously.

### the agent's Discretion
- Exact color palette for player tints (server assigns tint per slot; agent picks readable distinct colors).
- Reconnect behavior details (timeout duration, UI message copy).
- Whether the server runs on a third "host" machine or on one of the players' machines — either works, agent picks the simpler setup for initial implementation.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Foundation
- `.planning/PROJECT.md` — project vision, constraints, validated capabilities, key decisions (NOTE: reflects old co-op direction; D-01 through D-03 above supersede the co-op references)
- `.planning/REQUIREMENTS.md` — v1 requirements list (NET-01 through NET-06, CORE-03 are in scope for Phase 1)
- `.planning/ROADMAP.md` — Phase 1 plan items and success criteria (phases 2–5 need rebuilding after pivot; use only Phase 1 section)

### Codebase Maps
- `.planning/codebase/ARCHITECTURE.md` — Entity-Component + HSM + EventBus architecture; read before designing NetworkManager
- `.planning/codebase/STACK.md` — tech stack, build commands, Phaser configuration
- `.planning/codebase/CONCERNS.md` — technical debt; critical: "Massive God-Scene" concern (§1) and "Planned Multiplayer Not Started" concern (§8) are directly relevant
- `.planning/codebase/INTEGRATIONS.md` — current external integrations (currently none — networking is a greenfield addition)

### Key Source Files
- `src/common/event-bus.ts` — global EventBus; NetworkManager should emit/listen via this
- `src/components/input/input-component.ts` — InputComponent interface; RemoteInputComponent must implement this
- `src/scenes/game-scene.ts` — core game scene (1311 lines); avoid adding networking logic directly here
- `src/common/config.ts` / `src/common/runtime-config.ts` — config pattern; server URL/port should follow this pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `InputComponent` interface (`src/components/input/input-component.ts`) — `RemoteInputComponent` must implement this to drive remote player characters
- `EVENT_BUS` (`src/common/event-bus.ts`) — NetworkManager should emit network events through this; UiScene and GameScene can listen without direct coupling
- `CharacterGameObject` (`src/game-objects/common/character-game-object.ts`) — Remote player will extend this; already has state machine, life, mana components
- Singleton pattern (DataManager, ElementManager) — `NetworkManager` should follow the same private constructor + static `#instance` pattern

### Established Patterns
- **Singleton managers:** Private constructor + `static #instance` — use for NetworkManager
- **Component system:** Components self-register via `object['_ComponentName']`; RemoteInputComponent should follow this
- **EventBus decoupling:** GameScene → UiScene communication is via EVENT_BUS, not direct refs — networking events should use the same pattern
- **Config constants:** Compile-time in `config.ts`, runtime-mutable in `runtime-config.ts` — server URL/port goes in config

### Integration Points
- `src/main.ts` — add a new `LobbyScene` (or `ConnectScene`) here; register before `PreloadScene` if connecting happens before game loads
- `src/scenes/game-scene.ts` — room transitions currently local; Phase 1 adds server-triggered transition broadcast
- `src/common/event-bus.ts` — add `PLAYER_JOINED`, `PLAYER_LEFT`, `PLAYER_POSITION_UPDATED`, `ROOM_TRANSITION` to `CUSTOM_EVENTS`

</code_context>

<specifics>
## Specific Ideas

- **Lobby screen should look like a modern game lobby** — not a raw IP input field. Players see a list of open lobbies, can create one, and join from the list. The host sees a "waiting for players" screen and a "Start" button once minimum players are connected.
- **Player identity in the lobby:** Each player chooses their element set / role before the match starts (not auto-assigned by connection order).
- **Server in `game-server/` directory** at project root (not inside `src/`).

</specifics>

<deferred>
## Deferred Ideas

- **N-player roadmap rebuild** — Phases 2–5 need to be redesigned for PvP team deathmatch. Original co-op content (puzzle rooms, shared boss strategy, NPC combo hints) needs new equivalents in a PvP context. Do this with `/gsd-new-milestone` after Phase 1.
- **Dynamic team mode selection logic** (e.g., auto-suggest mode based on player count, mode voting) — Phase 1 just needs "host picks from available modes."
- **Matchmaking / skill-based pairing** — out of scope for the event build entirely.
- **Spectator mode** — noted, deferred.
- **Original co-op content** (puzzle rooms, final boss requiring cross-player combos, NPCs hinting at co-op combos) — deferred; may become PvP-adapted versions in Phase 3–5 rebuild.

</deferred>

---

*Phase: 01-lan-foundation*
*Context gathered: 2026-03-27*
