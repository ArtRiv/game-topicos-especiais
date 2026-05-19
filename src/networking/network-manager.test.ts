import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { NetworkManager } from './network-manager.js';
import { EVENT_BUS, CUSTOM_EVENTS } from '../common/event-bus.js';

// Setup a miniature socket.io server for integration tests
let httpServer: ReturnType<typeof createServer>;
let ioServer: Server;
let testPort: number;

beforeAll(() => {
  return new Promise<void>((resolve) => {
    httpServer = createServer();
    ioServer = new Server(httpServer, { cors: { origin: '*' } });
    httpServer.listen(0, () => {
      const addr = httpServer.address();
      testPort = typeof addr === 'object' && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => {
    ioServer.close();
    httpServer.close(() => resolve());
  });
});

beforeEach(() => {
  NetworkManager._resetInstance();
  EVENT_BUS.removeAllListeners();
});

afterEach(() => {
  NetworkManager._resetInstance();
  EVENT_BUS.removeAllListeners();
});

describe('NetworkManager', () => {
  describe('init / getInstance', () => {
    it('init returns a NetworkManager instance', () => {
      const nm = NetworkManager.init(`http://localhost:${testPort}`);
      expect(nm).toBeDefined();
    });

    it('init returns the same singleton on repeated calls', () => {
      const nm1 = NetworkManager.init(`http://localhost:${testPort}`);
      const nm2 = NetworkManager.init(`http://localhost:${testPort}`);
      expect(nm1).toBe(nm2);
    });

    it('getInstance throws before init', () => {
      expect(() => NetworkManager.getInstance()).toThrow('NetworkManager not initialized');
    });

    it('getInstance returns the initialized instance', () => {
      const nm = NetworkManager.init(`http://localhost:${testPort}`);
      expect(NetworkManager.getInstance()).toBe(nm);
    });
  });

  describe('localPlayerId and isConnected', () => {
    it('localPlayerId is empty string before any lobby:started', () => {
      const nm = NetworkManager.init(`http://localhost:${testPort}`);
      expect(nm.localPlayerId).toBe('');
    });

    it('isConnected is false before connect()', () => {
      const nm = NetworkManager.init(`http://localhost:${testPort}`);
      expect(nm.isConnected).toBe(false);
    });
  });

  describe('connect and disconnect', () => {
    it('connects to server and emits NETWORK_CONNECTED on EVENT_BUS', () => {
      return new Promise<void>((resolve) => {
        const nm = NetworkManager.init(`http://localhost:${testPort}`);
        EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, () => {
          expect(nm.isConnected).toBe(true);
          nm.disconnect();
          resolve();
        });
        nm.connect();
      });
    });
  });

  describe('send methods', () => {
    it('sendLobbyCreate emits lobby:create on socket', () => {
      return new Promise<void>((resolve) => {
        ioServer.once('connection', (socket) => {
          socket.once('lobby:create', (data: { playerName: string }) => {
            expect(data.playerName).toBe('TestPlayer');
            nm.disconnect();
            resolve();
          });
        });
        const nm = NetworkManager.init(`http://localhost:${testPort}`);
        nm.connect();
        EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, () => {
          nm.sendLobbyCreate('TestPlayer');
        });
      });
    });

    it('sendPlayerUpdate broadcasts via WebRTC (no socket emission)', () => {
      return new Promise<void>((resolve) => {
        let socketReceivedGameUpdate = false;
        ioServer.once('connection', (socket) => {
          socket.on('game:player-update', () => { socketReceivedGameUpdate = true; });
        });
        const nm = NetworkManager.init(`http://localhost:${testPort}`);
        nm.connect();
        EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, () => {
          nm.sendPlayerUpdate({ x: 100, y: 200, direction: 'DOWN', state: 'MOVE', element: 'FIRE' });
          // Give socket a tick to deliver if it were sent
          setTimeout(() => {
            expect(socketReceivedGameUpdate).toBe(false);
            nm.disconnect();
            resolve();
          }, 60);
        });
      });
    });

    it('lobby:started in browser-less env does not crash (RTCPeerConnection guard)', () => {
      return new Promise<void>((resolve) => {
        ioServer.once('connection', (socket) => {
          socket.once('connect', () => {});
          setTimeout(() => {
            socket.emit('lobby:started', {
              matchConfig: {
                lobbyId: 'test-lobby',
                players: [{ id: 'p1', socketId: socket.id, name: 'P1' }],
                mode: 'team-deathmatch',
              },
            });
          }, 50);
        });
        const nm = NetworkManager.init(`http://localhost:${testPort}`);
        nm.connect();
        EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_LOBBY_STARTED, () => {
          // localPlayerId set from matchConfig
          expect(nm.localPlayerId).toBe('p1');
          nm.disconnect();
          resolve();
        });
      });
    });
  });

  describe('teardownMesh()', () => {
    it('keeps socket connected after mesh teardown', async () => {
      const nm = NetworkManager.init(`http://localhost:${testPort}`);
      nm.connect();

      await new Promise<void>((resolve) => {
        EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, () => resolve());
      });

      expect(nm.isConnected).toBe(true);
      nm.teardownMesh();
      // Socket should still be connected
      expect(nm.isConnected).toBe(true);
      nm.disconnect();
    });

    it('clears match players after teardown', async () => {
      const nm = NetworkManager.init(`http://localhost:${testPort}`);
      nm.connect();

      await new Promise<void>((resolve) => {
        EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, () => resolve());
      });

      nm.teardownMesh();
      expect(nm.matchPlayers).toEqual([]);
      nm.disconnect();
    });
  });

  describe('startGameTick / stopGameTick', () => {
    it('stopGameTick stops the interval', () => {
      return new Promise<void>((resolve) => {
        const nm = NetworkManager.init(`http://localhost:${testPort}`);
        nm.connect();
        EVENT_BUS.once(CUSTOM_EVENTS.NETWORK_CONNECTED, () => {
          let callCount = 0;
          nm.startGameTick(() => {
            callCount++;
            return { x: 0, y: 0, direction: 'DOWN', state: 'IDLE', element: 'FIRE' };
          });
          setTimeout(() => {
            nm.stopGameTick();
            const countAtStop = callCount;
            setTimeout(() => {
              // No more calls after stop
              expect(callCount).toBe(countAtStop);
              nm.disconnect();
              resolve();
            }, 100);
          }, 80);
        });
      });
    });
  });
});
