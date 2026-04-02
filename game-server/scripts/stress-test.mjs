#!/usr/bin/env node
/**
 * stress-test.mjs — 20-bot headless stress test
 *
 * Simulates NUM_BOTS players connecting to the game server, going through the
 * full lobby flow, and then hammering the server with MessagePack-encoded
 * position updates at TICK_RATE_HZ (20 Hz / 50ms per tick).
 *
 * Usage:
 *   node scripts/stress-test.mjs [--host <url>] [--bots <n>] [--duration <s>]
 *
 * Defaults: host=http://localhost:3000, bots=20, duration=15
 *
 * What is measured
 * ─────────────────
 *   Throughput  — messages sent vs acks received per bot (% delivery)
 *   Tick rate   — effective Hz actually achieved (target 20 Hz)
 *   RTT latency — round-trip time per ack (min / avg / p95 / max)
 *   Tick jitter — standard deviation of actual tick intervals
 *   Relay rate  — messages received per bot from peers (server relay health)
 *
 * Pass/Fail criteria
 * ────────────────────
 *   PASS if effective tick rate ≥ 19.0 Hz AND avg RTT < 20ms AND ack rate ≥ 99%
 */

import { io } from 'socket.io-client';
import { encode, decode } from '@msgpack/msgpack';

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def;
};

const SERVER_URL    = getArg('--host', 'http://127.0.0.1:3000');
const NUM_BOTS      = parseInt(getArg('--bots', '20'), 10);
const TEST_DURATION = parseInt(getArg('--duration', '15'), 10) * 1000; // ms
const TICK_RATE_HZ  = 20;
const TICK_MS       = 1000 / TICK_RATE_HZ; // 50ms

// Directions / states / elements for varied (realistic) payloads
const DIRECTIONS = ['left', 'right', 'up', 'down'];
const STATES     = ['idle', 'run', 'attack', 'crouch'];
const ELEMENTS   = ['fire', 'ice', 'earth'];

// ─── Per-bot stats ────────────────────────────────────────────────────────────
function createStats() {
  return {
    sent: 0,
    acksReceived: 0,
    relayReceived: 0,       // messages received from other bots via server relay
    latencies: [],          // RTT samples in ms
    tickIntervals: [],      // actual ms between consecutive ticks
    lastTickTs: 0,
    errors: 0,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randomPayload(botIndex) {
  return {
    x:         Math.round(100 + botIndex * 12 + Math.random() * 5),
    y:         Math.round(100 + botIndex * 8  + Math.random() * 5),
    direction: DIRECTIONS[botIndex % DIRECTIONS.length],
    state:     STATES[Math.floor(Math.random() * STATES.length)],
    element:   ELEMENTS[botIndex % ELEMENTS.length],
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}

function avg(arr) {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

// ─── Connect a single bot ─────────────────────────────────────────────────────
function connectBot(botIndex) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      reconnection: false,
      timeout: 10000,
      transports: ['websocket'], // skip XHR polling — WebSocket only for lower overhead
    });
    const stats = createStats();

    socket.on('connect_error', (err) => reject(new Error(`Bot ${botIndex} connect error: ${err.message}`)));
    socket.on('connect', () => resolve({ socket, stats, botIndex }));

    // Count relay messages arriving from peers
    socket.on('game:player-update-mp', (_data, _fromSocketId) => {
      stats.relayReceived++;
    });
  });
}

// ─── Lobby flow ───────────────────────────────────────────────────────────────
async function setupLobby(bots) {
  const [host, ...guests] = bots;

  return new Promise((resolve) => {
    let lobbyId = null;

    // 1. Host creates lobby → receives lobbyId
    host.socket.once('lobby:created', ({ lobby }) => {
      lobbyId = lobby.id;
      console.log(`[setup] Lobby created: ${lobbyId.slice(0, 8)}…`);

      // 2. Stagger guest joins to avoid thunderherd on the server
      guests.forEach(({ socket }, i) => {
        setTimeout(() => {
          socket.emit('lobby:join', { lobbyId, playerName: `Bot-${i + 1}` });
        }, i * 30); // 30ms between each join
      });
    });

    // 3. Host monitors lobby updates and starts when all bots are in
    host.socket.on('lobby:updated', ({ lobby }) => {
      if (lobby.players.length === NUM_BOTS) {
        console.log(`[setup] All ${NUM_BOTS} bots joined — starting match…`);
        host.socket.emit('lobby:start');
      }
    });

    // 4. Wait for all bots to receive lobby:started
    let startedCount = 0;
    bots.forEach(({ socket }) => {
      socket.once('lobby:started', () => {
        startedCount++;
        if (startedCount === NUM_BOTS) {
          console.log(`[setup] All bots received lobby:started — beginning stress test\n`);
          resolve(lobbyId);
        }
      });
    });

    host.socket.emit('lobby:create', { playerName: 'Bot-0' });
  });
}

// ─── Run the game tick for one bot ────────────────────────────────────────────
function startBot(bot) {
  const { socket, stats, botIndex } = bot;

  const interval = setInterval(() => {
    if (!socket.connected) { clearInterval(interval); return; }

    const now = Date.now();
    if (stats.lastTickTs > 0) {
      stats.tickIntervals.push(now - stats.lastTickTs);
    }
    stats.lastTickTs = now;

    const payload = encode(randomPayload(botIndex));
    stats.sent++;

    socket.emit('game:player-update-mp', payload, (serverTs) => {
      const rtt = Date.now() - now;
      stats.latencies.push(rtt);
      stats.acksReceived++;
      void serverTs; // used implicitly for ack delivery confirmation
    });
  }, TICK_MS);

  return interval;
}

// ─── Report ───────────────────────────────────────────────────────────────────
function printReport(bots, durationMs) {
  const durationSec = durationMs / 1000;

  let totalSent         = 0;
  let totalAcks         = 0;
  let totalRelay        = 0;
  let allLatencies      = [];
  let allTickIntervals  = [];

  for (const { stats } of bots) {
    totalSent  += stats.sent;
    totalAcks  += stats.acksReceived;
    totalRelay += stats.relayReceived;
    allLatencies.push(...stats.latencies);
    allTickIntervals.push(...stats.tickIntervals);
  }

  allLatencies.sort((a, b) => a - b);
  allTickIntervals.sort((a, b) => a - b);

  const ackRate       = totalSent > 0 ? (totalAcks / totalSent) * 100 : 0;
  const effectiveHz   = totalAcks / durationSec / NUM_BOTS;
  const avgRtt        = avg(allLatencies);
  const p95Rtt        = percentile(allLatencies, 95);
  const maxRtt        = allLatencies[allLatencies.length - 1] ?? 0;
  const minRtt        = allLatencies[0] ?? 0;
  const avgInterval   = avg(allTickIntervals);
  const jitter        = stddev(allTickIntervals);
  const maxDrift      = allTickIntervals.length > 0
    ? Math.max(...allTickIntervals.map((v) => Math.abs(v - TICK_MS)))
    : 0;

  const avgRelayPerBot = totalRelay / NUM_BOTS;
  const expectedRelay  = (NUM_BOTS - 1) * TICK_RATE_HZ * durationSec;
  const relayRate      = expectedRelay > 0 ? (avgRelayPerBot / (expectedRelay / NUM_BOTS * NUM_BOTS / NUM_BOTS)) * 100 : 0;

  const pass =
    effectiveHz  >= 19.0 &&
    avgRtt        < 20   &&
    ackRate       >= 99.0;

  const LINE = '═'.repeat(50);
  const line = '─'.repeat(50);

  console.log(`╔${LINE}╗`);
  console.log(`║${'  STRESS TEST REPORT'.padEnd(50)}║`);
  console.log(`╠${LINE}╣`);
  console.log(`║  Bots:           ${String(NUM_BOTS).padEnd(32)}║`);
  console.log(`║  Duration:       ${(durationSec.toFixed(1) + 's').padEnd(32)}║`);
  console.log(`║  Target rate:    ${'20 Hz (50ms/tick)'.padEnd(32)}║`);
  console.log(`╠${LINE}╣`);
  console.log(`║  THROUGHPUT                                    ║`);
  console.log(`║  ${line}  ║`);
  console.log(`║  Total sent:     ${String(totalSent).padEnd(32)}║`);
  console.log(`║  Total acks:     ${(totalAcks + ` (${ackRate.toFixed(2)}%)`).padEnd(32)}║`);
  console.log(`║  Effective rate: ${(effectiveHz.toFixed(2) + ' Hz / bot').padEnd(32)}║`);
  console.log(`║  Relay received: ${(totalRelay + ` (avg ${avgRelayPerBot.toFixed(0)}/bot)`).padEnd(32)}║`);
  console.log(`╠${LINE}╣`);
  console.log(`║  RTT LATENCY (ms)                              ║`);
  console.log(`║  ${line}  ║`);
  console.log(`║  Min:            ${minRtt.toFixed(2).padEnd(32)}║`);
  console.log(`║  Avg:            ${avgRtt.toFixed(2).padEnd(32)}║`);
  console.log(`║  P95:            ${p95Rtt.toFixed(2).padEnd(32)}║`);
  console.log(`║  Max:            ${maxRtt.toFixed(2).padEnd(32)}║`);
  console.log(`╠${LINE}╣`);
  console.log(`║  TICK JITTER                                   ║`);
  console.log(`║  ${line}  ║`);
  console.log(`║  Mean interval:  ${(avgInterval.toFixed(2) + ' ms').padEnd(32)}║`);
  console.log(`║  Std deviation:  ${(jitter.toFixed(2) + ' ms').padEnd(32)}║`);
  console.log(`║  Max drift:      ${(maxDrift.toFixed(2) + ' ms').padEnd(32)}║`);
  console.log(`╠${LINE}╣`);

  if (pass) {
    console.log(`║  RESULT: ✓ PASS — server maintains 20 Hz    ║`);
  } else {
    console.log(`║  RESULT: ✗ FAIL — criteria not met:         ║`);
    if (effectiveHz < 19.0)
      console.log(`║    • Tick rate ${effectiveHz.toFixed(2)} Hz < 19.0 Hz threshold     ║`);
    if (avgRtt >= 20)
      console.log(`║    • Avg RTT ${avgRtt.toFixed(1)}ms ≥ 20ms threshold         ║`);
    if (ackRate < 99.0)
      console.log(`║    • Ack rate ${ackRate.toFixed(2)}% < 99% threshold          ║`);
  }
  console.log(`╚${LINE}╝`);

  return pass;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[stress-test] Connecting ${NUM_BOTS} bots to ${SERVER_URL}…`);

  // Connect all bots concurrently
  let bots;
  try {
    bots = await Promise.all(
      Array.from({ length: NUM_BOTS }, (_, i) => connectBot(i)),
    );
  } catch (err) {
    console.error(`[stress-test] Connection failed: ${err.message}`);
    console.error('Make sure the server is running: npm run dev (in game-server/)');
    console.error('If connecting locally, try: --host http://127.0.0.1:3000');
    process.exit(1);
  }

  console.log(`[stress-test] All ${NUM_BOTS} bots connected`);

  // Run lobby flow
  await setupLobby(bots);

  // Start all bot ticks
  const intervals = bots.map(startBot);

  // Run for TEST_DURATION
  const start = Date.now();
  process.stdout.write(`[stress-test] Running for ${TEST_DURATION / 1000}s`);
  const dotInterval = setInterval(() => process.stdout.write('.'), 1000);

  await new Promise((res) => setTimeout(res, TEST_DURATION));

  clearInterval(dotInterval);
  process.stdout.write('\n');

  const elapsed = Date.now() - start;

  // Stop all ticks
  intervals.forEach(clearInterval);

  // Drain pending acks (wait up to 500ms)
  await new Promise((res) => setTimeout(res, 500));

  // Disconnect all bots
  bots.forEach(({ socket }) => socket.disconnect());

  // Print results
  const passed = printReport(bots, elapsed);
  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('[stress-test] Fatal error:', err);
  process.exit(1);
});
