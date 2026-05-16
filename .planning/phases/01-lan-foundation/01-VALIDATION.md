---
phase: 1
slug: lan-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (ESM-compatible, matches Vite setup) |
| **Config file** | `vitest.config.ts` — Wave 0 installs and configures |
| **Quick run command** | `pnpm test -- --run` |
| **Full suite command** | `pnpm test -- --run --coverage` |
| **Server tests** | `cd game-server && pnpm test -- --run` |
| **Estimated runtime** | ~10 seconds (unit), ~20 seconds (integration with socket.io server) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run`
- **After every plan wave:** Run both `pnpm test -- --run` and `cd game-server && pnpm test -- --run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| Server setup | 01 | 1 | NET-01 | integration | `cd game-server && pnpm test -- --run src/lobby-manager.test.ts` | `game-server/src/lobby-manager.test.ts` | MISSING — Wave 0 must create |
| LobbyManager | 01 | 1 | NET-02 | unit | `cd game-server && pnpm test -- --run src/lobby-manager.test.ts` | `game-server/src/lobby-manager.test.ts` | MISSING — Wave 0 must create |
| GameRoom relay | 01 | 1 | NET-02 | unit | `cd game-server && pnpm test -- --run src/game-room.test.ts` | `game-server/src/game-room.test.ts` | MISSING — Wave 0 must create |
| NetworkManager | 02 | 2 | NET-03 | integration | `pnpm test -- --run src/networking/network-manager.test.ts` | `src/networking/network-manager.test.ts` | MISSING — Wave 0 must create |
| RemoteInputComponent | 02 | 2 | NET-03 | unit | `pnpm test -- --run src/components/input/remote-input-component.test.ts` | `src/components/input/remote-input-component.test.ts` | MISSING — Wave 0 must create |
| Spell sync relay | 03 | 3 | NET-04 | integration | `cd game-server && pnpm test -- --run src/game-room.test.ts` | same as above | MISSING |
| Room transition sync | 03 | 3 | NET-05 | integration | `cd game-server && pnpm test -- --run src/game-room.test.ts` | same as above | MISSING |
| Disconnect detection | 03 | 3 | NET-06 | integration | `cd game-server && pnpm test -- --run src/game-room.test.ts` | same as above | MISSING |

---

## Wave 0 — Test Scaffolding

**REQUIRED before any other tasks run.** Every MISSING automated command above needs a stub test file created first.

### Files to create in Wave 0:

```
game-server/src/lobby-manager.test.ts    ← stub: "LobbyManager > creates lobby" passes
game-server/src/game-room.test.ts        ← stub: "GameRoom > adds player" passes
src/networking/network-manager.test.ts   ← stub: "NetworkManager > singleton init" passes
src/components/input/remote-input-component.test.ts  ← stub: "RemoteInputComponent > isMovementLocked" passes
```

Wave 0 also installs Vitest if not present:
```bash
pnpm add -D vitest
cd game-server && pnpm add -D vitest
```

---

## Integration Test Pattern (socket.io)

For server integration tests, use this setup pattern:

```typescript
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as Client } from 'socket.io-client';

let httpServer: ReturnType<typeof createServer>;
let ioServer: Server;

beforeAll((done) => {
  httpServer = createServer();
  ioServer = new Server(httpServer);
  httpServer.listen(() => done());
});

afterAll(() => {
  ioServer.close();
  httpServer.close();
});
```

---

## Manual UAT (post-execution)

These require two browser windows and cannot be automated:

1. P1 opens browser at `localhost:5173`, enters server IP → connects → creates lobby
2. P2 opens browser at `localhost:5173`, enters same server IP → connects → sees P1's lobby → joins
3. P1 moves — P2 sees P1's ghost moving in real time (≤ 100ms latency on LAN)
4. P1 touches a door — both tabs transition to the same room simultaneously
5. Close P2's tab — P1 sees a "Player disconnected" message
