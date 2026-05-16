---
phase: 06-foundation-cleanup
reviewed: 2026-04-21T23:10:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/scenes/lobby-scene.ts
  - src/scenes/game-over-scene.ts
  - src/common/event-bus.ts
  - src/common/data-manager.ts
  - src/common/element-manager.ts
  - src/components/inventory/inventory-manager.ts
  - src/networking/network-manager.ts
  - game-server/src/server.ts
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-04-21T23:10:00Z
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Reviewed the core foundation files: lobby scene, game-over scene, event bus, three singleton managers (DataManager, ElementManager, InventoryManager), the client NetworkManager, and the game server. The codebase is generally well-structured with good use of TypeScript private fields and clear separation of concerns. The main concern is a missing try/catch around JSON.parse in the WebRTC data channel handler, which can crash the message loop on malformed peer input. There are also several warnings around potential double-listener registration and silent error swallowing.

## Critical Issues

### CR-01: Uncaught JSON.parse in WebRTC data channel handler

**File:** `src/networking/network-manager.ts:381`
**Issue:** `JSON.parse(e.data)` in the `ch.onmessage` handler has no try/catch. A malformed message from a peer (or corrupted data on an unreliable channel, which is expected with UDP-like semantics) will throw a `SyntaxError`, crashing the onmessage callback and potentially breaking all subsequent message processing on that channel.
**Fix:**
```typescript
ch.onmessage = (e: MessageEvent<string>) => {
  this.#msgRecvCount++;
  let msg: DcMessage;
  try {
    msg = JSON.parse(e.data) as DcMessage;
  } catch {
    return; // Drop malformed messages silently
  }
  const playerId = this.#socketToPlayerId.get(fromSocketId) ?? fromSocketId;
  // ... rest of switch statement
};
```

## Warnings

### WR-01: Potential duplicate NETWORK_DISCONNECTED listener on reconnect

**File:** `src/scenes/lobby-scene.ts:96`
**Issue:** `#onConnect()` registers `EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_DISCONNECTED, ...)` every time the connect button is pressed. If a connection fails and the user clicks Connect again, a second listener is added without the first being removed. The SHUTDOWN cleanup at line 36 removes it, but only when the scene shuts down -- not between connection attempts within the same scene lifecycle.
**Fix:** Use `EVENT_BUS.once` instead of `EVENT_BUS.on` for the disconnect listener (it already uses `once` for NETWORK_CONNECTED on line 95), or guard with an off-before-on pattern:
```typescript
EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDisconnected, this);
EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_DISCONNECTED, this.#onDisconnected, this);
```

### WR-02: Non-null assertion on socket.id before connection is guaranteed

**File:** `src/networking/network-manager.ts:292`
**Issue:** `this.#socket.id!` uses the non-null assertion operator. If `#initWebRTCMesh` is somehow called before the socket has received its server-assigned ID (e.g., race condition during rapid lobby start), `mySocketId` would be `undefined` cast to `string`, causing `findIndex` to silently fail and no peer connections to be created.
**Fix:**
```typescript
const mySocketId = this.#socket.id;
if (!mySocketId) {
  console.error('[NET] Cannot init WebRTC mesh: socket has no ID');
  return;
}
```

### WR-03: Empty catch block silently drops reliable messages

**File:** `src/networking/network-manager.ts:434`
**Issue:** The catch block in `#broadcastReliable` silently swallows all errors. While dropping on queue-full is acceptable, this also hides unexpected errors (e.g., channel in an unexpected state). At minimum a debug-level log would aid troubleshooting network issues.
**Fix:**
```typescript
} catch (err) {
  if (NETWORK_DEBUG) {
    console.warn('[NET] Failed to send reliable message:', err);
  }
}
```

## Info

### IN-01: Hardcoded port number

**File:** `src/scenes/lobby-scene.ts:92`
**Issue:** `const port = 3000;` is a magic number. The server also defaults to 3000, but if the server port is changed via `process.env.PORT`, the client would not match. Consider importing from a shared config.
**Fix:** Import the port from `../common/config.js` (where `NETWORK_SERVER_PORT` is already defined) rather than hardcoding.

### IN-02: Singleton managers lack static instance teardown

**File:** `src/common/data-manager.ts:109`, `src/common/element-manager.ts:31`, `src/components/inventory/inventory-manager.ts:95`
**Issue:** All three singleton managers (`DataManager`, `ElementManager`, `InventoryManager`) have `reset()` methods that reset internal data but do not clear the static `#instance` reference. `NetworkManager` has `_resetInstance()` for testing. These other managers may need similar teardown for clean scene restarts or testing.
**Fix:** Add a static reset method to each, e.g.:
```typescript
static _resetInstance(): void {
  DataManager.#instance = undefined as unknown as DataManager;
}
```

### IN-03: parseInt without explicit radix

**File:** `game-server/src/server.ts:9`
**Issue:** `parseInt(process.env.PORT)` omits the radix parameter. While it defaults to base-10 for normal numeric strings, an explicit radix is a best practice.
**Fix:**
```typescript
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
```

---

_Reviewed: 2026-04-21T23:10:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
