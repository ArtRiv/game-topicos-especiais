# Phase 6: Foundation Cleanup - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 06-foundation-cleanup
**Areas discussed:** Host migration policy, Singleton reset scope, Mesh teardown boundary, Event bus pattern

---

## Host Migration Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Server assigns | Socket.io signaling server picks the next host (longest-connected player). Simple, deterministic, no client negotiation. | ✓ |
| First joiner fallback | Player who joined earliest becomes host. Pure client-side, no server change needed. | |
| You decide | Claude picks based on codebase constraints. | |

**User's choice:** Server assigns
**Notes:** None

| Option | Description | Selected |
|--------|-------------|----------|
| Lobby + match | Host privileges transfer in both contexts. Mid-match: new host takes over damage validation. | ✓ |
| Lobby only | If host disconnects mid-match, the match ends. Simpler but matches are short. | |

**User's choice:** Lobby + match
**Notes:** None

---

## Singleton Reset Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full reset | Wipe everything: HP, mana, element selection, inventory, spell cooldowns, position. | |
| Preserve element choice | Reset HP/mana/cooldowns/position but keep selected element across matches. | |
| You decide | Claude picks based on what makes sense for v1.2 lobby flow. | ✓ |

**User's choice:** You decide (Claude's discretion)
**Notes:** Key constraint is FND-03 — second match must start with clean defaults.

---

## Mesh Teardown Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Keep signaling, tear down mesh | Socket.io stays alive (lobby comms), WebRTC peers closed. New mesh built for next match. | ✓ |
| Tear down everything | Close both socket.io and WebRTC, reconnect fresh for each match. Simpler but slower. | |
| You decide | Claude picks based on networking architecture. | |

**User's choice:** Keep signaling, tear down mesh
**Notes:** Directly matches FND-04 requirement.

---

## Event Bus Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Manual per-scene | Keep existing bind/unbind pattern, fix scenes missing it. No new abstractions. | ✓ |
| Base scene class | Create BaseNetworkScene that auto-unbinds on shutdown. Less boilerplate but adds abstraction. | |
| You decide | Claude picks the approach that fits the codebase best. | |

**User's choice:** Manual per-scene
**Notes:** Consistent application of existing convention. GameScene/UIScene/LobbyScene are the reference implementations.

---

## Claude's Discretion

- Singleton reset scope: Claude determines what state gets wiped between matches, as long as FND-03 is satisfied.

## Deferred Ideas

None — discussion stayed within phase scope.
