# 3-Player WebRTC Repro Strategy

A practical playbook for reproducing and diagnosing the "3rd peer breaks the mesh" bug without needing 3 physical machines. Tiered from cheapest (3 windows on your laptop) to nuclear (full Playwright triplet) to surgical (3-NM integration test).

The current symptoms ("one player can't see another") and the topology code in [`src/networking/network-manager.ts:360-380`](../../src/networking/network-manager.ts) strongly point at one of:

- **Late-join offer/answer race** — `#initWebRTCMesh` uses `myIndex < peerIndex` to decide who offers ([`network-manager.ts:374`](../../src/networking/network-manager.ts)). With 3 players, peer A creates 2 offers in sequence; if signaling out-of-order or `setLocalDescription` resolves slowly, one channel can be stuck in `connecting`.
- **`ondatachannel` only set on answer side** — [`network-manager.ts:426-429`](../../src/networking/network-manager.ts) attaches `ondatachannel` *after* `createPeerConnection`, but the offerer pre-creates channels. If the timing is wrong on the answer side (rare, but possible if an ICE candidate arrives first), one direction's channel may never register.
- **`#socketToPlayerId` populated only on `lobby:started`** — [`network-manager.ts:288-291`](../../src/networking/network-manager.ts). If a 3rd peer's socketId is missing from this map when their first `pos` message arrives, it falls back to the raw socketId as playerId, and `GameScene.#remotePlayers.set(payload.playerId, …)` ([`game-scene.ts:3875`](../../src/scenes/game-scene.ts)) creates a duplicate-keyed entry — invisible on the map because nothing renders without a clean lookup.

You will localize which of these is firing by the end of §2 below.

---

## 1. The cheapest realistic repro — 3 browser windows on one machine

### Start the stack (two terminals)

```powershell
# Terminal A — game-server (from repo root)
cd game-server
npm run dev
# → "[SERVER] Listening on port 3000"

# Terminal B — frontend (from repo root)
pnpm start
# → Vite at http://localhost:5173
```

### Pre-flight: disable the dev shortcut

[`src/common/config/debug.ts:27`](../../src/common/config/debug.ts) currently has `DEV_SKIP_TO_GAMEPLAY = true`, which bypasses the lobby entirely and **kills multiplayer setup**. Flip it to `false` before testing 3-player. Hot-reload picks it up.

### Open 3 isolated browser contexts

You need three windows that do NOT share localStorage, sessionStorage, IndexedDB, or socket.io session affinity. Three options, ranked:

**Best: Chrome `--user-data-dir`** — gives each window a fully independent profile (separate cookies, storage, in-memory state). On Windows:

```powershell
# Run from any directory. Each command opens an isolated Chrome window.
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\chrome-p1" --new-window "http://localhost:5173?p=alice"
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\chrome-p2" --new-window "http://localhost:5173?p=bob"
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\chrome-p3" --new-window "http://localhost:5173?p=carol"
```

The `?p=alice` query param is purely a label so each window's tab/title differs — it has no code path, but you can see it in DevTools `location.search` to know which window is which. (Optional polish: in [`src/scenes/lobby-scene.ts`](../../src/scenes/lobby-scene.ts) you could read `new URLSearchParams(location.search).get('p')` and prefill the player-name input. ~3-line change. Recommended but not required for this bug.)

**Acceptable: Chrome Incognito + Firefox + Edge** — three different browsers, three different storage scopes. Works but each browser has slightly different WebRTC quirks, which adds noise.

**Avoid: 3 incognito windows from the same Chrome instance** — they share an incognito session pool. If you open windows 2 and 3 from window 1's tray, storage *is* shared.

### Code change to bypass "one tab per account"

I checked — there is no per-account/per-device lock anywhere in [`src/networking/network-manager.ts`](../../src/networking/network-manager.ts) or [`game-server/src/lobby-manager.ts`](../../game-server/src/lobby-manager.ts). The player ID is generated server-side from the socket connection, so 3 separate socket connections = 3 separate players regardless of name collisions. **No code changes needed.**

### Label/identify each window

1. Use the `?p=alice|bob|carol` URL param plus the player-name input in the lobby — name them differently so you can tell who's who in the player list.
2. In DevTools console of each window: `document.title = 'P1-alice'` (or whatever). Window taskbar entries are now distinguishable.
3. Once the logging from §4 lands, every console log is prefixed with a short id, so `diff <(log-from-p1) <(log-from-p2)` works cleanly.

### Suggested screen layout (1080p)

- Top-left: Alice (window 1), DevTools docked right
- Top-right: Bob (window 2), DevTools docked right
- Bottom-center: Carol (window 3), DevTools docked right

Alice creates lobby → Bob joins → confirm 1v1 works → **then** Carol joins → start match. The bug should fire on Carol's join or on match start with 3.

---

## 2. Mid-cost repro — Playwright triplet

**Is Playwright already installed?** No — checked `package.json`, no `playwright` or `puppeteer` deps. Recommend Playwright (`@playwright/test`) over Puppeteer: built-in test runner, parallel browser contexts as first-class citizens, better WebRTC trace tooling (`page.context().tracing.start({ snapshots: true })`).

```powershell
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

### Script skeleton — `scripts/3p-repro.ts`

```ts
// pnpm tsx scripts/3p-repro.ts
import { chromium } from '@playwright/test';

const NAMES = ['alice', 'bob', 'carol'] as const;

async function main() {
  const browser = await chromium.launch({ headless: false });
  const contexts = await Promise.all(NAMES.map(() => browser.newContext()));
  const pages = await Promise.all(contexts.map((c) => c.newPage()));

  // Pipe each window's console to stdout, prefixed
  pages.forEach((p, i) => p.on('console', (m) => console.log(`[${NAMES[i]}] ${m.text()}`)));

  // Open
  await Promise.all(pages.map((p, i) => p.goto(`http://localhost:5173?p=${NAMES[i]}`)));

  // Drive the lobby. (Selectors here are placeholders — you'll need real
  // data-testid attributes on the create/join buttons. Add data-testid="lobby-create"
  // etc. as part of this work.)
  await pages[0].click('[data-testid=lobby-create]');
  await pages[0].waitForSelector('[data-testid=lobby-code]');
  const lobbyCode = await pages[0].textContent('[data-testid=lobby-code]');

  for (const p of pages.slice(1)) {
    await p.fill('[data-testid=lobby-code-input]', lobbyCode!);
    await p.click('[data-testid=lobby-join]');
  }
  await pages[0].click('[data-testid=lobby-start]');

  // Wait for the match to be active, then dump NetworkManager state
  await Promise.all(pages.map((p) => p.waitForFunction(() => (window as any).__NM__?.isConnected)));

  for (let i = 0; i < pages.length; i++) {
    const nmState = await pages[i].evaluate(() => {
      const nm: any = (window as any).__NM__;
      return {
        localPlayerId: nm.localPlayerId,
        peerConnectionsSize: nm._peerConnections?.size,
        unreliableChannelStates: [...(nm._unreliableChannels?.entries() ?? [])].map(
          ([sid, ch]: any) => [sid, ch.readyState],
        ),
        reliableChannelStates: [...(nm._reliableChannels?.entries() ?? [])].map(
          ([sid, ch]: any) => [sid, ch.readyState],
        ),
        matchPlayers: nm.matchPlayers,
      };
    });
    console.log(`\n=== ${NAMES[i]} ===\n`, JSON.stringify(nmState, null, 2));
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### What you need to instrument first

The private fields in [`NetworkManager`](../../src/networking/network-manager.ts) (`#peerConnections`, `#unreliableChannels`, `#reliableChannels`) are inaccessible from outside. Add a dev-only diagnostic hook at the end of `NetworkManager.init`:

```ts
// network-manager.ts, after the Singleton is created
if (typeof window !== 'undefined' && (window as any).__DEV_NM_EXPOSE__) {
  (window as any).__NM__ = new Proxy(NetworkManager.#instance, {
    get(t, p) {
      if (p === '_peerConnections') return (t as any)['#peerConnections'];
      // …mirror the other private maps
      return (t as any)[p];
    },
  });
}
```

Easier: just add a `debugSnapshot()` public method that returns a plain object with `{ peerConnections: [...], unreliableChannels: [...], reliableChannels: [...], matchPlayers, localPlayerId }`. Call `nm.debugSnapshot()` from Playwright. This is also what §4 logging hooks should use to print state, so the cost is shared.

### Wire as a script

Add to root [`package.json`](../../package.json) scripts:

```json
"test:3p": "tsx scripts/3p-repro.ts"
```

Run with both `pnpm start` and `npm run dev` (server) already up.

---

## 3. Cheapest possible — 3-peer integration test with mocked WebRTC

The existing pattern in [`src/networking/network-manager.test.ts:13-22`](../../src/networking/network-manager.test.ts) already spins up an in-process socket.io server. Extending this to 3 NMs is structurally easy, but there's one real blocker: **`NetworkManager` is a singleton** ([`network-manager.ts:48`](../../src/networking/network-manager.ts) — `static #instance`). You cannot have 3 instances in one process without breaking that constraint.

### Approach

1. **Promote `NetworkManager`'s singleton to optional.** Add a `createForTest(serverUrl)` factory that returns a fresh non-singleton instance. The existing `_resetInstance` already telegraphs that the test infra wanted this.
2. **Run a real `game-server` in-process.** Import `LobbyManager`, `GameRoom`, and re-implement just the socket handlers needed in the test (lobby create/join/start + the 3 `webrtc:offer|answer|ice` relay handlers). The existing test already creates an `ioServer` — extend it. Alternatively, refactor [`game-server/src/server.ts:105`](../../game-server/src/server.ts) to export `attachHandlers(io)` so the test can `attachHandlers(testIoServer)` to get the real production handlers. Strongly recommended — guarantees the test exercises the real signaling code.
3. **Stub `RTCPeerConnection`.** In the browser this is global; in node the existing code guards with `if (typeof RTCPeerConnection === 'undefined') return;` ([`network-manager.ts:362`](../../src/networking/network-manager.ts)). For the test, you have two options:
   - **`wrtc` / `node-datachannel`** — real WebRTC in node. Heavyweight (native binding, build issues on Windows are common). Use only if you need to test the actual ICE path.
   - **Fake `RTCPeerConnection`** in `globalThis` — sufficient for testing the offer/answer/socketToPlayerId map state. Looks like:
     ```ts
     globalThis.RTCPeerConnection = class FakeRTC {
       localDescription: any = null;
       onicecandidate: any;
       ondatachannel: any;
       oniceconnectionstatechange: any;
       async createOffer() { return { type: 'offer', sdp: 'fake' }; }
       async createAnswer() { return { type: 'answer', sdp: 'fake' }; }
       async setLocalDescription(d: any) { this.localDescription = d; }
       async setRemoteDescription(_d: any) {}
       async addIceCandidate(_c: any) {}
       createDataChannel(label: string) {
         const ch: any = { label, readyState: 'open', send() {}, onmessage: null };
         queueMicrotask(() => ch.onopen?.());
         return ch;
       }
       close() {}
     } as any;
     ```
4. **Invariants to assert.** Spin up 3 NMs, fire `lobby:started` from the test server with a 3-player `matchConfig`, wait a few microtask flushes, then:
   - `nm1.peerConnections.size === 2 && nm2.… === 2 && nm3.… === 2`
   - `nm1.unreliableChannels.size === 2` (same for nm2, nm3)
   - `nm1.socketToPlayerId.get(nm2.socketId) === nm2.localPlayerId` (cross-NM)
   - No NM has a `peerConnections` entry keyed by its own socketId (the self-skip in [`network-manager.ts:372`](../../src/networking/network-manager.ts))

### Blockers in current infra

- **Singleton.** Must be lifted. ~10-line refactor.
- **Private fields.** Tests cannot read `#peerConnections`. Add the `debugSnapshot()` public method from §2 — pays double duty.
- **`#bindSocketEvents` doesn't fire `oniceconnectionstatechange`.** Your fake stub above won't trigger the disconnect cleanup path. That's fine — you're not testing disconnect here, you're testing initial mesh formation.

This is the lightest weight test for the *specific* bug class "all 3 peers correctly join the mesh." If it passes but the manual repro fails, the bug is in the data channel or remote-player spawn layer, not signaling.

---

## 4. Logging that should land regardless

Add these telemetry hooks now. They cost <1 ms/frame and make every future multiplayer bug an order of magnitude faster to diagnose. Use this exact format so logs from 3 windows `diff` cleanly:

```ts
const tag = `[NM:${this.#localPlayerId.slice(0, 4)}]`;
console.debug(`${Date.now()} ${tag} <event> …`);
```

The 4-char id slice is enough to disambiguate 3 players, short enough not to swamp the line. `Date.now()` (ms epoch) sorts and `diff`s correctly across windows; no need for `Date.toISOString()`.

### Required log points

| # | Where | What to log |
|---|---|---|
| 1 | [`network-manager.ts:251`](../../src/networking/network-manager.ts) (`on('connect')`) | `connected socket=${this.#socket.id}` |
| 2 | [`network-manager.ts:284`](../../src/networking/network-manager.ts) (`on('lobby:started')`) | `lobby-started localPlayerId=${me?.id} peers=${players.map(p=>p.id).join(',')}` |
| 3 | [`network-manager.ts:371-377`](../../src/networking/network-manager.ts) (`#initWebRTCMesh` per-peer) | `mesh-init peer=${peer.id} role=${myIndex<peerIndex?'offerer':'answerer'}` |
| 4 | [`network-manager.ts:420`](../../src/networking/network-manager.ts) (end of `#createOffer`) | `offer-sent to=${peerSocketId}` |
| 5 | [`network-manager.ts:434`](../../src/networking/network-manager.ts) (end of `#handleOffer`) | `answer-sent to=${fromSocketId}` |
| 6 | [`network-manager.ts:447-452`](../../src/networking/network-manager.ts) (`#setupDataChannel`, in `ch.onopen`) | `channel-open peer=${fromSocketId} label=${ch.label}` — add an `onopen` you don't currently have |
| 7 | [`network-manager.ts:394-405`](../../src/networking/network-manager.ts) (`oniceconnectionstatechange`) | `ice-state peer=${peerSocketId} state=${pc.iceConnectionState}` |
| 8 | [`game-scene.ts:3864-3875`](../../src/scenes/game-scene.ts) (right after `this.#remotePlayers.set(...)`) | `[GS:${shortId}] spawn-remote id=${payload.playerId} total=${this.#remotePlayers.size}` |
| 9 | [`game-scene.ts:4102-4107`](../../src/scenes/game-scene.ts) (`#onRemotePlayerDisconnected`) | `[GS:${shortId}] despawn-remote id=${payload.playerId} total=${this.#remotePlayers.size}` |
| 10 | [`network-manager.ts:333`](../../src/networking/network-manager.ts) (`game:player-disconnected` handler) | `peer-disconnected id=${playerId} peers-remaining=${this.#peerConnections.size}` |

Gate all of these behind `NETWORK_DEBUG` ([`src/common/config/network.ts:9`](../../src/common/config/network.ts)) — set it to `true` while repro'ing. Don't gate behind `ENABLE_LOGGING` from `debug.ts`; networking has its own knob.

For point #6 — the offerer's `createDataChannel` returns a channel whose `onopen` you currently never wire. Add this inside `#setupDataChannel`:

```ts
ch.onopen = () => { if (NETWORK_DEBUG) console.debug(`${Date.now()} [NM:${this.#localPlayerId.slice(0,4)}] channel-open peer=${fromSocketId} label=${ch.label}`); };
```

---

## 5. Assertion checklist — "is the bug reproduced"

After each repro attempt, run this list on each of the 3 windows. Open DevTools console in each:

- [ ] All 3 windows show **2 remote player sprites** rendered on the map (count manually).
- [ ] In each window's console: `__NM__.debugSnapshot().peerConnections.length === 2`
- [ ] In each window's console: every entry in `__NM__.debugSnapshot().unreliableChannels` has `readyState === 'open'` (2 entries each → 6 channels across the mesh).
- [ ] Same for `reliableChannels` (another 6 channels open).
- [ ] In each window's console: `__NM__.debugSnapshot().matchPlayers.length === 3`.
- [ ] Move player Alice → Bob's and Carol's windows show her sprite moving smoothly. Repeat from Bob → Alice/Carol, then Carol → Alice/Bob.
- [ ] Cast a spell in each window → other two windows render the spell effect.
- [ ] In server terminal: no repeated `webrtc:offer` retries; `[SERVER] Client connected:` line count === 3 (no zombie sockets).
- [ ] In the §4 logs: every window logged exactly 2 `mesh-init` lines + 2 `channel-open label=pos` + 2 `channel-open label=events` → that's 6 mesh-init and 12 channel-open lines across all 3 windows.

If **any** box is unchecked, the bug is reproduced. Note which box failed — that points at the layer.

---

## 6. Order of operations — what to do tonight

1. **Add the logging from §4** (≈30 minutes). Set `NETWORK_DEBUG = true` in [`src/common/config/network.ts:9`](../../src/common/config/network.ts). Also add the `debugSnapshot()` method on `NetworkManager` (pays for itself in §2 and §5). Flip `DEV_SKIP_TO_GAMEPLAY = false` in [`debug.ts:27`](../../src/common/config/debug.ts).
2. **Run the §1 three-window repro.** Three `chrome.exe --user-data-dir` windows. Save each window's console as a text file (DevTools → console → right-click → Save as…). Server stdout too.
3. **Run §5 against each window** and `diff` the three log files. The first place they diverge is your bug. Specifically check whether all three logged 2 `mesh-init` lines and 4 `channel-open` lines.
4. **Only if step 3 is inconclusive,** invest in §3 (3-NM integration test) before §2 (Playwright). §3 is faster to write, more deterministic, and tests exactly the topology layer the bug lives in. §2 is for when you need to reproduce the *full* pipeline including timing/Phaser/render — useful, but heavy and slower.

If you suspect a Phaser-side problem (e.g., remote player spawned but invisible), skip §3 and go straight to §2.
