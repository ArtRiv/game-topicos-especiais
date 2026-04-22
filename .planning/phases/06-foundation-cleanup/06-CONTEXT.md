# Phase 6: Foundation Cleanup - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix critical architectural debt — listener leaks, host detection, singleton resets, mesh lifecycle — so the codebase can support adding new scenes and features (Phase 7+ lobby enhancements, pre-game flow, in-match QoL) without cascading bugs.

This phase delivers NO new features. It makes the existing architecture safe for the features that follow.

</domain>

<decisions>
## Implementation Decisions

### Host Migration Policy
- **D-01:** Server-assigned host migration — the socket.io signaling server selects the new host (longest-connected player) when the current host disconnects. No client-side negotiation.
- **D-02:** Host migration works in both lobby AND mid-match. Mid-match: new host takes over damage validation and host-authoritative responsibilities. This is more robust for the college event where disconnects are likely.

### Singleton Reset Scope
- **D-03:** Claude's Discretion — Claude determines what state gets wiped between matches based on what makes sense for the v1.2 lobby-to-rematch flow. The key constraint: a second match must start with clean defaults (FND-03 success criterion).

### Mesh Teardown Boundary
- **D-04:** Keep socket.io signaling alive, tear down WebRTC mesh only. When players return to lobby after a match, all RTCPeerConnection and DataChannel instances are closed, but the socket.io connection stays alive for lobby communication. A new mesh is built when the next match starts. This enables quick rematch without full reconnect (FND-04).

### Event Bus Pattern
- **D-05:** Manual per-scene bind/unbind — keep the existing pattern (bind in `create()`, unbind in `shutdown()`) and fix the scenes that are missing cleanup. No new abstractions (no base class, no mixin). Consistent application of the existing convention across all scenes.

### Claude's Discretion
- Singleton reset scope: Claude has flexibility to decide what exactly gets wiped (HP, mana, element, inventory, cooldowns, position) — as long as the second match starts clean per FND-03.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — FND-01 through FND-04 define the four cleanup targets

### Codebase Architecture
- `.planning/codebase/CONCERNS.md` — Items #3 (singletons with no reset), #1 (god-scene), #8 (multiplayer architecture) directly relevant
- `.planning/codebase/CONVENTIONS.md` — Event Bus Conventions section defines the bind/unbind pattern to standardize
- `.planning/codebase/ARCHITECTURE.md` — Overall system architecture

### Source Files (Primary Targets)
- `src/common/event-bus.ts` — EVENT_BUS singleton and CUSTOM_EVENTS definitions
- `src/networking/network-manager.ts` — NetworkManager singleton, WebRTC mesh, socket.io coupling
- `src/common/data-manager.ts` — DataManager singleton, only has `resetPlayerHealthToMin()`
- `src/common/element-manager.ts` — ElementManager singleton, no reset method
- `src/components/inventory/inventory-manager.ts` — InventoryManager singleton, no reset method
- `src/scenes/lobby-scene.ts` — `#isHost` static boolean, host detection logic

### Scenes to Audit for EVENT_BUS Cleanup
- `src/scenes/game-scene.ts` — Already has bind/unbind (reference implementation)
- `src/scenes/ui-scene.ts` — Already has bind/unbind
- `src/scenes/lobby-scene.ts` — Already has bind/unbind
- `src/scenes/game-over-scene.ts` — Needs audit
- `src/scenes/radial-menu-scene.ts` — Needs audit
- `src/scenes/preload-scene.ts` — Needs audit

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **EVENT_BUS bind/unbind pattern**: GameScene, UIScene, LobbyScene all follow `EVENT_BUS.on()` in `create()` and `EVENT_BUS.off()` in `this.events.on('shutdown', ...)` — this is the reference pattern to standardize
- **NetworkManager._resetInstance()**: Test-only reset exists — can inform the production reset approach
- **DataManager.resetPlayerHealthToMin()**: Partial reset exists — needs to be expanded to full state reset

### Established Patterns
- **Singleton pattern**: All managers use `static #instance` with private constructor and `static get instance()` / `static getInstance()` accessor
- **Event registration**: Scenes register listeners in `create()` and unregister in a `shutdown` event handler
- **WebRTC mesh**: Peer connections stored in `Map<string, RTCPeerConnection>`, data channels in separate maps for reliable/unreliable

### Integration Points
- **Server-side (signaling server)**: Host migration requires server-side logic to detect host disconnect and broadcast new host assignment — this touches the socket.io server, not just the client
- **NetworkManager ↔ LobbyScene**: Host status flows from NetworkManager events to LobbyScene UI (start button, kick button visibility)
- **Singleton managers ↔ GameScene**: GameScene reads from DataManager, ElementManager, InventoryManager during `create()` — reset must happen before scene transition back to lobby

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for all four cleanup targets.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-foundation-cleanup*
*Context gathered: 2026-04-21*
