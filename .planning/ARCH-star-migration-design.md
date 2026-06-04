# Mesh → Star Migration Design: Server-Relay WebRTC for 20-Player PvP

**Branch:** `arch-webrtc-star` (mesh stays on `event-prep-overnight`/`main`, untouched, for the event)
**Status:** implementation-ready
**Scope:** replace the N-to-N WebRTC mesh with a star relay through the server, scaling to 20 players, keeping `NetworkManager`'s public API stable so `GameScene` and all callers are untouched.

> Full design produced by a 5-agent research+verify+design workflow. Library choice adversarially verified. All file:line references checked against real code.

---

## Recommendation Summary

- **Library: raw `node-datachannel` on the server — NOT geckos.io.** The repo already owns everything geckos sells (signaling relay, lobby/room/match-FSM, host-authoritative damage). geckos would duplicate+fight that infra AND cannot preserve the true reliable+ordered SCTP `events` channel the game needs (geckos issue #269). geckos wraps the *same* node-datachannel, so zero perf upside. Verified: installs clean on Windows (prebuilt binary, no C++ toolchain) + ships glibc+musl Linux prebuilds.
- **Topology: STAR RELAY.** Each client keeps ONE RTCPeerConnection to the server (replacing N−1), carrying the same two channels: unreliable `pos` (`ordered:false, maxRetransmits:0`) + reliable `events` (`ordered:true`).
- **Transport split:** WebRTC carries latency-critical gameplay (position unreliable; spell/breath/earth-wall/beam/transition reliable). Socket.io keeps lobby, signaling, match FSM, the entire `spell:hit→damage:confirmed` pipeline, scoring, pickups, results. **No damage-path changes.**
- **Scaling lever: server-tick snapshot aggregation.** Server does NOT blind-forward each `pos`; it keeps `latestState: Map<playerId, payload>`, overwrites on inbound, and emits ONE batched snapshot per client at 20-30 Hz (~400 sends/s at 20 players vs ~22,800 naive = ~38× reduction).
- **Relay stays DUMB on position, server stays AUTHORITATIVE on damage.** Migration is internal to NetworkManager — every public method + EVENT_BUS payload stays identical, so GameScene is untouched.

## Why It Scales to 20
Mesh: N(N−1)/2 connections → 20 players = **190 fragile ICE connections** + ~22,800 pos sends/s. Star + aggregation: **N connections** + **~400 sends/s**. Bandwidth ~4.8 KB/s down per client at 20 Hz. node-datachannel (via geckos) is stress-tested at 128 conns @ 60fps — 20 is comfortable.

## Architecture (star)
```
 Client ──1 RTCPeerConnection──► SERVER (node-datachannel hub)
   ├ pos    (unreliable) ─────►   on 'pos':  latestState.set(id, pos)   [no forward]
   └ events (reliable)   ─────►   on event:  forward reliable (echo-suppress)
                                  TICK @20-30Hz: snapshot=[...latestState] → send once per client
 + Socket.io UNCHANGED: lobby, FSM, signaling, damage, scoring, pickups
```
Client unpacks each snapshot into N `NETWORK_PLAYER_UPDATE` emissions — the exact event `#onRemotePlayerUpdate` already handles.

## Implementation Plan (phased, behind `NETWORK_TRANSPORT` flag)
- **Step 0 (0.5d):** branch + `npm install node-datachannel` + add `NETWORK_TRANSPORT: 'mesh'|'star'='mesh'` flag.
- **Step 1 (1.5-2d) [MILESTONE]:** one client↔server datachannel alongside the mesh, behind the flag. Server `StarRelay` peer reusing the existing signaling relay (server.ts:325-335, add a `targetSocketId==='server'` branch). Client `#initStarConnection()` sibling to `#initWebRTCMesh` (network-manager.ts:662), reusing `#setupDataChannel`, ICE buffering, `#handleAnswer`.
- **Step 2 (1d):** position relay — collapse `#broadcastUnreliable` (892) to one server send; server forwards pos tagged with `playerId`; client dispatcher unchanged.
- **Step 3 (1d):** spell/event relay — collapse `#broadcastReliable` (911); server immediate-forward + echo-suppress.
- **Step 4 (1.5-2d):** tick aggregation — `latestState` + relay-tick interval; client `snapshot` unpacking; drop `sendPosMirror` (server now gets every pos via relay → feed `room.recordPosition` from it).
- **Step 5 (1-1.5d):** remove mesh path; ICE-restart reconnect (on server PC `failed`/`disconnected` → `restartIce()` + re-offer over socket.io); simplify teardown/health-check; flip default to `'star'`.
- **A/B (1d):** stress-test matrix (6/12/20 bots) + manual 6-browser check.

**Total ~8-10 days.** First milestone: end of Phase 1 (one client↔server connection, both channels open, mesh still green) — proves all the riskiest unknowns at once.

## HARD GATE before Phase 1
Answer: **does the deploy host give a public IP + openable inbound UDP range (or coturn)?** The star makes the SERVER a WebRTC peer (mesh didn't need this). If the host is single-TCP-port (PaaS/serverless), keep the **socket.io/WebSocket relay as the production transport** and treat WebRTC-server-peer as a LAN/optimization path. ASK THE PROFESSOR.

## A/B Test Plan
Reuse `game-server/scripts/stress-test.mjs` (already measures RTT, throughput, relay rate, jitter). Compare mesh vs star at 6/12/20 bots. Pass criteria at 20 bots/20Hz: server outbound ≤ ~600 sends/s, RTT p95 within ~1.5× of 6-player, delivery ≥ 99%, droppedDueToBuffer ≈ 0, server CPU < 1 core.

## Risks
- Native dep on deploy → prebuilt binaries, use `node:22-bookworm-slim` (glibc).
- **Host blocks inbound UDP / no public IP → the migration gate** (above).
- Channel drop mid-match → `restartIce()` + socket.io reconnect.
- Library fails → socket.io `game:player-update-mp` relay already exists as fallback.

## Future (100+ players, out of scope now)
MessagePack snapshot encoding (msgpack already a server dep — ~40-60% smaller, near-zero effort), then area-of-interest culling + delta compression.
