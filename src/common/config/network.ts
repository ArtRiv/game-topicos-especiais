// Networking + host-authoritative damage tunables. Phase 1 LAN foundation +
// Phase 9.3 server-authoritative spell damage caps. Server has its own copies of
// the Phase-9.3 values; these client mirrors exist so the debug panel can adjust
// them at runtime via RUNTIME_CONFIG.

export const NETWORK_SERVER_URL = 'http://localhost';
export const NETWORK_SERVER_PORT = 3000;
export const NETWORK_TICK_RATE_HZ = 20;
// TEMP for 3-player repro session — set false before shipping a build to the professor's server.
// Enabling this:
//   - emits per-event debug logs to the browser console (channel-open, ice-state, ice-buffered, mesh-health-check, etc.)
//   - exposes window.__NM__ so DevTools can call __NM__.debugSnapshot() to inspect mesh state
//   - logs 1Hz "sent/recv msg/s" metrics
export const NETWORK_DEBUG = true;

// Phase 9.3 — host-authoritative damage tunables (mirrored from game-server/src/types.ts).
// TODO: tune from playtest.
export const RESPAWN_DELAY_MS = 5000;
export const PLAUSIBILITY_RANGE_PX = 96;
export const PLAUSIBILITY_STALE_MS = 200;
export const MAX_SPELL_DAMAGE = 50;
