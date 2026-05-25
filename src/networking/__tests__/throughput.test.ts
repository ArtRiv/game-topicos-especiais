/**
 * Throughput / load test for the WebRTC mesh.
 *
 * Goal: prove the protocol does NOT drop, duplicate, or reorder packets under
 * realistic event-day load. Specifically: 20 peers (10v10 ceiling) broadcasting
 * position updates at 20 Hz plus spell casts at ~1-2 Hz for the equivalent of
 * 5–30 seconds of simulated play.
 *
 * Methodology:
 *   - Simulated ticks (not wall-clock setInterval) so the test runs as fast as
 *     possible while preserving the exact packet count semantics.
 *   - Per tick: every peer calls sendPlayerUpdate with a slightly-mutated
 *     position so the lastSentSnapshot diff-skip does NOT suppress the send.
 *     Then await a microtask flush so fake-rtc.ts delivers the messages.
 *   - Spell casts injected at a configurable cadence; counted independently.
 *   - Receive counts are captured by hooking EVENT_BUS at the test level (the
 *     shared global emitter — every receiver-side emit increments the counter).
 *
 * What this catches:
 *   - Drops inside #broadcastUnreliable / #broadcastReliable
 *   - lastSentSnapshot diff-skip regressions (would manifest as low recv counts)
 *   - Reliable-channel ordering violations on spell casts
 *   - N² explosion bugs (test would time out)
 *   - Memory growth bugs (vitest reports heap usage)
 *
 * What this does NOT catch:
 *   - Real bandwidth saturation (fake channels deliver instantly)
 *   - Real WebRTC retransmit / queue / SCTP behavior
 *   - Browser-specific quirks
 *
 * For "what wire bytes look like over a real network" you want either wrtc or
 * a Playwright + WebRTC-internals capture — out of scope here.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { EVENT_BUS, CUSTOM_EVENTS } from '../../common/event-bus.js';
import { installFakeRTC, uninstallFakeRTC, resetFakeRTC } from './fake-rtc.js';
import {
  startTestServer,
  stopTestServer,
  spawnMeshOfSize,
  teardownAll,
  assertMeshHealthy,
  type TestServerHandle,
} from './mesh-test-utils.js';
import type { NetworkManager } from '../network-manager.js';
import type { PlayerUpdateBroadcast, SpellCastBroadcast } from '../types.js';

let server: TestServerHandle;

beforeAll(async () => {
  installFakeRTC();
  server = await startTestServer();
});

afterAll(async () => {
  uninstallFakeRTC();
  await stopTestServer(server);
});

beforeEach(() => {
  resetFakeRTC();
  EVENT_BUS.removeAllListeners();
});

afterEach(() => {
  EVENT_BUS.removeAllListeners();
});

/** Wait for all queued microtasks to drain so fake-channel deliveries complete. */
async function flushMicrotasks(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  }
}

/** Drive one synthetic tick: every NM emits one position update with mutated state. */
function emitTickPositions(nms: NetworkManager[], tickIdx: number): void {
  for (let i = 0; i < nms.length; i++) {
    const nm = nms[i];
    // Mutate x each tick so the lastSentSnapshot diff-skip does NOT fire.
    // Real gameplay positions change every frame too; this is a faithful proxy.
    nm.sendPlayerUpdate({
      x: 100 + i * 10 + tickIdx,
      y: 200 + i * 10,
      direction: 'DOWN',
      state: 'MOVE_STATE',
      element: 'FIRE',
    });
  }
}

/** Drive one synthetic spell cast from a single NM. */
function emitSpellFrom(nm: NetworkManager, tickIdx: number, idx: number): void {
  nm.sendSpellCast({
    spellId: `spell-${idx}-tick-${tickIdx}`,
    spellType: 'FIRE_BOLT',
    element: 'FIRE',
    x: 100,
    y: 200,
    direction: 'DOWN',
    targetX: 150,
    targetY: 250,
  });
}

describe('Mesh throughput — position updates', () => {
  it('20 peers × 100 ticks (= 5s @ 20Hz): zero packet loss on unreliable channel', async () => {
    const N = 20;
    const TICKS = 100;
    const nms = await spawnMeshOfSize(server, N, { deadlineMs: 15000 });
    assertMeshHealthy(nms);

    let posRecvCount = 0;
    const posPerSender = new Map<string, number>(); // playerId → received count for that sender
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE, (payload: PlayerUpdateBroadcast) => {
      posRecvCount++;
      posPerSender.set(payload.playerId, (posPerSender.get(payload.playerId) ?? 0) + 1);
    });

    const t0 = Date.now();
    for (let t = 0; t < TICKS; t++) {
      emitTickPositions(nms, t);
      // Flush every 10 ticks so message backlog stays manageable. (One flush at the end
      // also works, but periodic flushing better mirrors real-time delivery cadence.)
      if (t % 10 === 9) await flushMicrotasks(2);
    }
    await flushMicrotasks(8);
    const elapsedMs = Date.now() - t0;

    // Each tick: all N peers send → each send is received by N-1 peers.
    // Expected total = N × TICKS × (N - 1)
    const expectedTotal = N * TICKS * (N - 1);
    expect(posRecvCount, `expected ${expectedTotal} unreliable msgs across the mesh, got ${posRecvCount}`).toBe(
      expectedTotal,
    );

    // Each sender should be represented (N - 1) × TICKS times across all listeners
    // (we count emits, not per-NM receives — but every send triggers exactly one emit
    // per recipient NM, summing to N-1 emits per send for THAT sender).
    const perSenderExpected = TICKS * (N - 1);
    for (const nm of nms) {
      const got = posPerSender.get(nm.localPlayerId) ?? 0;
      expect(got, `sender ${nm.localPlayerId.slice(0, 8)}: expected ${perSenderExpected} emits, got ${got}`).toBe(
        perSenderExpected,
      );
    }

    // Print throughput numbers — visible in vitest's stdout when run with -v or when failing.
    const totalSent = N * TICKS;
    const sendsPerSec = (totalSent / elapsedMs) * 1000;
    const recvsPerSec = (posRecvCount / elapsedMs) * 1000;
    process.stderr.write(
      `\n[THROUGHPUT] 20p × 100 ticks: ${totalSent} sends, ${posRecvCount} receives in ${elapsedMs}ms\n` +
        `             throughput: ${sendsPerSec.toFixed(0)} sends/s, ${recvsPerSec.toFixed(0)} receives/s\n` +
        `             real-time equivalent: ~${(TICKS / 20).toFixed(1)}s @ 20Hz\n`,
    );

    teardownAll(nms);
  });

  it('20 peers × 600 ticks (= 30s @ 20Hz): zero loss, sustained load', async () => {
    const N = 20;
    const TICKS = 600;
    const nms = await spawnMeshOfSize(server, N, { deadlineMs: 15000 });
    assertMeshHealthy(nms);

    let posRecvCount = 0;
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE, () => {
      posRecvCount++;
    });

    const t0 = Date.now();
    for (let t = 0; t < TICKS; t++) {
      emitTickPositions(nms, t);
      if (t % 20 === 19) await flushMicrotasks(2);
    }
    await flushMicrotasks(16);
    const elapsedMs = Date.now() - t0;

    const expectedTotal = N * TICKS * (N - 1);
    expect(posRecvCount).toBe(expectedTotal);

    const totalSent = N * TICKS;
    const sendsPerSec = (totalSent / elapsedMs) * 1000;
    const recvsPerSec = (posRecvCount / elapsedMs) * 1000;
    process.stderr.write(
      `\n[THROUGHPUT] 20p × 600 ticks: ${totalSent} sends, ${posRecvCount} receives in ${elapsedMs}ms\n` +
        `             throughput: ${sendsPerSec.toFixed(0)} sends/s, ${recvsPerSec.toFixed(0)} receives/s\n` +
        `             real-time equivalent: ~${(TICKS / 20).toFixed(1)}s @ 20Hz\n`,
    );

    teardownAll(nms);
  });
});

describe('Mesh throughput — spell casts (reliable channel)', () => {
  it('6 peers × 60 ticks with 1 spell-cast every tick: every cast received exactly once per non-caster', async () => {
    const N = 6;
    const TICKS = 60;
    const nms = await spawnMeshOfSize(server, N);
    assertMeshHealthy(nms);

    let spellRecvCount = 0;
    const seenSpellIds = new Map<string, number>(); // spellId → number of times received
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_SPELL_CAST, (payload: SpellCastBroadcast) => {
      spellRecvCount++;
      seenSpellIds.set(payload.spellId, (seenSpellIds.get(payload.spellId) ?? 0) + 1);
    });

    let spellsCast = 0;
    for (let t = 0; t < TICKS; t++) {
      // Rotate who casts each tick.
      const casterIdx = t % N;
      emitSpellFrom(nms[casterIdx], t, casterIdx);
      spellsCast++;
      if (t % 10 === 9) await flushMicrotasks(2);
    }
    await flushMicrotasks(8);

    // Each spell cast → received by N-1 other peers, exactly once.
    const expectedRecv = spellsCast * (N - 1);
    expect(spellRecvCount).toBe(expectedRecv);

    // Every spellId should have been received exactly (N - 1) times (one per non-caster).
    for (const [spellId, count] of seenSpellIds) {
      expect(count, `spellId ${spellId} delivered ${count} times, expected ${N - 1}`).toBe(N - 1);
    }
    expect(seenSpellIds.size).toBe(spellsCast);

    process.stderr.write(`\n[THROUGHPUT] 6p × 60 spells: ${spellsCast} casts, ${spellRecvCount} receives, all unique\n`);

    teardownAll(nms);
  });

  it('reliable-channel ordering: 4 peers send 100 sequenced spells each, ordering preserved per sender', async () => {
    const N = 4;
    const SPELLS_PER_PEER = 100;
    const nms = await spawnMeshOfSize(server, N);
    assertMeshHealthy(nms);

    // For each (sender, receiver) pair, track the sequence of received spellIds.
    // Since EVENT_BUS doesn't tell us which NM was the receiver, we can only
    // assert "across all receivers, each sender's casts appeared in monotonic order".
    // Reliable channel is ordered, so the global sequence for any given sender's spells
    // (across all N-1 receivers) should interleave in a way that, when filtered by
    // sender, is strictly increasing — within the receiver's queue.
    // Simpler check: for each sender, the FIRST time each of their spellIds was seen
    // should be in cast order.
    const firstSeen = new Map<string, number>(); // spellId → recvIdx of first emission
    let recvIdx = 0;
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_SPELL_CAST, (payload: SpellCastBroadcast) => {
      if (!firstSeen.has(payload.spellId)) {
        firstSeen.set(payload.spellId, recvIdx);
      }
      recvIdx++;
    });

    // Cast in order: peer-0 casts spell 0..99, peer-1 casts 0..99, ...
    for (let i = 0; i < SPELLS_PER_PEER; i++) {
      for (let p = 0; p < N; p++) {
        nms[p].sendSpellCast({
          spellId: `peer${p}-seq${i}`,
          spellType: 'FIRE_BOLT',
          element: 'FIRE',
          x: 0,
          y: 0,
          direction: 'DOWN',
          targetX: 1,
          targetY: 1,
        });
      }
      if (i % 20 === 19) await flushMicrotasks(2);
    }
    await flushMicrotasks(16);

    // Per-sender monotonic first-seen check.
    for (let p = 0; p < N; p++) {
      let lastIdx = -1;
      for (let i = 0; i < SPELLS_PER_PEER; i++) {
        const id = `peer${p}-seq${i}`;
        const idx = firstSeen.get(id);
        expect(idx, `peer${p} spell ${i} never delivered`).toBeDefined();
        expect(idx!, `peer${p} spell ${i} delivered before its predecessor`).toBeGreaterThan(lastIdx);
        lastIdx = idx!;
      }
    }

    teardownAll(nms);
  });
});
