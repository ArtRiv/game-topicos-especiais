# Mages PvP — Network Throughput Test Report

**Generated:** 2026-05-25
**Test files:** [src/networking/\_\_tests\_\_/](../../src/networking/__tests__/)
**Re-run:** `pnpm exec vitest run src/networking/__tests__/`

This report measures the WebRTC mesh protocol's correctness and throughput at the project's
documented player ceilings, run against an in-process socket.io signaling server using a
fake-RTC harness ([fake-rtc.ts](../../src/networking/__tests__/fake-rtc.ts)). The harness
exercises the full production signaling + channel-routing code path, but skips ICE/STUN/SCTP
since those depend on real network conditions.

---

## Headline numbers

### Position-update throughput — 20 players (10v10 ceiling)

| Test | Duration simulated | Total packets sent | Total packets received | Protocol time | Loss |
|---|---|---|---|---|---|
| 20 peers × 100 ticks | 5s @ 20Hz | 2,000 | 38,000 | **103 ms** | **0** |
| 20 peers × 600 ticks | 30s @ 20Hz | 12,000 | 228,000 | **319 ms** | **0** |

Equivalent processing throughput at the protocol layer: **~37,600 sends/sec, ~714,700 receives/sec**.

A real 30-second match at 20Hz with 20 players generates 12,000 position packets — the protocol
processes that workload in 319 milliseconds of CPU time. Headroom is ~95×.

### Spell-cast correctness — reliable channel

| Test | Casts | Receives | Duplicates | Out-of-order |
|---|---|---|---|---|
| 6 peers × 60 spells | 60 | 300 (= 60 × 5 non-casters) | 0 | 0 |
| 4 peers × 100 sequenced spells each | 400 | 1,200 | 0 | 0 |

Reliable ordering is preserved per-sender across all receivers.

---

## What was actually tested

| File | Tests | What it verifies |
|---|---|---|
| [mesh-formation.test.ts](../../src/networking/__tests__/mesh-formation.test.ts) | 6 | Mesh forms correctly at 3, 6, 10, 20 peers; teardown + reconnect is clean |
| [throughput.test.ts](../../src/networking/__tests__/throughput.test.ts) | 4 | Position + spell throughput under load, zero loss |
| [disconnect.test.ts](../../src/networking/__tests__/disconnect.test.ts) | 5 | Abrupt-disconnect cleanup; sequential + simultaneous disconnects; survivors still functional |

**41 total tests run in ~2 seconds.**

---

## What this DOES guarantee for the event

1. The application protocol is correct at 20 players. Packets don't get dropped, duplicated,
   or reordered inside the JavaScript layer (the bit we control).
2. Disconnects are cleaned up properly. When a player closes their tab mid-match, the other
   19 players cleanly remove them within ~50ms (limited by socket.io's local detection latency).
3. The protocol layer has ~95× headroom over realistic gameplay load — the CPU cost of
   serializing/routing 30s of 20-player 20Hz traffic is 319ms of single-threaded JS time.

## What this does NOT guarantee for the event

1. **Real WebRTC over a real LAN.** This test skips ICE/STUN/SCTP. Actual P2P performance
   depends on the school network's NAT/firewall behavior. The professor's box at the event
   must allow:
   - Outbound TCP for socket.io signaling (port 3000)
   - Outbound UDP to `stun.l.google.com:19302` for ICE candidate gathering
   - Direct UDP between clients on the same LAN (default for STUN-discovered candidates)
2. **Rendering performance.** A separate concern — Phaser drawing 20 sprites at 60 FPS is
   a GPU/browser question, not a network question. Profile manually with Chrome DevTools
   if frame rate becomes an issue.
3. **Encryption / SCTP retransmit behavior.** Real WebRTC uses DTLS + SCTP for the data
   channels. The fake here uses microtask delivery instead. Latency on a real network will
   be higher (typically <5ms LAN RTT, <30ms cross-internet); throughput will be limited by
   bandwidth, not CPU. For 12,000 small JSON packets per second across a LAN this is
   irrelevant.

## How to re-run before the event

```powershell
# Full networking suite (41 tests, ~2 seconds)
pnpm exec vitest run src/networking/

# Just the throughput test (4 tests, ~1.5 seconds)
pnpm exec vitest run src/networking/__tests__/throughput.test.ts

# Just one specific test by name pattern
pnpm exec vitest run src/networking/__tests__/throughput.test.ts -t "20 peers × 600"
```

Headline numbers print to stderr so they're visible even when tests pass.

---

## Bugs found and fixed while writing these tests

1. **Disconnect handler didn't shrink `#matchPlayers`** ([network-manager.ts:432-446](../../src/networking/network-manager.ts#L432-L446))
   After any player disconnected, `meshHealth.expectedPeers` stayed at the original size while
   `peerConnections.size` shrank, so `meshHealth.healthy` would falsely report `false`
   forever. The disconnect-test suite explicitly asserts this is fixed (the
   `multiple sequential disconnects each leave a healthy mesh` test).

   Side fix: `#socketToPlayerId` map also wasn't being cleared on disconnect — same handler
   now drops the entry. Prevents stale lookups producing wrong `playerId` for new peers
   who happen to reuse a recycled socketId.

The earlier ICE-candidate-buffer and pre-spawn fixes ([3p-multiplayer-desync-analysis.md](3p-multiplayer-desync-analysis.md))
are also tested here as a regression guard.
