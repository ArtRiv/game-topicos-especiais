// Networking + host-authoritative damage tunables. Phase 1 LAN foundation +
// Phase 9.3 server-authoritative spell damage caps. Server has its own copies of
// the Phase-9.3 values; these client mirrors exist so the debug panel can adjust
// them at runtime via RUNTIME_CONFIG.

export const NETWORK_SERVER_URL = 'http://localhost';
export const NETWORK_SERVER_PORT = 3000;

// ── Platform deployment (Feira de Jogos) ──────────────────────────────────────────────────────
// The platform serves the game same-origin under https://feira-de-jogos.dev.br/<slug>/ and reverse-
// proxies the Socket.io connection by a SLUG-PREFIXED path (the friend's Expelled game uses
// io({ path: '/expelled/socket.io' })). Fill GAME_SLUG with the slug the professor assigns; the
// server must set the SAME path in `new Server(httpServer, { path: '/<slug>/socket.io' })`.
//
// EMPTY = current LAN behavior (typed IP + :3000). Set it ONLY for the platform build.
// ASK PROF: the exact slug + whether the proxy path is `/<slug>/socket.io`.
export const GAME_SLUG = '';

/**
 * Resolve the Socket.io connection for the current environment, returning the (url, options) pair
 * passed to io(). Two modes:
 *   - PLATFORM (real HTTPS host + GAME_SLUG set, OR no IP typed): connect SAME-ORIGIN with the slug
 *     path. socket.io-client derives host+protocol from window.location (wss:// on https), so the
 *     booth never types an IP and there's no mixed-content risk.
 *   - LAN/DEV (an IP/host was typed, or localhost): connect to http(s)://<host>:<port> as before,
 *     protocol mirrored from the page so a typed host still works under https.
 */
export function resolveConnection(typedHost?: string): { url: string | undefined; options: { path?: string } } {
  const isBrowser = typeof window !== 'undefined' && !!window.location;
  const host = (typedHost ?? '').trim();
  const onRealDomain = isBrowser && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  // Platform: same-origin + slug path. Triggered when we're on a real domain with a slug configured,
  // or when no host was typed (the booth default).
  if (GAME_SLUG && (onRealDomain || host === '')) {
    return { url: undefined, options: { path: `/${GAME_SLUG}/socket.io` } };
  }

  // LAN/dev: explicit host:port, protocol mirrored from the page.
  const proto = isBrowser && window.location.protocol === 'https:' ? 'https' : 'http';
  const effectiveHost = host || 'localhost';
  const url = effectiveHost.includes(':') ? `${proto}://${effectiveHost}` : `${proto}://${effectiveHost}:${NETWORK_SERVER_PORT}`;
  return { url, options: {} };
}
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
