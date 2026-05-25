// Networking + host-authoritative damage tunables. Phase 1 LAN foundation +
// Phase 9.3 server-authoritative spell damage caps. Server has its own copies of
// the Phase-9.3 values; these client mirrors exist so the debug panel can adjust
// them at runtime via RUNTIME_CONFIG.

export const NETWORK_SERVER_URL = 'http://localhost';
export const NETWORK_SERVER_PORT = 3000;
// Network position-update rate. Spell casts + damage events are independent of this
// (they're event-driven over the reliable channel). Only outbound `pos` packets and
// the server-bound plausibility mirror ride this tick.
//
//   60 — intended default for the wired LAN event. Cuts worst-case observer latency
//        by ~33 ms vs 30 Hz and ~50 ms vs 20 Hz. Tested at the protocol layer to
//        ~32× headroom over 20-player 60 Hz load (see .planning/diagnostics/throughput-report.md).
//   30 — conservative fallback. Halves backpressure risk; still smoother than 20.
//   20 — original; ship-safe but visibly stutters when a remote player stops moving.
//
// This is the static *default*. Runtime can override via RUNTIME_CONFIG.NETWORK_TICK_RATE_HZ
// (debug-panel slider, persists for the session). NetworkManager.restartGameTick() applies
// the change without a page reload.
export const NETWORK_TICK_RATE_HZ = 60;
// Per-peer SCTP send-buffer ceiling for the unreliable position channel. When a peer's
// data channel has more bytes pending than this, NetworkManager skips the position send
// for that peer (the spell/event channel is unaffected). On a healthy LAN this never
// fires; the guard exists so a frozen/slow receiver cannot grow the local send buffer
// past the ~16 MB Chrome ceiling where send() starts throwing silently.
// 256 KB ≈ 2-3 seconds of position data per peer at 60 Hz.
export const MAX_UNRELIABLE_BUFFERED_BYTES = 256 * 1024;
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
