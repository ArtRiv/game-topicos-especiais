# Production Deployment Notes — Professor's Server

How to ship the game so it runs on the professor's server box and players connect from their own machines.

This is also the checklist of things to flip before handing over the build.

---

## 1. Pre-flight checklist (do this on the dev machine before building)

These are settings that are *fine* for local 3-window repro but should NOT ship to the professor:

| File | Setting | Dev value | Prod value | Why |
|---|---|---|---|---|
| [src/common/config/network.ts:14](../../src/common/config/network.ts) | `NETWORK_DEBUG` | `true` | **`false`** | `true` floods the browser console with per-event logs (channel-open, ice-state, ice-buffered…). Fine for repro, noisy in prod. Also exposes `window.__NM__` — leave that off for a public build. |
| [src/common/config/debug.ts:27](../../src/common/config/debug.ts) | `DEV_SKIP_TO_GAMEPLAY` | `false` | **`false`** | Already correct. This bypasses the lobby entirely and breaks multiplayer — never ship as `true`. |
| [src/common/config/network.ts:7](../../src/common/config/network.ts) | `NETWORK_SERVER_PORT` | `3000` | `3000` (or whatever the prof's box uses — see §3) | The client lobby UI lets the user type in the IP, so this is only the default port suffix. |

Quick command to flip the only one that really matters:

```powershell
# In src/common/config/network.ts, set NETWORK_DEBUG = false
```

---

## 2. Building the artifact to hand over

Two pieces ship: the **client bundle** (static files served by any HTTP server) and the **game server** (a Node process the prof runs).

### Client build

```powershell
pnpm install
pnpm build
# Output: dist/   (static HTML/JS/assets — no Node required to serve)
```

The contents of `dist/` are pure static files. The prof can serve them with any web server: nginx, Apache, `python -m http.server`, even Express `app.use(express.static('dist'))`.

### Game server build

```powershell
cd game-server
npm install
# No build step — game-server runs via tsx (TypeScript executor).
# In prod the prof just runs:
npm start
```

If the prof wants a precompiled JS version instead of `tsx`, add a build script to `game-server/package.json`:

```json
"scripts": {
  "build": "tsc",
  "start": "node dist/server.js",
  "start:tsx": "tsx src/server.ts"
}
```

But the current `tsx` setup is fine for production — `tsx` runs as fast as `node` and is the same pattern shipped already.

### What to hand over

A folder containing:

```
mages-pvp/
├── dist/                     # client static files (from pnpm build)
├── game-server/
│   ├── package.json
│   ├── package-lock.json
│   ├── src/                  # TypeScript source (tsx runs it directly)
│   └── README.md             # the prof's run-instructions (write below)
└── DEPLOY.md                 # high-level run instructions for the prof
```

The prof needs: Node.js 20+, `npm install` once, `npm start`.

---

## 3. Network setup on the professor's box

### Two HTTP listeners, one or two ports

**Recommended layout:**

- Port `8080` — HTTP server serving the static `dist/` (the client)
- Port `3000` — game server (Express + Socket.IO)

Players open `http://<prof-server-ip>:8080` in their browser, then in the lobby UI type `<prof-server-ip>` into the IP input, which makes the client connect to `<prof-server-ip>:3000`.

### Firewall rules the prof must open

Both ports must be reachable from every player machine on the LAN/internet:

- TCP `8080` — for the static client HTML/JS
- TCP `3000` — for socket.io signaling + the host-authoritative damage pipeline

If the prof's box is behind a NAT or VPS firewall, both ports need to be forwarded/opened.

### WebRTC / STUN

The game uses `stun:stun.l.google.com:19302` for ICE candidate discovery ([src/networking/network-manager.ts:436](../../src/networking/network-manager.ts) — `iceServers` config). This is a public Google STUN server and works over UDP from any reasonably-permissive network.

**Risk on a campus network:** if the prof's box's firewall blocks outbound UDP to `stun.l.google.com:19302`, ICE will fail and P2P never establishes — players will load the lobby fine but see nothing in-game. Same risk if any *client* machine blocks STUN.

If STUN turns out to be blocked, the fix is to switch to a different STUN provider (Cloudflare runs a free one at `stun:stun.cloudflare.com:3478`) or add a TURN relay server. Don't pre-emptively add TURN — it adds infra cost and isn't needed if STUN works.

### Single-host alternative

If the prof can only open one port, you can serve the static files from the game server itself. Add to [game-server/src/server.ts](../../game-server/src/server.ts), right after `const app = express();`:

```ts
import path from 'path';
app.use(express.static(path.join(process.cwd(), '..', 'dist')));
```

Then only port 3000 needs to be open. Players visit `http://<prof-server-ip>:3000` for both the client and the signaling/damage server. This is the simplest deployment for the event.

---

## 4. The IP input in the lobby

When a player opens the client, the lobby UI prompts for an "IP" ([src/scenes/lobby-scene.ts:131-140](../../src/scenes/lobby-scene.ts)):

- Players type the **prof's server IP** (e.g. `192.168.1.50` or whatever the LAN address is — or the public IP if the box is internet-facing)
- The client builds `http://<that-ip>:3000` and connects via socket.io
- All signaling and damage validation goes through this server
- Position updates and spell casts then go P2P over WebRTC between players

So for the event:

1. Find out what IP the prof's box has on the network the players will be on
2. Tell all players to type that IP into the lobby's IP input
3. Done — no per-player config files

Optional polish: hardcode the IP as the default so players don't need to type it. Edit [src/scenes/lobby-scene.ts](../../src/scenes/lobby-scene.ts) and set the IP input's default value to the prof's server IP before running `pnpm build`.

---

## 5. Smoke test on the prof's box

Before the event, run this checklist on the prof's machine:

1. `cd game-server && npm install && npm start` — should print `[SERVER] Listening on port 3000` (or whatever port is configured)
2. Serve `dist/` from another terminal (or via the §3 single-host approach)
3. On a *different* machine on the same network, open `http://<prof-ip>:8080` (or whatever the client URL is)
4. Type the prof's IP into the lobby, click Create Lobby
5. On a *second* different machine, open the same URL and join the lobby
6. Confirm 1v1 works
7. **Run the 3-window repro** (see §6 below) — confirm 3-player works *on the prof's network* before the event

If step 7 fails, the network may be blocking STUN. Test by visiting [https://test.webrtc.org/](https://test.webrtc.org/) from one of the player machines — if it can't establish a P2P connection there either, you've got a firewall issue, not a code issue.

---

## 6. 3-Player Manual Repro — Tonight's Test

This is what you should run on your laptop tonight to confirm the handshake fixes work.

### Setup (two terminals)

```powershell
# Terminal A — game-server
cd game-server
npm run dev
# Wait for "[SERVER] Listening on port 3000"

# Terminal B — frontend
pnpm start
# Wait for Vite "Local: http://localhost:5173/"
```

### Open 3 (or more) isolated Chrome windows

Each browser window needs its own profile so they don't share socket.io session state. Run in PowerShell (one command per window):

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\chrome-p1" --new-window "http://localhost:5173?p=alice"
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\chrome-p2" --new-window "http://localhost:5173?p=bob"
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\chrome-p3" --new-window "http://localhost:5173?p=carol"
# Add more if you want a 4-player test:
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="$env:TEMP\chrome-p4" --new-window "http://localhost:5173?p=dave"
```

The `?p=alice` query param is just a tab label — useful to tell the windows apart. Open DevTools (`F12`) in each window before doing anything else.

### Run the test

1. In window 1: type `localhost` in the IP input → Connect → Create Lobby → set yourself to a team
2. In windows 2/3 (and 4 if you have one): type `localhost` → Connect → join the same lobby → pick a team
3. Have window 1 (host) press Start
4. After loading, you should see 2 (or 3) other player sprites in the arena

### What to look for in the DevTools console

With `NETWORK_DEBUG = true` (which is set right now), each window will log lines like:

```
1748212345678 [NM:abc1] connected socket=xYzAbC...
1748212345789 [NM:abc1] lobby-started localPlayerId=p_xxxxx peers=alice(xYzA),bob(qWeR),carol(aSdF)
1748212345790 [NM:abc1] mesh-init peer=bob(qWeR) role=offerer
1748212345790 [NM:abc1] mesh-init peer=carol(aSdF) role=offerer
1748212345820 [NM:abc1] offer-sent to=qWeR
1748212345830 [NM:abc1] ice-buffered from=qWeR bufSize=1     ← may or may not appear
1748212345850 [NM:abc1] ice-drain from=qWeR count=2          ← THIS IS THE BUG-FIX FIRING
1748212345870 [NM:abc1] channel-open peer=qWeR label=pos
1748212345871 [NM:abc1] channel-open peer=qWeR label=events
```

**The new things to watch for:**

- `ice-buffered` lines — these now appear when ICE candidates arrive before the offer/answer is processed. Before today's fix, these candidates were silently dropped and the connection stalled.
- `ice-drain` lines — show the buffered candidates being applied once the PC has a remote SDP. Each drain saves a connection that would previously have died.
- `channel-open` lines — should appear **twice per peer** (`label=pos` and `label=events`). With 3 windows, each window should log 4 `channel-open` lines total. With 4 windows, 6 lines.

### Confirm via `__NM__.debugSnapshot()`

In any window's console, paste:

```js
__NM__.debugSnapshot()
```

You should see something like:

```js
{
  localPlayerId: "p_xxxxx",
  socketId: "xYzAbC...",
  isConnected: true,
  matchPlayers: [3 entries],
  peerConnections: [
    { peerSocketId: "qWeR...", iceState: "connected", signalingState: "stable" },
    { peerSocketId: "aSdF...", iceState: "connected", signalingState: "stable" }
  ],
  unreliableChannels: [
    { peerSocketId: "qWeR...", readyState: "open" },
    { peerSocketId: "aSdF...", readyState: "open" }
  ],
  reliableChannels: [/* same shape, also all 'open' */],
  pendingIceBuffer: [], // empty after handshake — nonzero here = a problem
  meshHealth: {
    expectedPeers: 2,
    pcCount: 2,
    unreliableOpen: 2,
    reliableOpen: 2,
    healthy: true     // ← this is the success indicator
  }
}
```

**`meshHealth.healthy: true` means the bug is fixed.** Run this in all 3 (or 4) windows — every one should show `healthy: true`.

If `healthy: false`, check:

- `pcCount === expectedPeers`? If not, an offer or answer was lost — look at the server console for missing `webrtc:offer`/`webrtc:answer` relays.
- `unreliableOpen === expectedPeers`? If not, the `pos` channel never opened — look at `ice-state` log lines (a `failed` state means ICE itself failed; a stuck `checking` state means candidates didn't reach the peer).
- `pendingIceBuffer` non-empty? Some peers received ICE for a connection that was never created — likely a server-side relay issue or a missing answer.

### Visual on-screen warning

If 8 seconds after match start the mesh isn't healthy, a yellow `NETWORK WARNING: …` banner appears at the top of the screen. Don't dismiss it — read it. It tells you which channels failed to open.

### Done — what to report back

After running the repro, tell me which of these you saw:

1. **All windows show `healthy: true`** → the fix worked, we can move on to the gameplay-direction work (Team Deathmatch + Specials).
2. **Some windows show `healthy: false`** → screenshot the `debugSnapshot()` output from every window + paste the `[NM:…]` log lines from each, and I'll trace the remaining failure mode.
3. **The lobby itself failed (couldn't join, couldn't start)** → that's a separate issue from the WebRTC handshake; we'll diagnose lobby-manager.ts separately.

---

## 7. After the repro confirms the fix

Before sending the build to the prof:

1. Flip `NETWORK_DEBUG = false` in [src/common/config/network.ts:14](../../src/common/config/network.ts)
2. `pnpm build`
3. Hand over `dist/` + `game-server/` per §2
4. Don't include `.planning/` in the prof's artifact — it's our internal docs, not a deliverable. (No security risk; just clutter.)
