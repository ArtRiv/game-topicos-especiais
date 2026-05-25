/**
 * Abrupt-disconnect tests for the WebRTC mesh.
 *
 * Validates that when a peer's socket dies abruptly (no clean teardownMesh call),
 * the remaining peers cleanly remove the dropped peer from every internal data
 * structure — peer connections, both channel maps, ICE buffer, socketToPlayerId,
 * AND #matchPlayers (so meshHealth.expectedPeers shrinks too).
 *
 * Failure modes this catches:
 *   - Stale entries in #peerConnections that fire ICE state events against
 *     closed PCs and spam errors / corrupt new connections
 *   - meshHealth permanently stuck at healthy=false because expectedPeers
 *     didn't shrink
 *   - The remaining mesh hangs / stops delivering traffic after a disconnect
 *
 * The test goes through the SAME server signaling path the production server uses:
 *   socket disconnect → server emits 'game:player-disconnected' → NetworkManager
 *   line 432+ runs cleanup. The fake-rtc layer is irrelevant here — this is a
 *   socket.io + NetworkManager state-mutation test.
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
import type { PlayerUpdateBroadcast } from '../types.js';
import type { NetworkManager } from '../network-manager.js';

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

async function flushMicrotasks(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  }
}

/** Wait for the server to notice a disconnect and broadcast game:player-disconnected. */
async function waitForDisconnectPropagation(): Promise<void> {
  // socket.io's local disconnect detection is near-instant in-process; one event-loop
  // turn is enough. Use a deadline as a defensive cap.
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

describe('Abrupt peer disconnect — cleanup', () => {
  it('6 peers: dropping one leaves the other 5 with shrunken-but-healthy mesh', async () => {
    const nms = await spawnMeshOfSize(server, 6);
    assertMeshHealthy(nms);

    // Drop peer index 2 abruptly (no teardownMesh — just kill the socket).
    const droppedPlayerId = nms[2].localPlayerId;
    const droppedSocketId = nms[2].socketId;
    nms[2].disconnect();

    await waitForDisconnectPropagation();

    const survivors = nms.filter((_, i) => i !== 2);

    for (const nm of survivors) {
      const snap = nm.debugSnapshot();
      // matchPlayers shrunk
      expect(snap.matchPlayers.length, 'matchPlayers should shrink after disconnect').toBe(5);
      expect(snap.matchPlayers.find((p) => p.id === droppedPlayerId)).toBeUndefined();
      // expectedPeers reflects new size
      expect(snap.meshHealth.expectedPeers).toBe(4);
      // PC + channels for the dropped peer are gone
      expect(snap.peerConnections.find((p) => p.peerSocketId === droppedSocketId)).toBeUndefined();
      expect(snap.unreliableChannels.find((c) => c.peerSocketId === droppedSocketId)).toBeUndefined();
      expect(snap.reliableChannels.find((c) => c.peerSocketId === droppedSocketId)).toBeUndefined();
      // socketToPlayerId map cleaned
      expect(snap.socketToPlayerId.find((e) => e.socketId === droppedSocketId)).toBeUndefined();
      // ICE buffer cleaned (nothing should have been buffered for a now-dead peer)
      expect(snap.pendingIceBuffer.find((b) => b.peerSocketId === droppedSocketId)).toBeUndefined();
      // And after all that, the survivor mesh should still report healthy.
      expect(snap.meshHealth.healthy, `survivor ${nm.localPlayerId} unhealthy after disconnect`).toBe(true);
    }

    teardownAll(survivors);
  });

  it('6 peers: multiple sequential disconnects each leave a healthy mesh', async () => {
    const nms = await spawnMeshOfSize(server, 6);
    assertMeshHealthy(nms);

    // Drop peer 0, then peer 3 (now at index 2 in the survivor list, but original idx 3)
    nms[0].disconnect();
    await waitForDisconnectPropagation();

    let survivors = nms.filter((_, i) => i !== 0);
    for (const nm of survivors) {
      expect(nm.debugSnapshot().meshHealth.healthy).toBe(true);
      expect(nm.debugSnapshot().meshHealth.expectedPeers).toBe(4);
    }

    nms[3].disconnect();
    await waitForDisconnectPropagation();

    survivors = nms.filter((_, i) => i !== 0 && i !== 3);
    for (const nm of survivors) {
      expect(nm.debugSnapshot().meshHealth.healthy).toBe(true);
      expect(nm.debugSnapshot().meshHealth.expectedPeers).toBe(3);
    }

    teardownAll(survivors);
  });

  it('6 peers: two simultaneous disconnects cleaned up independently', async () => {
    const nms = await spawnMeshOfSize(server, 6);

    nms[1].disconnect();
    nms[4].disconnect();
    await waitForDisconnectPropagation();

    const survivors = nms.filter((_, i) => i !== 1 && i !== 4);
    expect(survivors).toHaveLength(4);
    for (const nm of survivors) {
      const snap = nm.debugSnapshot();
      expect(snap.meshHealth.healthy).toBe(true);
      expect(snap.meshHealth.expectedPeers).toBe(3);
      expect(snap.matchPlayers.length).toBe(4);
    }
    teardownAll(survivors);
  });

  it('mesh continues delivering position updates between survivors after a disconnect', async () => {
    const nms = await spawnMeshOfSize(server, 5);

    let posRecvCount = 0;
    const fromDropped: Set<string> = new Set();
    const droppedPlayerId = nms[1].localPlayerId;
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PLAYER_UPDATE, (payload: PlayerUpdateBroadcast) => {
      posRecvCount++;
      if (payload.playerId === droppedPlayerId) fromDropped.add(payload.playerId);
    });

    // Drop peer 1.
    nms[1].disconnect();
    await waitForDisconnectPropagation();
    posRecvCount = 0;
    fromDropped.clear();

    const survivors = nms.filter((_, i) => i !== 1);
    // Each survivor sends 5 ticks; each send is received by other survivors.
    const TICKS = 5;
    for (let t = 0; t < TICKS; t++) {
      for (let i = 0; i < survivors.length; i++) {
        survivors[i].sendPlayerUpdate({
          x: 100 + i * 10 + t,
          y: 100,
          direction: 'DOWN',
          state: 'MOVE_STATE',
          element: 'FIRE',
        });
      }
      await flushMicrotasks(2);
    }
    await flushMicrotasks(8);

    // 4 survivors × 5 ticks × (4 - 1) recipients = 60 receives.
    const expected = survivors.length * TICKS * (survivors.length - 1);
    expect(posRecvCount).toBe(expected);
    // The dropped peer should never appear as a sender after we cleared the counter.
    expect(fromDropped.size).toBe(0);

    teardownAll(survivors);
  });
});

describe('Abrupt peer disconnect — emits NETWORK_PLAYER_DISCONNECTED on EVENT_BUS', () => {
  it('survivors see the EVENT_BUS event with the dropped playerId', async () => {
    const nms = await spawnMeshOfSize(server, 4);

    const seenDisconnects = new Set<string>();
    EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_PLAYER_DISCONNECTED, (payload: { playerId: string }) => {
      seenDisconnects.add(payload.playerId);
    });

    const droppedPlayerId = nms[2].localPlayerId;
    nms[2].disconnect();
    await waitForDisconnectPropagation();

    expect(seenDisconnects.has(droppedPlayerId)).toBe(true);

    teardownAll(nms.filter((_, i) => i !== 2));
  });
});
