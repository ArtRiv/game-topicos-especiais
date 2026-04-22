# Domain Pitfalls — v1.2 Lobby & Game Start Flow

**Domain:** Lobby management, matchmaking, pre-game flows, spawn systems, spectator mode, and real-time chat for a WebRTC P2P Phaser 3 game
**Stack:** Phaser 3 + TypeScript client / Node.js + socket.io signaling / WebRTC P2P mesh / Host-authoritative model
**Context:** 2-developer team, existing networking in `src/networking/`, existing LobbyScene with basic create/join/start flow
**Researched:** 2026-04-21
**Confidence:** MEDIUM (based on deep codebase analysis + domain expertise; web search unavailable for external verification)

---

## Critical Pitfalls

Mistakes that cause rewrites or major issues.

### Pitfall 1: Event Listener Leak Across Scene Transitions

**What goes wrong:** The existing `LobbyScene` binds listeners to `EVENT_BUS` (a global singleton) in view-switching methods and removes them in `shutdown()`. When adding new scenes (LobbyBrowserScene, PreGameScene, SpectatorScene, ChatOverlay), every scene that touches `EVENT_BUS` or `NetworkManager` events risks leaving dangling listeners when scenes restart, stop, or switch. Phaser 3's scene lifecycle calls `shutdown` on `scene.stop()` but NOT on `scene.restart()` -- and `destroy` is only called when the scene is removed from the scene manager entirely.

**Why it happens:** The current code already shows the risk pattern: `LobbyScene.#onLobbyUpdated` is bound in `#showLobbyListView()` and unbound in `#showWaitingRoomView()`, but if the scene restarts between those views, the old listener survives. Adding 10+ new scenes and overlays multiplies this fragile pattern. Phaser's lifecycle is `init -> preload -> create -> update (loop) -> shutdown (on stop) -> destroy (on remove)`. Developers assume `shutdown` always fires cleanly before `create` re-runs, but `scene.restart()` calls `shutdown` then `create` in sequence, and if cleanup is incomplete, listeners double-bind.

**Consequences:** Duplicate event handlers fire multiple times per event. Lobby updates trigger stale scene references. Memory grows with each lobby-to-game-to-lobby cycle. Ghost listeners from dead scenes mutate state in active scenes.

**Prevention:**
- Establish a strict pattern: ALL `EVENT_BUS.on()` calls happen in `create()`, ALL `EVENT_BUS.off()` calls happen in `shutdown()`. Never bind mid-lifecycle in view-switching methods.
- Add a `this.events.on('shutdown', () => this.#cleanup())` guard in every scene's `create()` as a safety net.
- For scenes that overlay (chat, spectator HUD), use `scene.sleep()`/`scene.wake()` instead of stop/start, which avoids the full lifecycle teardown.
- Add a debug assertion during development that counts EVENT_BUS listeners before and after each scene transition.

**Detection:** Console warnings about "possible EventEmitter memory leak". Duplicate network messages in logs. Actions firing twice (e.g., two lobby join attempts from one click). Check `EVENT_BUS.listenerCount()` at transition points.

**Phase to address:** First phase (lobby refactoring). Must be fixed before adding any new scenes.

---

### Pitfall 2: WebRTC Mesh Not Torn Down Between Matches (Rematch Leak)

**What goes wrong:** The current `NetworkManager` establishes WebRTC peer connections when `lobby:started` fires and tears them down on `disconnect()`. But the v1.2 rematch flow is: Lobby -> PreGame -> Match -> MatchEnd -> Lobby -> PreGame -> Match. If `NetworkManager.disconnect()` is NOT called between matches (because players return to lobby without disconnecting from the signaling server), stale `RTCPeerConnection` objects and data channels from the previous match persist while new ones are created for the next.

**Why it happens:** The current architecture conflates "connected to signaling server" with "in a WebRTC mesh". Looking at `network-manager.ts`: `#closeAllPeerConnections()` only runs inside `disconnect()`, which also kills the socket. The socket.io connection SHOULD persist across the lobby-match-lobby cycle, but the WebRTC mesh should be created per-match and destroyed at match end. There is no `teardownMesh()` method.

**Consequences:** Double peer connections per player pair. Messages sent on old channels reach dead scene handlers. Memory leak from unclosed `RTCPeerConnection` objects (each holds ICE agents, DTLS contexts, SCTP transports). Browser tab eventually crashes after 3-4 rematches.

**Prevention:**
- Split `NetworkManager` lifecycle into two scopes: socket-level (persists across lobby-match cycle) and mesh-level (created on match start, destroyed on match end).
- Extract `#closeAllPeerConnections()` into a public `teardownMesh()` method that closes all peer connections and channels WITHOUT disconnecting the socket.
- Call `teardownMesh()` when transitioning from match-end back to lobby.
- Add a guard in `#initWebRTCMesh()` that calls `teardownMesh()` first if `#peerConnections.size > 0`.

**Detection:** Check `#peerConnections.size` at match start -- if nonzero before `#initWebRTCMesh` runs, you have a leak. Monitor browser `chrome://webrtc-internals` during rematch cycles.

**Phase to address:** Pre-game / match lifecycle phase. Must be resolved before quick rematch is implemented.

---

### Pitfall 3: Lobby State Divergence Between Server and Clients

**What goes wrong:** The signaling server (`lobby-manager.ts`) is the source of truth for lobby state, but clients maintain local copies. The current `LobbyScene` stores `#currentLobby` and `#lobbies` locally, updated only when specific socket events arrive. With v1.2 adding password lobbies, ready-up, AFK detection, game mode configuration, ping indicators, and chat -- the surface area for state divergence explodes. If any `lobby:updated` event is missed during reconnection, or if a client joins mid-update, their local state is stale.

**Why it happens:** The current protocol sends incremental updates (`lobby:updated` with full lobby object) but has no version/sequence number and no mechanism for a client to request a full state refresh. The `lobby:list-updated` broadcast to ALL connected clients on every lobby mutation will also scale poorly with many simultaneous lobbies.

**Consequences:** Player sees 4 players in lobby, host sees 3. Ready-up states mismatch. Host starts match with players the server thinks aren't ready. AFK detection fires for players who are active (stale ping data). Game mode shown to joiner differs from what host selected.

**Prevention:**
- Add a `version` counter to each lobby that increments on every mutation. Clients can detect staleness.
- Implement a `lobby:sync` request that any client can call to get the full current lobby state.
- Rate-limit `lobby:list-updated` broadcasts -- batch changes and emit at most once per 500ms to reduce spam.
- For ready-up and AFK, treat the server as sole authority. Client UI is optimistic but reverts on server rejection.
- Consider switching the lobby browser to a pull model (client polls every 2s) instead of push, to avoid the broadcast scaling issue.

**Detection:** Periodic lobby state hash: client computes hash of local lobby state, server responds with its hash. Mismatch triggers full sync. Log any time a client action is rejected due to stale state.

**Phase to address:** Lobby system phase. Architecture decision needed before implementing ready-up, AFK, or chat.

---

### Pitfall 4: Host Migration Not Propagated to Client-Side Host Detection

**What goes wrong:** `LobbyManager.leaveLobby()` already handles host migration server-side (assigns first remaining player as new host). But the client-side `LobbyScene.#isHost` is set as a local boolean in `#showConnectView` based on whether the player called `sendLobbyCreate()`. This boolean is never updated when server-side host migration occurs. The new host never sees the "START GAME" button. With v1.2 adding host-only controls (kick, team assign, mode selection, auto-balance), a broken host migration freezes the entire lobby.

**Why it happens:** Looking at `lobby-scene.ts` line 204-206: `if (this.#isHost)` controls the START button visibility. `#isHost` is set on line 112 (`this.#isHost = true` in the create button callback) and never updated from server state. The `lobby:updated` handler re-renders the player list but never checks if the local player is now the host.

**Consequences:** Host leaves: remaining players are stuck with no start button, no kick controls, no mode selection. They must all leave and create a new lobby. During the match phase, host-authoritative damage validation also breaks because no client knows they are the new authority.

**Prevention:**
- Never store host identity as a client-side boolean. Always derive it reactively: `get isHost() { return this.#currentLobby?.hostPlayerId === myPlayerId }`.
- When the server assigns a new host (via `lobby:updated` with changed `hostPlayerId`), the client UI should automatically update -- start button appears for the new host, team controls enable.
- For in-match authority transfer, emit a distinct `match:authority-transferred` event so the new host's client begins processing damage validation.
- Add a 5-second grace period after host disconnect before transferring authority, allowing reconnection.

**Detection:** Test by force-closing the host's browser tab at every phase: in lobby, during loading, during match. If remaining players are stuck, host migration is broken.

**Phase to address:** Lobby refactoring phase (first priority). The `#isHost` boolean must be replaced with reactive derivation before any new host-only features are added.

---

### Pitfall 5: Spawn Point System Has No Validation Against Player Count or Map Geometry

**What goes wrong:** The current codebase uses Tiled maps with object layers (rooms, doors, chests, enemies). Spawn points will be added as another Tiled object layer. If spawn point data is missing, has fewer points than players, or has points inside collision geometry, the game silently spawns players at (0,0) or overlapping each other.

**Why it happens:** The existing `getTiledPropertyByName<T>()` uses unsafe generic casts with no runtime validation (documented in CONCERNS.md pitfall #11). Spawn points are map-authored data that must match runtime requirements (player count, team count, game mode), but there is no contract enforcement between map design and game logic.

**Consequences:** Players spawn inside walls and get stuck. Players spawn on top of each other and engage in combat before countdown ends. 10v10 mode selected but map only has 6 spawn points. FFA mode uses team spawn points, clustering opponents together.

**Prevention:**
- Define a `SpawnPointConfig` type: `{ x: number, y: number, team: 0 | 1 | null, index: number }`.
- Validate spawn points at map load time: assert count >= max players for selected mode, assert no point inside collision layer tiles, assert teams have balanced counts.
- Implement fallback spawn logic: if not enough spawn points, generate additional ones by offsetting from existing points in a spiral pattern.
- Spawn points should be mode-aware: FFA ignores team assignment, team mode uses team-tagged points.
- Add a dev-mode overlay that renders spawn point markers on the map for visual verification.

**Detection:** Warning log at PreloadScene if spawn count < max supported players for any mode. Visual overlay in debug builds.

**Phase to address:** Spawn system phase. Map validation should be built before the first pre-game loading screen.

---

## Moderate Pitfalls

### Pitfall 6: Ready-Up Race Condition at Match Start

**What goes wrong:** When adding ready-up, there is a window between "all players ready" and "host clicks start" where a player can un-ready or disconnect. If the host sends `lobby:start` and the server processes it, but between the server check and the `lobby:started` broadcast a player disconnects, the match starts with a phantom player who never connects their WebRTC channels.

**Prevention:**
- Server-side: re-validate all players are still connected AND still ready at the moment `lobby:start` is processed. Use a synchronous check within the same event loop tick.
- Include the exact player list in `lobby:started` payload (already done via `matchConfig.players`). Clients only attempt WebRTC mesh with players in that list.
- Add a "mesh readiness" phase: after `lobby:started`, each client reports `mesh:ready` when all their RTCPeerConnections reach `connected` state. Match countdown begins only when all clients report ready (or timeout).

**Phase to address:** Ready-up / match start flow phase.

---

### Pitfall 7: Spectator Mode as Full Mesh Participant Wastes Connections

**What goes wrong:** In a P2P mesh, a spectator must be a full mesh participant to receive WebRTC data from every player. This means a spectator counts toward the O(N^2) connection limit, consumes the same bandwidth as a player, and can even send messages (injection risk).

**Prevention:**
- Add a `role` field to `PlayerInfo`: `'player' | 'spectator'`. Peers check this before processing incoming messages. Spectator outbound channels are ignored.
- Better: relay-only spectating. Spectators connect only to the signaling server and receive game state via socket.io relay from the host. This avoids mesh overhead entirely and scales better.
- Limit spectator count (2-3 max) to avoid mesh explosion.
- For a college event: consider a single "projector spectator" that the host streams to via socket.io, rather than per-player spectator clients.

**Phase to address:** Spectator mode phase. Architecture decision needed before implementation.

---

### Pitfall 8: Chat Messages Flood WebRTC Reliable Channel (Head-of-Line Blocking)

**What goes wrong:** Adding in-game chat over the reliable WebRTC data channel (`events` channel) means text messages share the same ordered, guaranteed-delivery channel as spell casts, damage events, and death notifications. A burst of chat messages causes head-of-line blocking, delaying game-critical events.

**Prevention:**
- Route lobby chat through socket.io (already connected, appropriate for low-frequency lobby phase).
- Route in-game chat through a SEPARATE WebRTC data channel: `pc.createDataChannel('chat', { ordered: true })`. This isolates chat from game events.
- Simpler alternative: keep ALL chat on socket.io even during matches. Chat latency of 50-100ms is imperceptible for text. Avoids adding a third data channel per peer.
- Rate-limit chat: max 3 messages per second per player, server-enforced.

**Phase to address:** Chat feature phase. Decision: socket.io vs. dedicated data channel.

---

### Pitfall 9: Pre-Game Loading Screen Deadlock (No Timeout)

**What goes wrong:** The pre-game loading screen waits for ALL players to finish loading assets and initializing the game scene before starting the countdown. If one player has a slow machine or a browser that takes longer to parse assets, everyone waits indefinitely. If that player disconnects during loading, no timeout exists to proceed without them.

**Prevention:**
- Implement a loading timeout (30 seconds). If a player hasn't reported `loaded` by timeout, they are kicked and the match proceeds without them.
- Use a server-side loading coordinator: each client emits `match:loaded` when ready. Server tracks which clients have reported. When all report (or timeout hits), server emits `match:all-loaded`.
- Show per-player loading progress in the pre-game UI (via socket.io from each client).
- Handle the edge case: if the host is the one who times out, transfer authority before proceeding.

**Phase to address:** Pre-game loading phase.

---

### Pitfall 10: AFK Detection False Positives During Non-Interactive Phases

**What goes wrong:** AFK detection based on input inactivity will false-positive during pre-game loading (player is watching countdown, not providing input), during spectator mode (watching, not playing), and during match-end screen (reading results). Getting kicked for AFK while watching the countdown is infuriating.

**Prevention:**
- AFK detection active ONLY during lobby waiting and active gameplay. Disable during: pre-game loading, countdown, match-end, spectator mode.
- Use a phase-aware AFK controller: `{ phase: 'lobby' | 'loading' | 'countdown' | 'combat' | 'spectating' | 'matchEnd', afkEnabled: boolean }`.
- In lobby: generous threshold (60-90 seconds). In combat: shorter (30 seconds).
- ANY input (mouse move, key press) resets the timer, not just game-specific inputs.

**Phase to address:** AFK detection feature. Must be aware of match lifecycle phases.

---

### Pitfall 11: Kill Feed Ordering and Duplication in P2P Mesh

**What goes wrong:** In the host-authoritative model, kill events originate from the host and are broadcast to all peers via reliable data channel. Network latency means different clients receive events in different orders. If the host broadcasts "PlayerA killed PlayerB" and then "PlayerC killed PlayerD" 10ms apart, some clients display them in reverse order.

**Prevention:**
- Include a monotonically increasing sequence number in all kill/elimination events from the host.
- Client-side kill feed buffer: hold events for 100ms before displaying, sort by sequence number, deduplicate.
- For the host's own display, apply immediately (zero latency).

**Phase to address:** Kill feed feature phase.

---

### Pitfall 12: Quick Rematch Impossible Without Singleton Reset

**What goes wrong:** `DataManager`, `InventoryManager`, `ElementManager` are singletons with NO `reset()` method (documented in CONCERNS.md debt #3). Quick rematch flow (match-end -> lobby -> new match) leaves these singletons holding state from the previous match: HP values, mana pools, element assignments, room IDs. The new match starts corrupted.

**Why it happens:** These singletons were designed for a single-playthrough single-player game. The v1.1 networking additions did not address this because matches didn't loop back to lobby.

**Prevention:**
- Add a `reset()` static method to EVERY singleton manager BEFORE building the rematch flow. This is non-negotiable.
- Create a `MatchLifecycle.cleanup()` function that calls all reset methods in sequence.
- Test specifically: play a match, take damage, use mana, switch elements, rematch, verify all values are fresh.
- Long-term: convert singletons to scoped instances created per-match rather than global statics.

**Detection:** After rematch: check starting HP, mana, element assignment. If any differ from defaults, reset is broken.

**Phase to address:** Match lifecycle / cleanup phase. Must be resolved before quick rematch is implemented.

---

### Pitfall 13: Game Mode Selection Not Validated Against Player Count

**What goes wrong:** Host selects 5v5 mode but only 6 players are in the lobby. Or host selects 1v1 but 8 players are waiting. The current `startLobby()` in `lobby-manager.ts` has zero validation -- it just sets `status: 'in-progress'` and returns.

**Prevention:**
- Server-side validation in `startLobby()`: check `lobby.players.length` against the selected mode's requirements. Return an error if mismatched.
- Define a mode config: `{ '1v1': { min: 2, max: 2 }, '2v2': { min: 4, max: 4 }, ... '5v5': { min: 10, max: 10 }, 'ffa': { min: 2, max: 20 } }`.
- Client shows the error to the host and disables the start button when player count doesn't match mode.

**Phase to address:** Game mode selection phase.

---

### Pitfall 14: Private Lobby Passwords Leaked in Broadcast

**What goes wrong:** Adding password-protected lobbies. If the password is stored in the `Lobby` type and that object is broadcast via `lobby:list-updated` to ALL clients, every client can see every lobby's password in DevTools.

**Prevention:**
- Store password server-side only. NEVER include it in the `Lobby` type sent to clients.
- Add a `hasPassword: boolean` field to the client-facing lobby type. Password validation happens server-side on `lobby:join`.
- Use separate server-side and client-facing lobby types (already a good practice since `types.ts` is shared).

**Phase to address:** Lobby password feature.

---

## Minor Pitfalls

### Pitfall 15: Lobby Browser Shows Stale Data After Tab Backgrounding

**What goes wrong:** Browser tabs in the background have throttled timers and may miss socket.io events. When the player returns to the lobby browser tab, they see stale lobbies and try to join ones that no longer exist or are in-progress.

**Prevention:** On `document.visibilitychange`, re-request `lobby:list` from the server. Show a "refreshing..." indicator. Treat `lobby:error` on join as "lobby no longer available" and auto-refresh.

**Phase to address:** Lobby browser polish.

---

### Pitfall 16: Camera Zoom-In Animation Conflicts with Existing Camera System

**What goes wrong:** The pre-game countdown includes a camera zoom-in effect. If implemented as a Phaser camera tween, it conflicts with the existing room-transition camera tween system. If the match starts or a player disconnects mid-tween, the camera gets stuck at intermediate zoom.

**Prevention:** Use a dedicated camera controller that takes exclusive ownership during countdown. After countdown, hand control back to gameplay camera. Always reset zoom on any interruption.

**Phase to address:** Match countdown / pre-game phase.

---

### Pitfall 17: `io.emit('lobby:list-updated')` Broadcasts to ALL Connected Clients

**What goes wrong:** The current `server.ts` calls `io.emit('lobby:list-updated', { lobbies })` on EVERY lobby mutation (create, join, leave, mode change). This broadcasts the full lobby list to EVERY connected client, including those already in matches who don't need it. With 20 concurrent clients and frequent lobby activity, this creates unnecessary traffic.

**Prevention:**
- Only broadcast `lobby:list-updated` to clients who are in the "browsing" phase (not in a lobby or match). Use a socket.io room like `lobby-browsers` that clients join when viewing the lobby list and leave when they join a lobby.
- Alternatively, rate-limit the broadcast to once per 500ms with a dirty flag.

**Phase to address:** Lobby browser optimization.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Lobby refactoring | Event listener leaks (#1), host migration broken (#4) | Strict bind/unbind pattern, reactive isHost |
| Lobby creation/browsing | State divergence (#3), password leak (#14), stale data (#15), broadcast spam (#17) | Server as authority, separate server/client types, visibility refresh |
| Game mode selection | No player count validation (#13) | Server-side validation before match start |
| Team management | Host migration breaks controls (#4) | Derive host status reactively |
| Ready-up system | Race condition at start (#6), AFK false positives (#10) | Atomic server check, phase-aware AFK |
| Pre-game loading | Deadlock on slow loader (#9), singleton state leak (#12) | Loading timeout + kick, mandatory reset() methods |
| Spawn point system | Missing/invalid map data (#5), mode-spawn mismatch | Validate at load time, mode-aware spawn logic |
| Match countdown | Camera conflict (#16), event listener leaks (#1) | Exclusive camera controller, shutdown cleanup |
| Kill feed | Ordering in P2P (#11) | Sequence numbers from host, client-side buffer |
| Spectator mode | Full mesh overhead (#7), AFK false positives (#10) | Relay-only via socket.io, phase-aware AFK |
| Lobby chat | Channel flooding (#8) | Route via socket.io, not WebRTC reliable channel |
| In-game chat | Head-of-line blocking (#8) | Separate data channel or socket.io relay |
| AFK detection | False positives in non-interactive phases (#10) | Phase-aware activation |
| Quick rematch | Singleton state leak (#12), mesh not torn down (#2) | reset() methods, explicit teardownMesh() |
| WebRTC mesh lifecycle | Stale connections on rematch (#2) | Separate socket and mesh lifetimes in NetworkManager |

---

## Codebase-Specific Risks (Existing Debt Amplified by v1.2)

These are existing technical debt items from CONCERNS.md that v1.2 features will make significantly worse if not addressed.

| Existing Debt | v1.2 Feature That Amplifies It | Risk | Recommendation |
|---------------|-------------------------------|------|----------------|
| God-scene GameScene (1311 lines) | Adding spawn system, kill feed, spectator, countdown logic | HIGH -- will exceed 2000+ lines | Extract spawn, kill feed, and countdown into separate managers/systems before building features |
| No automated tests | 15+ new features with complex state interactions (lobby state machine, ready-up, AFK, host migration) | HIGH -- regressions guaranteed on every change | Add integration tests for lobby state machine at minimum |
| Singletons without reset() | Quick rematch flow | HIGH -- rematch impossible without fix | Add reset() to DataManager, InventoryManager, ElementManager first |
| Component access via string keys | Spectator mode (read-only component interaction) | MEDIUM -- spectator objects need different component config | Consider a `readonly` flag on components |
| EVENT_BUS has no typed contract | 10+ new event types for lobby, chat, kill feed, spectator, AFK, ready-up | MEDIUM -- typos in event names cause silent failures | Add all new events to CUSTOM_EVENTS enum with typed payloads |
| `LobbyScene.#isHost` as local boolean | Host-only controls for kick, mode, team, auto-balance, start | HIGH -- host migration silently fails | Replace with reactive derivation from lobby state |

---

## Sources

- Direct analysis of `src/networking/network-manager.ts` (440 lines, WebRTC mesh lifecycle)
- Direct analysis of `src/scenes/lobby-scene.ts` (313 lines, event binding patterns, #isHost boolean)
- Direct analysis of `game-server/src/lobby-manager.ts` (97 lines, host migration, no validation)
- Direct analysis of `game-server/src/server.ts` (145 lines, broadcast patterns, no start validation)
- Direct analysis of `src/networking/types.ts` (client-server type definitions)
- `.planning/codebase/CONCERNS.md` (existing technical debt)
- `.planning/codebase/ARCHITECTURE.md` (Phaser scene lifecycle, event bus, singleton patterns)
- `.planning/WebRTC Game Networking Architecture Analysis.md` (O(N^2) mesh scaling, bandwidth analysis)
- Domain expertise on WebRTC P2P networking, Phaser 3 scene lifecycle, socket.io multiplayer patterns (training data)
