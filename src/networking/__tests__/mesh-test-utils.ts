/**
 * Shared helpers for multi-peer mesh tests.
 *
 * Provides:
 *   - An in-process socket.io server with production-matching signaling relay
 *   - A minimal "match" abstraction so tests can broadcast lobby:started
 *     and game:player-disconnected without depending on game-server
 *   - spawnMeshOfSize / waitUntilHealthy / teardownAll helpers
 *   - assertMeshHealthy invariant checker
 *
 * Importers must call installFakeRTC() in beforeAll and uninstallFakeRTC() in afterAll.
 */

import { createServer, type Server as HttpServer } from 'http';
import { Server as IOServer, type Socket as ServerSocket } from 'socket.io';
import { expect } from 'vitest';
import { NetworkManager } from '../network-manager.js';
import type { MatchConfig, PlayerInfo } from '../types.js';

export type TestServerHandle = {
  httpServer: HttpServer;
  ioServer: IOServer;
  port: number;
  // socketId → playerId, populated as peers register against a "match"
  matchRoster: Map<string, string>;
  // Force-emit game:player-disconnected to every other connected client. The production
  // server does this via socket.io rooms; we keep it simple here and broadcast to all.
  emitPlayerDisconnected(playerId: string, exceptSocketId: string): void;
};

/**
 * Attaches signaling-relay handlers and a minimal "match" abstraction that the throughput
 * + disconnect tests need. Mirrors game-server/src/server.ts:229-239 (signaling) and
 * lines 324-341 (disconnect broadcast). Kept inline so this test file does not couple
 * to game-server's build chain.
 */
export function startTestServer(): Promise<TestServerHandle> {
  return new Promise((resolve) => {
    const httpServer = createServer();
    const ioServer = new IOServer(httpServer, { cors: { origin: '*' } });
    const matchRoster = new Map<string, string>();

    const handle: TestServerHandle = {
      httpServer,
      ioServer,
      port: 0,
      matchRoster,
      emitPlayerDisconnected(playerId: string, exceptSocketId: string) {
        for (const [, sock] of ioServer.sockets.sockets) {
          if (sock.id !== exceptSocketId) {
            sock.emit('game:player-disconnected', { playerId });
          }
        }
      },
    };

    ioServer.on('connection', (socket: ServerSocket) => {
      socket.on('webrtc:offer', ({ targetSocketId, offer }: { targetSocketId: string; offer: unknown }) => {
        ioServer.to(targetSocketId).emit('webrtc:offer', { fromSocketId: socket.id, offer });
      });
      socket.on('webrtc:answer', ({ targetSocketId, answer }: { targetSocketId: string; answer: unknown }) => {
        ioServer.to(targetSocketId).emit('webrtc:answer', { fromSocketId: socket.id, answer });
      });
      socket.on('webrtc:ice', ({ targetSocketId, candidate }: { targetSocketId: string; candidate: unknown }) => {
        ioServer.to(targetSocketId).emit('webrtc:ice', { fromSocketId: socket.id, candidate });
      });

      // Production server emits game:player-disconnected to the lobby room when a player
      // socket disconnects. Mirror that here so the test can observe the same client-side
      // cleanup path (NetworkManager line 421+ closes the PC for the dropped player).
      socket.on('disconnect', () => {
        const playerId = matchRoster.get(socket.id);
        if (!playerId) return;
        matchRoster.delete(socket.id);
        handle.emitPlayerDisconnected(playerId, socket.id);
      });
    });

    httpServer.listen(0, () => {
      const addr = httpServer.address();
      handle.port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve(handle);
    });
  });
}

export function stopTestServer(handle: TestServerHandle): Promise<void> {
  return new Promise((resolve) => {
    handle.ioServer.close();
    handle.httpServer.close(() => resolve());
  });
}

/**
 * Spawn N NetworkManagers, connect them all, build a MatchConfig out of their resolved
 * socket ids, then have the server simulate a `lobby:started` broadcast.
 * Waits until either all meshes report healthy or the deadline elapses; on failure,
 * throws with the full snapshot dump for debuggability.
 */
export async function spawnMeshOfSize(
  handle: TestServerHandle,
  n: number,
  opts: { deadlineMs?: number } = {},
): Promise<NetworkManager[]> {
  const deadlineMs = opts.deadlineMs ?? 5000;
  const url = `http://localhost:${handle.port}`;
  const nms = Array.from({ length: n }, () => NetworkManager._createForTest(url));

  // Connect all sockets in parallel. EVENT_BUS is shared across the N managers,
  // so we poll the public isConnected getter rather than EVENT_BUS.once.
  await Promise.all(
    nms.map(
      (nm) =>
        new Promise<void>((resolve) => {
          nm.connect();
          const interval = setInterval(() => {
            if (nm.isConnected && nm.socketId) {
              clearInterval(interval);
              resolve();
            }
          }, 10);
        }),
    ),
  );

  // Build PlayerInfo[] and register each into the server-side roster so disconnect-broadcast
  // knows the playerId mapping.
  const players: PlayerInfo[] = nms.map((nm, i) => {
    const playerId = `player-${i}-${nm.socketId}`;
    handle.matchRoster.set(nm.socketId, playerId);
    return { id: playerId, name: `Player${i}`, socketId: nm.socketId, team: i % 2 };
  });

  const matchConfig: MatchConfig = {
    lobbyId: 'test-lobby',
    players,
    mode: 'team-deathmatch',
    config: { format: '1v1', mapId: 'WORLD', maxPlayers: n },
  };

  for (const nm of nms) {
    handle.ioServer.to(nm.socketId).emit('lobby:started', { matchConfig });
  }

  // Wait for every mesh to settle healthy.
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    const snaps = nms.map((nm) => nm.debugSnapshot());
    if (snaps.every((s) => s.meshHealth.healthy)) return nms;
    await new Promise((r) => setTimeout(r, 25));
  }

  const finalSnaps = nms.map((nm, i) => ({ idx: i, snap: nm.debugSnapshot() }));
  throw new Error(
    `Mesh of ${n} did not become healthy within ${deadlineMs}ms. Snapshots:\n` +
      JSON.stringify(finalSnaps, null, 2),
  );
}

export function teardownAll(nms: NetworkManager[]): void {
  for (const nm of nms) {
    nm.teardownMesh();
    nm.disconnect();
  }
}

export function assertMeshHealthy(nms: NetworkManager[]): void {
  const n = nms.length;
  for (const nm of nms) {
    const snap = nm.debugSnapshot();
    expect(snap.meshHealth.healthy, `NM ${nm.localPlayerId} unhealthy: ${JSON.stringify(snap.meshHealth)}`).toBe(true);
    expect(snap.meshHealth.expectedPeers).toBe(n - 1);
    expect(snap.peerConnections.length).toBe(n - 1);
    expect(snap.unreliableChannels.length).toBe(n - 1);
    expect(snap.reliableChannels.length).toBe(n - 1);
    expect(snap.peerConnections.every((p) => p.iceState === 'connected')).toBe(true);
    expect(snap.unreliableChannels.every((c) => c.readyState === 'open')).toBe(true);
    expect(snap.reliableChannels.every((c) => c.readyState === 'open')).toBe(true);
    expect(snap.peerConnections.find((p) => p.peerSocketId === snap.socketId)).toBeUndefined();
    expect(snap.pendingIceBuffer).toEqual([]);
  }
}
