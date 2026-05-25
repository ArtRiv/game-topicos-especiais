/**
 * Multi-peer mesh formation test.
 *
 * Spins up N NetworkManager instances against an in-process socket.io server
 * that runs the SAME signaling-relay handlers as game-server/src/server.ts.
 * Uses fake-rtc.ts so the test runs in pure Node without a WebRTC binding.
 *
 * Assertions (per N):
 *   - every NM ends up with N-1 peer connections, all 'connected'
 *   - every NM has N-1 open unreliable channels + N-1 open reliable channels
 *   - debugSnapshot().meshHealth.healthy is true on every peer
 *   - no NM has a self-loop (peerConnections keyed by its own socketId)
 *   - pendingIceBuffer is empty on every peer after handshake settles
 *
 * Parameterized on N = 3, 6, 10, 20 so the same code exercises the original
 * 3p bug, the realistic college-event size, and the documented 10v10 ceiling.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { EVENT_BUS } from '../../common/event-bus.js';
import { installFakeRTC, uninstallFakeRTC, resetFakeRTC } from './fake-rtc.js';
import {
  startTestServer,
  stopTestServer,
  spawnMeshOfSize,
  teardownAll,
  assertMeshHealthy,
  type TestServerHandle,
} from './mesh-test-utils.js';

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

describe('Multi-peer mesh formation', () => {
  it('3 peers — every NM forms 2 PCs + 4 channels, all healthy', async () => {
    const nms = await spawnMeshOfSize(server, 3);
    assertMeshHealthy(nms);
    teardownAll(nms);
  });

  it('6 peers — every NM forms 5 PCs + 10 channels, all healthy', async () => {
    const nms = await spawnMeshOfSize(server, 6);
    assertMeshHealthy(nms);
    teardownAll(nms);
  });

  it('10 peers — every NM forms 9 PCs + 18 channels, all healthy', async () => {
    const nms = await spawnMeshOfSize(server, 10, { deadlineMs: 8000 });
    assertMeshHealthy(nms);
    teardownAll(nms);
  });

  it('20 peers (10v10 ceiling) — every NM forms 19 PCs + 38 channels, all healthy', async () => {
    const nms = await spawnMeshOfSize(server, 20, { deadlineMs: 15000 });
    assertMeshHealthy(nms);
    teardownAll(nms);
  });
});

describe('Mesh formation edge cases', () => {
  it('mesh stays healthy across teardownMesh + reconnect with a different player set', async () => {
    const first = await spawnMeshOfSize(server, 3);
    assertMeshHealthy(first);
    teardownAll(first);

    const second = await spawnMeshOfSize(server, 5);
    assertMeshHealthy(second);
    teardownAll(second);
  });

  it('every NM has a unique localPlayerId matching its MatchConfig entry', async () => {
    const nms = await spawnMeshOfSize(server, 4);
    const ids = new Set(nms.map((nm) => nm.localPlayerId));
    expect(ids.size).toBe(4);
    for (const nm of nms) {
      const me = nm.matchPlayers.find((p) => p.id === nm.localPlayerId);
      expect(me).toBeDefined();
      expect(me?.socketId).toBe(nm.socketId);
    }
    teardownAll(nms);
  });
});
