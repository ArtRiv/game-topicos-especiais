# Phase 6: Foundation Cleanup - Research

**Researched:** 2026-04-21
**Domain:** Phaser 3 scene lifecycle, WebRTC mesh management, socket.io host migration, singleton state reset
**Confidence:** HIGH

## Summary

This phase addresses four distinct architectural debt items that block the lobby-to-rematch flow needed for v1.2. The codebase already has working patterns for EVENT_BUS bind/unbind in three scenes (GameScene, UIScene, LobbyScene) -- the work is standardizing those patterns to the remaining scenes and fixing the gaps. Host migration already works at the server level (LobbyManager.leaveLobby reassigns host) but the client has no reactive mechanism to detect host changes mid-match. Singleton managers have no reset methods, and the WebRTC mesh lifecycle is fully coupled to the socket.io connection.

All four requirements are code-only changes within the existing stack (Phaser 3.87, socket.io 4.8.3, browser WebRTC). No new dependencies are needed. The server-side changes are limited to broadcasting a `host-changed` event on disconnect and during match.

**Primary recommendation:** Tackle the four requirements in order of dependency -- EVENT_BUS cleanup first (foundational, unblocks scene transitions), then singleton resets (needed for rematch flow), then mesh teardown/rebuild (depends on clean singleton state), then host migration last (most complex, touches both client and server).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Server-assigned host migration -- the socket.io signaling server selects the new host (longest-connected player) when the current host disconnects. No client-side negotiation.
- **D-02:** Host migration works in both lobby AND mid-match. Mid-match: new host takes over damage validation and host-authoritative responsibilities.
- **D-04:** Keep socket.io signaling alive, tear down WebRTC mesh only. When players return to lobby after a match, all RTCPeerConnection and DataChannel instances are closed, but the socket.io connection stays alive for lobby communication. A new mesh is built when the next match starts.
- **D-05:** Manual per-scene bind/unbind -- keep the existing pattern (bind in `create()`, unbind in `shutdown()`) and fix the scenes that are missing cleanup. No new abstractions (no base class, no mixin).

### Claude's Discretion
- **D-03:** Singleton reset scope -- Claude determines what state gets wiped between matches based on what makes sense for the v1.2 lobby-to-rematch flow. The key constraint: a second match must start with clean defaults (FND-03 success criterion).

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | All Phaser scenes use consistent EVENT_BUS bind in create() and unbind in shutdown() -- no listener leaks across scene transitions | Scene audit completed: GameOverScene, RadialMenuScene, PreloadScene need cleanup hooks. GameScene/UIScene/LobbyScene are reference implementations. |
| FND-02 | Host detection is reactive -- derived from lobby state, not a static boolean; updates automatically on host migration | LobbyScene uses `#isHost: boolean = false` set only on lobby creation. Server already reassigns hostPlayerId in LobbyManager.leaveLobby() but doesn't broadcast during match. Server + client changes needed. |
| FND-03 | All singleton managers have reset() methods that restore clean state for rematch | DataManager, ElementManager, InventoryManager all need reset(). DataManager has partial `resetPlayerHealthToMin()`. Initial state values are in constructors -- reset methods must mirror them. |
| FND-04 | WebRTC mesh can be torn down independently of socket.io signaling connection -- enabling rematch without full reconnect | NetworkManager.disconnect() closes both socket.io and WebRTC. Need a new `teardownMesh()` method that only closes peer connections/data channels while keeping the socket alive. |
</phase_requirements>

## Architecture Patterns

### Current Scene Lifecycle Pattern (Reference)
```
LobbyScene -> PreloadScene -> GameScene + UIScene + RadialMenuScene -> GameOverScene
                                                                         |
                                                                         v
                                                                      GameScene (retry)
                                                                         OR
                                                                      window.location.reload() (quit)
```

### Pattern 1: EVENT_BUS Bind/Unbind (Reference Implementation)
**What:** Register listeners in `create()`, unregister in a SHUTDOWN event callback
**When to use:** Every scene that uses EVENT_BUS
**Source:** `src/scenes/game-scene.ts` lines 892-928, `src/scenes/ui-scene.ts` lines 104-114

```typescript
// In create():
EVENT_BUS.on(CUSTOM_EVENTS.SOME_EVENT, this.#handler, this);

this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  EVENT_BUS.off(CUSTOM_EVENTS.SOME_EVENT, this.#handler, this);
});
```
[VERIFIED: codebase grep -- GameScene and UIScene both use this exact pattern]

**Important:** Phaser's `Scenes.Events.SHUTDOWN` fires when `scene.start()` or `scene.stop()` is called. LobbyScene uses a `public shutdown(): void` method instead, which Phaser 3 calls as a lifecycle hook. Both approaches work, but `this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)` is the canonical Phaser 3 pattern. [ASSUMED -- Phaser 3 docs confirm `shutdown()` method is called as lifecycle hook, but `this.events.once(SHUTDOWN)` is the documented recommended pattern]

### Pattern 2: Singleton Reset
**What:** Add a `reset()` method that restores the singleton's state to constructor defaults without destroying the instance
**When to use:** Between matches (lobby-to-rematch flow)

```typescript
// Pattern for reset -- mirrors constructor initialization
export class DataManager {
  // ... existing singleton pattern ...

  public reset(): void {
    this.#data = {
      currentHealth: PLAYER_START_MAX_HEALTH,
      maxHealth: PLAYER_START_MAX_HEALTH,
      currentMana: PLAYER_MAX_MANA,
      maxMana: PLAYER_MAX_MANA,
      currentArea: {
        name: LEVEL_NAME.DUNGEON_1,
        startRoomId: 3,
        startDoorId: 3,
      },
      areaDetails: {
        DUNGEON_1: { bossDefeated: false },
        WORLD: {},
      },
    };
  }
}
```
[VERIFIED: codebase -- DataManager constructor at lines 48-65 defines initial state]

### Pattern 3: Mesh Teardown Without Socket Disconnect
**What:** Close all RTCPeerConnections and DataChannels while keeping socket.io alive
**When to use:** When returning to lobby after a match (FND-04)

```typescript
// New method on NetworkManager -- reuses existing #closeAllPeerConnections()
public teardownMesh(): void {
  this.stopGameTick();
  this.#closeAllPeerConnections();
  this.#lastSentSnapshot = null;
  this.#matchPlayers = [];
  // DO NOT call this.#socket.disconnect() -- keep signaling alive
}
```
[VERIFIED: codebase -- NetworkManager.disconnect() at lines 103-108 does exactly socket disconnect + mesh close. The mesh-only teardown is the same minus `this.#socket.disconnect()`]

### Pattern 4: Reactive Host Detection
**What:** Replace static `#isHost` boolean with state derived from server-pushed lobby updates
**When to use:** LobbyScene and any future scene needing host privilege checks

The current `#isHost` is set to `true` only in `#showLobbyListView` when the player clicks "CREATE LOBBY" (line 112). It's never updated if the host changes. The server already handles host reassignment in `LobbyManager.leaveLobby()` (line 56: `lobby.hostPlayerId = lobby.players[0].id`), but:
1. During match phase, the server does not broadcast host changes
2. The client has no event listener for host-changed during match
3. LobbyScene compares `#isHost` (a stale boolean) instead of checking `lobby.hostPlayerId === myPlayerId`

[VERIFIED: codebase -- LobbyScene line 19 `#isHost: boolean = false`, line 112 sets it, server lobby-manager.ts line 56 reassigns host]

### Anti-Patterns to Avoid
- **Re-creating singleton instances on reset:** Don't destroy and recreate the singleton. Other code holds references to `DataManager.instance`. Just reset internal state.
- **Using `EVENT_BUS.removeAllListeners()`:** This would break other scenes that have listeners still active (UIScene runs parallel to GameScene).
- **Relying on `once()` for SHUTDOWN in LobbyScene:** LobbyScene currently defines a `public shutdown()` method. If switching to `this.events.once(SHUTDOWN, ...)`, ensure it's registered in `create()` -- but the `once()` approach only fires once per scene start. If the scene is started multiple times, it must re-register. The current `public shutdown()` method is fine because Phaser calls it every time the scene stops.

## Scene Audit Results

### Scenes WITH proper EVENT_BUS cleanup:
| Scene | Pattern | Notes |
|-------|---------|-------|
| GameScene | `this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { ... })` | Full cleanup of 16 EVENT_BUS listeners + network cleanup |
| UIScene | `this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { ... })` | Cleans up 4 EVENT_BUS listeners |
| LobbyScene | `public shutdown(): void { ... }` | Cleans up 4 EVENT_BUS listeners, uses different pattern (method vs event) |

[VERIFIED: codebase grep of all scenes]

### Scenes MISSING EVENT_BUS cleanup:
| Scene | Uses EVENT_BUS? | Uses other subscriptions? | Action Required |
|-------|-----------------|--------------------------|-----------------|
| GameOverScene | No | No (uses KeyboardComponent) | Minimal -- no EVENT_BUS listeners to leak. But should add SHUTDOWN hook for future safety |
| RadialMenuScene | No | Uses `this.input.keyboard.once('keyup-CTRL', ...)` | The `once()` auto-removes after firing. `this.scene.stop()` cleans Phaser-managed listeners. Low risk. |
| PreloadScene | No | No | Transitions immediately to GameScene. No EVENT_BUS usage. No action needed. |

[VERIFIED: codebase -- read full source of all three scenes]

**Key finding:** The actual listener leak risk is LOW for scenes that don't use EVENT_BUS directly. The real risk is in LobbyScene's pattern when it transitions between views (lobby list -> waiting room) where listeners are swapped. The current code does handle this (lines 184, 225-226), but the pattern is fragile.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event listener tracking | Custom listener counting system | `EVENT_BUS.listenerCount(eventName)` | Phaser's EventEmitter (which extends Eventemitter3) has built-in `listenerCount()` for verification [ASSUMED -- Phaser 3 uses Eventemitter3 which supports this] |
| Host election algorithm | Custom consensus protocol | Server-assigned host (longest-connected = `lobby.players[0]` after filter) | D-01 locks this as server-authoritative |
| WebRTC reconnection | Custom reconnection logic | Rebuild mesh from scratch using existing `#initWebRTCMesh()` | Renegotiating existing connections is more complex and error-prone than clean teardown + rebuild |

## Common Pitfalls

### Pitfall 1: Stale `this` Context in Shutdown Callbacks
**What goes wrong:** Arrow functions used for EVENT_BUS handlers lose the `this` context needed for `off()` calls
**Why it happens:** `EVENT_BUS.off(event, handler, context)` requires the EXACT same function reference and context passed to `EVENT_BUS.on()`. Arrow function class fields (e.g., `#onLobbyUpdated = () => {}`) work because they're bound, but named method references need the `this` parameter.
**How to avoid:** Always use the three-argument form: `EVENT_BUS.on(EVENT, this.#method, this)` and `EVENT_BUS.off(EVENT, this.#method, this)`
**Warning signs:** Listener count increases after scene restart
[VERIFIED: codebase -- LobbyScene uses arrow function fields like `#onConnected = (): void => { ... }` while GameScene uses `this.#method` with `this` context parameter]

### Pitfall 2: SHUTDOWN vs Scene Restart Timing
**What goes wrong:** `this.events.once(SHUTDOWN, ...)` only fires once. If a scene is restarted (stopped then started again), the SHUTDOWN callback from the first start fires, but the second start needs to re-register it.
**Why it happens:** `once()` removes itself after first invocation. `create()` is called again on restart, so re-registering in `create()` is correct. But if `on()` is used instead of `once()`, the callback accumulates.
**How to avoid:** Always use `this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)` in `create()` -- it self-removes and `create()` re-registers it each time.
**Warning signs:** Multiple SHUTDOWN handlers firing on a single scene stop
[VERIFIED: codebase -- GameScene and UIScene both use `once()` correctly]

### Pitfall 3: Race Condition on Host Migration During Mesh Rebuild
**What goes wrong:** If the old host disconnects while a new mesh is being established (e.g., during rematch transition), the new host assignment arrives before the mesh is ready to handle host-authoritative messages.
**Why it happens:** WebRTC mesh setup is asynchronous (ICE negotiation takes time), but host migration events arrive instantly via socket.io.
**How to avoid:** Queue host-authoritative responsibilities until mesh is established. The new host should only begin validating damage after all peer connections are in `connected` state.
**Warning signs:** Damage events dropped or validated incorrectly in the first seconds after host migration
[ASSUMED -- based on WebRTC connection timing characteristics]

### Pitfall 4: NetworkManager State Leaks Between Matches
**What goes wrong:** `#matchPlayers`, `#socketToPlayerId`, `#lastSentSnapshot` retain data from the previous match
**Why it happens:** `teardownMesh()` closes connections but might not clear all match-specific state
**How to avoid:** Ensure `teardownMesh()` clears ALL match-related maps and state, not just connections
**Warning signs:** Old player IDs appearing in new match, or stale position data
[VERIFIED: codebase -- `#closeAllPeerConnections()` already clears peerConnections, channels, and socketToPlayerId maps, but does NOT clear `#matchPlayers`]

### Pitfall 5: LobbyScene `#isHost` State After Return from Match
**What goes wrong:** After a match ends and players return to lobby, `#isHost` is `false` for everyone because `shutdown()` resets it (line 38). The actual host must be re-derived from lobby state.
**Why it happens:** The boolean is set on lobby creation only, not on lobby re-entry
**How to avoid:** Derive host status reactively from `lobby.hostPlayerId === myPlayerId` instead of storing a boolean
**Warning signs:** No one has the START button after returning from a match
[VERIFIED: codebase -- LobbyScene.shutdown() line 38 sets `this.#isHost = false`]

## Code Examples

### Example 1: Singleton Reset Method for ElementManager
```typescript
// Source: codebase analysis of src/common/element-manager.ts
public reset(): void {
  this.#activeElement = ELEMENT.FIRE;
  // No event emission on reset -- downstream scenes haven't bound listeners yet
}
```
[VERIFIED: ElementManager constructor sets `this.#activeElement = ELEMENT.FIRE`]

### Example 2: Singleton Reset Method for InventoryManager
```typescript
// Source: codebase analysis of src/components/inventory/inventory-manager.ts
public reset(): void {
  this.#generalInventory = { sword: true };
  this.#areaInventory = {
    DUNGEON_1: { map: false, bossKey: false, compass: false, keys: 0 },
    WORLD: { map: false, bossKey: false, compass: false, keys: 0 },
  };
}
```
[VERIFIED: InventoryManager constructor lines 28-44]

### Example 3: Server-Side Host Migration Broadcast
```typescript
// In game-server/src/server.ts disconnect handler -- extend existing logic
socket.on('disconnect', () => {
  // ... existing room cleanup ...
  const lobby = lobbyManager.getLobbyBySocketId(socket.id);
  if (lobby) {
    const wasHost = lobby.players.find(p => p.socketId === socket.id)?.id === lobby.hostPlayerId;
    lobbyManager.leaveLobby(socket.id);
    // If the host left, the lobby now has a new hostPlayerId
    if (wasHost && lobby.players.length > 0) {
      io.to(`lobby:${lobby.id}`).emit('host:changed', { 
        newHostPlayerId: lobby.hostPlayerId 
      });
    }
  }
});
```
[VERIFIED: server.ts disconnect handler at lines 118-129, lobbyManager.leaveLobby at lines 39-61]

### Example 4: Listener Count Verification (for testing)
```typescript
// Verification pattern for FND-01 success criterion
const beforeCount = EVENT_BUS.listenerCount(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE);
// ... transition scenes multiple times ...
const afterCount = EVENT_BUS.listenerCount(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE);
assert(afterCount === beforeCount); // No leaks
```
[ASSUMED -- Phaser.Events.EventEmitter inherits from Eventemitter3 which has `listenerCount()`. Needs verification.]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-relay for all game data | WebRTC mesh for game data, socket.io for signaling only | Phase 1 (v1.0) | Mesh teardown is now separate concern from signaling |
| Single-player singletons | Multiplayer singletons (no reset) | Phase 2 (v1.1) | Reset methods needed for rematch flow |
| `window.location.reload()` for game restart | Scene transitions | Current approach in GameOverScene | Must be replaced with proper lobby return flow |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Phaser's EventEmitter supports `listenerCount()` method | Code Examples | LOW -- if not available, can use `listeners(event).length` instead or `eventNames()` for debugging |
| A2 | Phaser 3 calls `public shutdown()` as a lifecycle method on scene stop | Architecture Patterns | MEDIUM -- if not called automatically, LobbyScene's cleanup never runs. Verify by checking Phaser 3 Scene lifecycle docs. GameScene/UIScene use `this.events.once(SHUTDOWN)` which definitely works. |
| A3 | WebRTC ICE negotiation timing could cause race with host migration events | Pitfall 3 | LOW -- defensive coding (queue host responsibilities) handles this regardless |

## Open Questions

1. **How does Phaser 3 handle `public shutdown()` vs `this.events.once(SHUTDOWN)`?**
   - What we know: GameScene and UIScene use the event pattern; LobbyScene uses the method pattern. Both appear to work.
   - What's unclear: Whether Phaser calls `shutdown()` as a lifecycle hook the same way it calls `create()` and `update()`.
   - Recommendation: Standardize on `this.events.once(Phaser.Scenes.Events.SHUTDOWN, ...)` pattern since it's used by the majority of scenes and is the documented Phaser approach. Refactor LobbyScene to match.

2. **What is the full set of state to reset for FND-03?**
   - What we know: DataManager (health, mana, area, room data), ElementManager (active element), InventoryManager (area items, general items)
   - What's unclear: Are there other state holders? SpellCastingComponent has cooldown state, but that's per-instance (destroyed with scene). NetworkManager match state needs clearing.
   - Recommendation: Reset DataManager, ElementManager, InventoryManager, and NetworkManager match-specific state. Per-instance state (components) is destroyed with game objects when the scene shuts down.

3. **Should `lobby.status` be reset to `'waiting'` when players return from match?**
   - What we know: LobbyManager.startLobby() sets `status: 'in-progress'`. There's no method to reset it.
   - What's unclear: The return-to-lobby flow isn't implemented yet (that's partly what this phase enables).
   - Recommendation: Add a `resetLobbyStatus(socketId)` method or handle it in the match-end flow. This may be deferred to Phase 10 (Post-Match) but the server-side method should be added now for completeness.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (config exists at `vitest.config.ts`) |
| Config file | `vitest.config.ts` (client), `game-server/` has its own vitest via package.json |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run && cd game-server && npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-01 | EVENT_BUS listener count stable across scene transitions | unit | `npx vitest run src/scenes/event-bus-cleanup.test.ts -x` | No -- Wave 0 |
| FND-02 | Host migration updates client-side host status reactively | unit (server) + integration | `cd game-server && npx vitest run src/lobby-manager.test.ts -x` | Partial -- lobby-manager.test.ts exists, needs host migration during match tests |
| FND-03 | Singleton reset() restores clean defaults | unit | `npx vitest run src/common/data-manager.test.ts -x` | No -- Wave 0 |
| FND-04 | Mesh teardown keeps socket.io alive | unit | `npx vitest run src/networking/network-manager.test.ts -x` | Exists -- needs new test cases for teardownMesh() |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run && cd game-server && npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/common/data-manager.test.ts` -- covers FND-03 (DataManager.reset())
- [ ] `src/common/element-manager.test.ts` -- covers FND-03 (ElementManager.reset())
- [ ] `src/components/inventory/inventory-manager.test.ts` -- covers FND-03 (InventoryManager.reset())
- [ ] `game-server/src/lobby-manager.test.ts` -- add host migration during match tests for FND-02
- [ ] `src/networking/network-manager.test.ts` -- add teardownMesh() tests for FND-04

## Sources

### Primary (HIGH confidence)
- Codebase grep/read: All 6 scenes, 3 singleton managers, NetworkManager, server.ts, lobby-manager.ts, game-room.ts
- Existing tests: lobby-manager.test.ts, game-room.test.ts, network-manager.test.ts

### Secondary (MEDIUM confidence)
- Phaser 3 scene lifecycle (shutdown event vs shutdown method) -- based on observed patterns in codebase

### Tertiary (LOW confidence)
- Phaser EventEmitter `listenerCount()` availability -- assumed from Eventemitter3 API

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing code analyzed
- Architecture: HIGH -- all patterns verified against existing codebase
- Pitfalls: HIGH for items 1,2,4,5 (verified); MEDIUM for item 3 (assumed race condition)

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (stable codebase, no external dependency changes expected)
