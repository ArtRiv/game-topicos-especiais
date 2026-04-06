# Phase 2: Multi-Player Control — Context

**Gathered:** 2026-03-30
**Status:** Ready for planning
**Source:** Roadmap approval + PRD-style requirements from new-milestone

---

<domain>
## Phase Boundary

Phase 2 delivers full multi-player control on top of the completed Phase 1 WebRTC networking foundation.

Every player controls their own mage on their own machine simultaneously. All remote players render correctly (position + animation) on every connected client. The lobby supports N players with team assignment. Each player has independent HP/mana and can see their own HP bar.

**Phase 1 already built (DO NOT rebuild):**
- WebRTC P2P mesh via socket.io signaling
- LobbyScene (connect → create/join → waiting room → host starts)
- Remote player position sync at 20 Hz via unreliable data channel (`NetworkManager.sendPlayerUpdate`)
- Spell relay via reliable data channel (`NetworkManager.sendSpellCast`)
- Fast disconnect detection via `game:player-disconnected` socket event
- `RemoteInputComponent` — drives remote player from position snapshots
- `CUSTOM_EVENTS.NETWORK_*` events on the EventBus

**What Phase 2 adds:**
- Each player's local character responds to their own keyboard (currently works; need to ensure no role-assumption bugs)
- Remote players render with correct animation state (walk/idle/cast) — the direction+state fix was applied in today's UAT
- Independent HP and mana per player (each player has their own stats, not shared)
- Own HP bar visible on HUD (each client shows their own HP only, per HUD-01)
- Lobby team assignment — lobby host assigns players to teams; N players, no hard cap
- All players treated generically (Player[i]), not fixed P1/P2 roles

</domain>

<decisions>
## Implementation Decisions

### Player Identity
- No fixed player roles — all players are `Player[i]` identified by `localPlayerId` (from `NetworkManager.localPlayerId`)
- Team assignment is done in the lobby/waiting room before match start and communicated via `MatchConfig`
- `MatchConfig.players` already carries `PlayerInfo[]` — teams can be added as a `team: number` field on `PlayerInfo`

### Multi-Player Control
- Local player: driven by `KeyboardComponent` (existing, unchanged)
- Remote players: driven by `RemoteInputComponent` (existing) — receives position snapshots and sets `stateMachine.setState(state)` + `direction` setter (fix applied in Phase 1 UAT)
- Each remote player instance is created on first `NETWORK_PLAYER_UPDATE` received; keyed by `playerId` in `#remotePlayers Map`

### Independent HP/mana
- Each `Player` instance already has its own `HealthComponent` and `ManaComponent`
- The local player's HP is tracked locally and in the host-auth model (Phase 4)
- For Phase 2: HP is independent per-player; no shared pool

### HUD — Own HP Only
- Per HUD-01: each client only shows their own HP bar
- Existing HUD scene already shows the local player's HP hearts — verify it still works with networking active
- Multi-player HUD (all players' HP) is explicitly deferred to future phases

### Team Assignment
- `PlayerInfo` type gains an optional `team: number` field (0-indexed team id)
- LobbyScene waiting room allows host to assign teams before starting
- `MatchConfig` carries team assignments to all clients
- Simple UI: toggle each player between Team A / Team B in the waiting room

### Player Count
- No hard cap in code — lobby.maxPlayers is configurable or unlimited
- `NetworkManager` WebRTC mesh scales to N peers; LAN testing will determine practical limits

### the agent's Discretion
- Visual distinction between teams (tint color already used for remote players — keep using per-slot tint, but group by team if possible)
- Lobby waiting room team assignment UX (simple toggle is fine)
- Whether to add player name labels above remote player sprites

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Networking (already built)
- `src/networking/network-manager.ts` — NetworkManager singleton; sendPlayerUpdate, sendSpellCast, localPlayerId, isConnected, startGameTick
- `src/networking/types.ts` — PlayerInfo, Lobby, MatchConfig, PlayerUpdatePayload, PlayerUpdateBroadcast, SpellCastPayload, SpellCastBroadcast, PlayerDisconnectedPayload
- `game-server/src/types.ts` — Server-side mirror of client types (keep in sync)
- `game-server/src/server.ts` — socket.io event handlers; lobby events, game relay events
- `game-server/src/lobby-manager.ts` — LobbyManager (create/join/leave/start)

### Player + State Machine
- `src/game-objects/player/player.ts` — Player class; stateMachine, manaComponent, spellCastingComponent, direction setter, tintColor config
- `src/game-objects/common/character-game-object.ts` — CharacterGameObject base; direction getter/setter, stateMachine public getter
- `src/components/state-machine/states/character/character-states.ts` — CHARACTER_STATES constants (IDLE_STATE, MOVE_STATE, CASTING_STATE, etc.)

### Input
- `src/components/input/remote-input-component.ts` — RemoteInputComponent; applySnapshot, getSnapshot, isMovementLocked=true
- `src/components/input/keyboard-component.ts` — KeyboardComponent (local player input)

### Scene Integration
- `src/scenes/game-scene.ts` — GameScene; #remotePlayers Map, #setupNetworking, #onRemotePlayerUpdate (direction+state fix applied), #onLocalSpellCast, #onRemoteSpellCast, #onRemotePlayerDisconnected
- `src/scenes/lobby-scene.ts` — LobbyScene; View A (connect), View B (lobby list), View C (waiting room); needs team assignment UI
- `src/scenes/scene-keys.ts` — SCENE_KEYS

### HUD + Common
- `src/scenes/ui-scene.ts` — UIScene HUD (existing HP hearts, mana bar)
- `src/common/event-bus.ts` — CUSTOM_EVENTS (NETWORK_* events, SPELL_CAST, etc.)
- `src/common/config.ts` — NETWORK_TICK_RATE_HZ, NETWORK_SERVER_URL, NETWORK_SERVER_PORT

### Planning
- `.planning/ROADMAP.md` — Phase 2 goal, requirements (PLR-01–04, HUD-01), success criteria
- `.planning/REQUIREMENTS.md` — Full v1.1 requirements

</canonical_refs>

<specifics>
## Specific Requirements

- PLR-01: Each player controls their own character on their own machine via keyboard — no fixed role assignments
- PLR-02: Each player has independent health and mana
- PLR-03: Remote players rendered via RemoteInputComponent snapshots on all clients
- PLR-04: Lobby supports N players; no hard cap; teams configurable per session
- HUD-01: Each player sees their own HP bar on their screen

**Success criteria (from ROADMAP.md):**
1. Each player connects, joins a lobby, and controls their own mage — no hardcoded role assignments
2. Every other player's mage moves in real time on all clients, driven by RemoteInputComponent snapshots
3. Each player has independent HP and mana; taking damage on one client doesn't affect others
4. Each player sees their own HP bar at all times during play
5. Lobby displays all connected players; supports N players no hard cap; teams configurable before match start

</specifics>

<deferred>
## Deferred Ideas

- Full multi-player HUD (all players' HP visible) — deferred to future phase
- Per-player spell loadout restrictions — system designed for it, not enforced in v1.1
- Player name tags above sprites — nice-to-have, implement if time allows
- FFA / battle royale mode — MTH-06 enables it; not building in v1.1

</deferred>

---

*Phase: 02-multi-player-control*
*Context gathered: 2026-03-30*
