#!/usr/bin/env node
/**
 * stress-test.mjs — headless stress test for Socket.IO game server
 *
 * Simulates NUM_BOTS players connecting to the game server, going through the
 * full lobby flow, and then sending MessagePack-encoded player updates at a
 * configurable send rate.
 *
 * Usage:
 *   node scripts/stress-test.mjs \
 *     [--host <url>] \
 *     [--bots <n>] \
 *     [--duration <s>] \
 *     [--hz <n>]
 *
 * Examples:
 *   node scripts/stress-test.mjs
 *   node scripts/stress-test.mjs --hz 40
 *   node scripts/stress-test.mjs --host http://127.0.0.1:3000 --bots 20 --duration 60 --hz 40
 *
 * Defaults:
 *   host=http://127.0.0.1:3000
 *   bots=20
 *   duration=15
 *   hz=20
 *
 * What is measured
 * ─────────────────
 *   Throughput   — messages sent vs acks received per bot (% delivery)
 *   Send rate    — effective Hz actually achieved by bot sends / acks
 *   RTT latency  — round-trip time per ack (min / avg / p95 / max)
 *   Tick jitter  — standard deviation of actual bot send intervals
 *   Relay rate   — messages received per bot from peers (server relay health)
 *   Traffic      — bytes sent, bytes sent/sec, avg bytes/message
 *
 * Notes
 * ─────
 *   - This script controls ONLY bot/client send rate.
 *   - It does NOT change the server's internal tick rate.
 *   - To compare 20 Hz vs 40 Hz server tick properly, change the server config
 *     (or make the server read env/CLI args) before each run.
 */

import { io } from 'socket.io-client';
import { encode } from '@msgpack/msgpack';

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag, def) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def;
}

function toPositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const SERVER_URL = getArg('--host', 'http://127.0.0.1:3000');
const NUM_BOTS = toPositiveInt(getArg('--bots', '20'), 20);
const TEST_DURATION = toPositiveInt(getArg('--duration', '15'), 15) * 1000;
const SEND_RATE_HZ = toPositiveInt(getArg('--hz', '20'), 20);
const TICK_MS = 1000 / SEND_RATE_HZ;

// Directions / states / elements for varied (realistic) payloads
const DIRECTIONS = ['left', 'right', 'up', 'down'];
const STATES = ['idle', 'run', 'attack', 'crouch'];
const ELEMENTS = ['fire', 'ice', 'earth'];

// ─── Per-bot stats ───────────────────────────────────────────────────────────
function createStats() {
  return {
    sent: 0,
    acksReceived: 0,
    relayReceived: 0,
    latencies: [],
    tickIntervals: [],
    lastTickTs: 0,
    bytesSent: 0,
    errors: 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function randomPayload(botIndex) {
  return {
    x: Math.round(100 + botIndex * 12 + Math.random() * 5),
    y: Math.round(100 + botIndex * 8 + Math.random() * 5),
    direction: DIRECTIONS[botIndex % DIRECTIONS.length],
    state: STATES[Math.floor(Math.random() * STATES.length)],
    element: ELEMENTS[botIndex % ELEMENTS.length],
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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatBytesPerSecond(bytesPerSec) {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(2)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(2)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

function safePad(value, width = 32) {
  return String(value).padEnd(width);
}

// ─── Connect a single bot ────────────────────────────────────────────────────
function connectBot(botIndex) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      reconnection: false,
      timeout: 10000,
      transports: ['websocket'],
    });

    const stats = createStats();

    socket.on('connect_error', (err) => {
      reject(new Error(`Bot ${botIndex} connect error: ${err.message}`));
    });

    socket.on('connect', () => {
      resolve({ socket, stats, botIndex });
    });

    socket.on('game:player-update-mp', (_data, _fromSocketId) => {
      stats.relayReceived++;
    });

    socket.on('error', () => {
      stats.errors++;
    });
  });
}

// ─── Lobby flow ──────────────────────────────────────────────────────────────
async function setupLobby(bots) {
  const [host, ...guests] = bots;

  return new Promise((resolve) => {
    let lobbyId = null;

    host.socket.once('lobby:created', ({ lobby }) => {
      lobbyId = lobby.id;
      console.log(`[setup] Lobby created: ${String(lobbyId).slice(0, 8)}…`);

      guests.forEach(({ socket }, i) => {
        setTimeout(() => {
          socket.emit('lobby:join', {
            lobbyId,
            playerName: `Bot-${i + 1}`,
          });
        }, i * 30);
      });
    });

    host.socket.on('lobby:updated', ({ lobby }) => {
      if (lobby.players.length === NUM_BOTS) {
        console.log(`[setup] All ${NUM_BOTS} bots joined — starting match…`);
        host.socket.emit('lobby:start');
      }
    });

    let startedCount = 0;
    bots.forEach(({ socket }) => {
      socket.once('lobby:started', () => {
        startedCount++;
        if (startedCount === NUM_BOTS) {
          console.log('[setup] All bots received lobby:started — beginning stress test\n');
          resolve(lobbyId);
        }
      });
    });

    host.socket.emit('lobby:create', { playerName: 'Bot-0' });
  });
}

// ─── Run the send loop for one bot ───────────────────────────────────────────
function startBot(bot) {
  const { socket, stats, botIndex } = bot;

  const interval = setInterval(() => {
    if (!socket.connected) {
      clearInterval(interval);
      return;
    }

    const now = Date.now();

    if (stats.lastTickTs > 0) {
      stats.tickIntervals.push(now - stats.lastTickTs);
    }
    stats.lastTickTs = now;

    const payloadObject = randomPayload(botIndex);
    const payload = encode(payloadObject);

    stats.sent++;
    stats.bytesSent += payload.byteLength ?? payload.length ?? 0;

    socket.emit('game:player-update-mp', payload, (_serverTs) => {
      const rtt = Date.now() - now;
      stats.latencies.push(rtt);
      stats.acksReceived++;
    });
  }, TICK_MS);

  return interval;
}

// ─── Report ──────────────────────────────────────────────────────────────────
function printReport(bots, durationMs) {
  const durationSec = durationMs / 1000;

  let totalSent = 0;
  let totalAcks = 0;
  let totalRelay = 0;
  let totalBytesSent = 0;
  let totalErrors = 0;

  const allLatencies = [];
  const allTickIntervals = [];

  for (const { stats } of bots) {
    totalSent += stats.sent;
    totalAcks += stats.acksReceived;
    totalRelay += stats.relayReceived;
    totalBytesSent += stats.bytesSent;
    totalErrors += stats.errors;

    allLatencies.push(...stats.latencies);
    allTickIntervals.push(...stats.tickIntervals);
  }

  allLatencies.sort((a, b) => a - b);
  allTickIntervals.sort((a, b) => a - b);

  const ackRate = totalSent > 0 ? (totalAcks / totalSent) * 100 : 0;
  const effectiveHz = totalAcks / durationSec / NUM_BOTS;

  const avgRtt = avg(allLatencies);
  const p95Rtt = percentile(allLatencies, 95);
  const maxRtt = allLatencies[allLatencies.length - 1] ?? 0;
  const minRtt = allLatencies[0] ?? 0;

  const avgInterval = avg(allTickIntervals);
  const jitter = stddev(allTickIntervals);
  const maxDrift = allTickIntervals.length > 0
    ? Math.max(...allTickIntervals.map((v) => Math.abs(v - TICK_MS)))
    : 0;

  const avgRelayPerBot = totalRelay / NUM_BOTS;
  const expectedRelayPerBot = (NUM_BOTS - 1) * SEND_RATE_HZ * durationSec;
  const relayRate = expectedRelayPerBot > 0
    ? (avgRelayPerBot / expectedRelayPerBot) * 100
    : 0;

  const bytesPerSec = totalBytesSent / durationSec;
  const avgBytesPerMsg = totalSent > 0 ? totalBytesSent / totalSent : 0;

  const pass =
    effectiveHz >= Math.max(SEND_RATE_HZ - 1, SEND_RATE_HZ * 0.95) &&
    ackRate >= 99.0;

  const LINE = '═'.repeat(58);
  const line = '─'.repeat(58);

  console.log(`╔${LINE}╗`);
  console.log(`║${'  STRESS TEST REPORT'.padEnd(58)}║`);
  console.log(`╠${LINE}╣`);
  console.log(`║  Host:           ${safePad(SERVER_URL, 40)}║`);
  console.log(`║  Bots:           ${safePad(NUM_BOTS, 40)}║`);
  console.log(`║  Duration:       ${safePad(`${durationSec.toFixed(1)}s`, 40)}║`);
  console.log(`║  Target send:    ${safePad(`${SEND_RATE_HZ} Hz (${TICK_MS.toFixed(2)}ms/tick)`, 40)}║`);
  console.log(`╠${LINE}╣`);

  console.log(`║  THROUGHPUT                                              ║`);
  console.log(`║  ${line}  ║`);
  console.log(`║  Total sent:     ${safePad(totalSent, 40)}║`);
  console.log(`║  Total acks:     ${safePad(`${totalAcks} (${ackRate.toFixed(2)}%)`, 40)}║`);
  console.log(`║  Effective rate: ${safePad(`${effectiveHz.toFixed(2)} Hz / bot`, 40)}║`);
  console.log(`║  Relay received: ${safePad(`${totalRelay} (avg ${avgRelayPerBot.toFixed(0)}/bot, ${relayRate.toFixed(2)}%)`, 40)}║`);
  console.log(`║  Errors:         ${safePad(totalErrors, 40)}║`);
  console.log(`╠${LINE}╣`);

  console.log(`║  RTT LATENCY (ms)                                        ║`);
  console.log(`║  ${line}  ║`);
  console.log(`║  Min:            ${safePad(minRtt.toFixed(2), 40)}║`);
  console.log(`║  Avg:            ${safePad(avgRtt.toFixed(2), 40)}║`);
  console.log(`║  P95:            ${safePad(p95Rtt.toFixed(2), 40)}║`);
  console.log(`║  Max:            ${safePad(maxRtt.toFixed(2), 40)}║`);
  console.log(`╠${LINE}╣`);

  console.log(`║  SEND JITTER                                             ║`);
  console.log(`║  ${line}  ║`);
  console.log(`║  Mean interval:  ${safePad(`${avgInterval.toFixed(2)} ms`, 40)}║`);
  console.log(`║  Std deviation:  ${safePad(`${jitter.toFixed(2)} ms`, 40)}║`);
  console.log(`║  Max drift:      ${safePad(`${maxDrift.toFixed(2)} ms`, 40)}║`);
  console.log(`╠${LINE}╣`);

  console.log(`║  TRAFFIC                                                 ║`);
  console.log(`║  ${line}  ║`);
  console.log(`║  Total sent:     ${safePad(formatBytes(totalBytesSent), 40)}║`);
  console.log(`║  Sent rate:      ${safePad(formatBytesPerSecond(bytesPerSec), 40)}║`);
  console.log(`║  Avg msg size:   ${safePad(`${avgBytesPerMsg.toFixed(2)} B`, 40)}║`);
  console.log(`╠${LINE}╣`);

  if (pass) {
    console.log(`║  RESULT: ✓ PASS                                          ║`);
  } else {
    console.log(`║  RESULT: ✗ FAIL                                          ║`);
  }

  console.log(`╚${LINE}╝`);

  return {
    pass,
    summary: {
      host: SERVER_URL,
      bots: NUM_BOTS,
      durationSec,
      sendRateHz: SEND_RATE_HZ,
      ackRate,
      effectiveHz,
      avgRtt,
      p95Rtt,
      maxRtt,
      minRtt,
      avgInterval,
      jitter,
      maxDrift,
      totalBytesSent,
      bytesPerSec,
      avgBytesPerMsg,
      relayRate,
    },
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n[stress-test] Connecting ${NUM_BOTS} bots to ${SERVER_URL}…`);
  console.log(`[stress-test] Bot send rate configured to ${SEND_RATE_HZ} Hz (${TICK_MS.toFixed(2)}ms)`);

  let bots;
  try {
    bots = await Promise.all(
      Array.from({ length: NUM_BOTS }, (_, i) => connectBot(i)),
    );
  } catch (err) {
    console.error(`[stress-test] Connection failed: ${err.message}`);
    console.error('Make sure the server is running and accessible.');
    console.error('If local, try: --host http://127.0.0.1:3000');
    process.exit(1);
  }

  console.log(`[stress-test] All ${NUM_BOTS} bots connected`);

  await setupLobby(bots);

  const intervals = bots.map(startBot);

  const start = Date.now();
  process.stdout.write(`[stress-test] Running for ${TEST_DURATION / 1000}s`);
  const dotInterval = setInterval(() => process.stdout.write('.'), 1000);

  await new Promise((res) => setTimeout(res, TEST_DURATION));

  clearInterval(dotInterval);
  process.stdout.write('\n');

  const elapsed = Date.now() - start;

  intervals.forEach(clearInterval);

  await new Promise((res) => setTimeout(res, 500));

  bots.forEach(({ socket }) => socket.disconnect());

  const { pass } = printReport(bots, elapsed);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error('[stress-test] Fatal error:', err);
  process.exit(1);
});