# 60Hz Tick Rate Feasibility — Analysis

**Date:** 2026-05-25
**Question:** Can we increase the network position-update tick from 20Hz to 60Hz for the LAN event?
**TL;DR:** **Yes — and the change is one constant. No simulation refactor required. Recommendation is 30Hz on LAN with a clear path to 60Hz if needed.** Full reasoning below.

---

## 1. Current timing architecture

### Where the Phaser game loop runs
[src/main.ts:44-71](../../src/main.ts#L44-L71) defines `gameConfig`. **There is no `fps` key in the config.** Phaser 3 defaults to a `requestAnimationFrame`-driven loop targeting 60 Hz. So the render + `scene.update()` loop runs at **60 Hz (variable, capped at vsync)**.

### Does the game simulation run every frame or use a fixed timestep?
**Every frame, variable-rate.** [src/scenes/game-scene.ts:269-297](../../src/scenes/game-scene.ts#L269-L297) — `GameScene.update(_time, delta)` runs every tick of Phaser's RAF loop. There is no fixed-timestep accumulator. All gameplay (combo updates, fire-breath channeling, dash input, range ring, interpolation, puddle interactions) runs every Phaser frame.

### Effective simulation rate
**~60 Hz** on the typical Chrome/Phaser RAF loop, dipping when the GPU/CPU is busy. Local player motion is per-frame (no tick clock). Only **network broadcasts** run at a separate slower clock.

### Input capture
Local input is captured **every Phaser frame** ([src/components/input/keyboard-component.ts](../../src/components/input/keyboard-component.ts)) via Phaser's `keyboardPlugin.addKey()` — these are polled in `update()` via state-machine `MoveState.onUpdate` ([src/components/state-machine/states/character/move-state.ts:20-22](../../src/components/state-machine/states/character/move-state.ts#L20-L22)) and the various input handlers in GameScene. There is no DOM event listener path; keys are read each frame.

### Local player movement: immediate or wait for network?
**Immediate.** [src/game-objects/player/player.ts:273](../../src/game-objects/player/player.ts#L273) — `body.setVelocity(nx * speed, ny * speed)` is applied synchronously in MoveState.onUpdate. **No client prediction or rollback** — but also no waiting for server confirmation. The local player simulates locally; the server only enters the loop for damage validation (Phase 9.3). Position is broadcast P2P for *other* clients to render.

This is the cheapest correct model for LAN PvP and it's a load-bearing assumption — see §6 below.

---

## 2. Current networking tick rate

### Where the tick is defined
**One place, one constant:** [src/common/config/network.ts:8](../../src/common/config/network.ts#L8) — `export const NETWORK_TICK_RATE_HZ = 20`.

### Where it's consumed
**One place, one consumer:** [src/networking/network-manager.ts:271-283](../../src/networking/network-manager.ts#L271-L283) — `startGameTick()`:

```ts
const intervalMs = Math.round(1000 / NETWORK_TICK_RATE_HZ);  // 50ms
this.#tickInterval = setInterval(() => {
  const payload = snapshotGetter();
  if (payload) {
    this.sendPlayerUpdate(payload);
    this.sendPosMirror({ x: payload.x, y: payload.y });
  }
}, intervalMs);
```

That's it. Position is sent on the interval; the server-bound mirror rides the same tick (used for plausibility validation in damage pipeline, not for rendering).

### Spell casts — immediate, not batched
[src/scenes/game-scene.ts:4021-4039](../../src/scenes/game-scene.ts#L4021-L4039) — `#onLocalSpellCast` fires `nm.sendSpellCast(...)` immediately when the local `SPELL_CAST` event bus event fires. This rides the **reliable** WebRTC channel and is delivered as soon as the channel can flush. **Independent of the 20Hz tick.** Same for spell hits, breath-start/end, earth-wall pillars.

### Separate rates / batching
None. There is one outbound interval (20Hz position) and event-driven sends for everything else. No rate limiter, no debounce, no batching aggregator.

### Other hidden latency contributors
The only "buffer" is `#lastSentSnapshot` diff-skip ([src/networking/network-manager.ts:222-235](../../src/networking/network-manager.ts#L222-L235)) — if position+state+element are byte-identical to the last sent snapshot, the send is suppressed. This is a correctness/bandwidth thing, not a latency thing — when state changes, it sends on the next 50ms tick. **At 20Hz this adds up to 50ms of latency on every position change.** Going to 60Hz cuts that to ~17ms.

There's no interpolation buffer on the receiver per se — see §6.

---

## 3. Feasibility of increasing to 60Hz

### What to change
**One file, one constant:**

```diff
- export const NETWORK_TICK_RATE_HZ = 20;
+ export const NETWORK_TICK_RATE_HZ = 60;
```

[src/common/config/network.ts:8](../../src/common/config/network.ts#L8). Hot-reload picks it up.

### What that affects vs. doesn't affect
| System | Affected? | Why |
|---|---|---|
| Outbound position packets | **Yes** | Goes from 20Hz to 60Hz |
| Outbound `sendPosMirror` (server-authoritative) | **Yes** | Rides same tick; server plausibility cache gets more samples |
| Simulation / physics | No | Already runs at ~60Hz on Phaser RAF |
| Spell casts | No | Always immediate |
| Damage validation | No | Server-side, event-driven |
| Animations | No | Phaser sprite framerate, independent |
| Cooldowns | No | Wall-clock ms |
| Collision | No | Arcade physics, per-frame |
| Interpolation buffer | **Yes (good way)** | Smaller gap between samples = less perceived latency |

### Hidden 50ms assumptions
I grepped for `50`, `1000 / 20`, `20`, `POSITION_SEND`, and `TICK_RATE` across the codebase. Only the single `NETWORK_TICK_RATE_HZ` constant matters. Other `tick` references are unrelated:
- Lava pool damage tick (600ms) — not network
- Mana regen tick — not network
- Fire breath damage tick (250ms) — not network
- Dash cooldown (250ms) — not network

The interpolation lerp speed at [src/scenes/game-scene.ts:3947](../../src/scenes/game-scene.ts#L3947) is `lerpSpeed = 20`. The "20" there is **a lerp coefficient (1/s)**, not a Hz — it means "approach target at 20 units of (delta/1000) per frame," i.e. an exponential follow. This is independent of the network tick. Coincidence of naming.

### Race conditions / duplicate sends / out-of-order
- **Duplicate sends:** None. `setInterval` doesn't queue if a previous send is in flight; each tick is independent.
- **Out-of-order:** The unreliable WebRTC channel (`ordered: false, maxRetransmits: 0`) is exactly the right delivery mode — late position packets DO arrive out of order and the receiver overwrites whichever target is latest. Higher tick rate exposes this slightly more but is benign.
- **GC pressure:** Each tick allocates one `payload` object + one JSON string. At 20Hz that's 20 small allocations/sec, at 60Hz it's 60. Negligible.

---

## 4. Performance impact

### CPU load comparison
From the existing throughput test ([throughput.test.ts:138-170](../../src/networking/__tests__/throughput.test.ts#L138-L170)): 20 peers × 600 ticks (30s @ 20Hz) processed **228,000 receives in ~320ms of single-thread JS time**. Equivalent processing rate: **~700,000 receives/sec at the protocol layer**.

At 60Hz, 20 peers × 1,800 ticks would generate **684,000 receives over 30 simulated seconds**. The fake-RTC test pegs that at roughly **3× the 20Hz cost → ~960ms of single-thread CPU over a real 30 seconds = ~3% sustained CPU**. The protocol layer has plenty of headroom (~95× at 20Hz becomes ~32× at 60Hz; still huge).

### Bandwidth comparison
A `sendPlayerUpdate` payload is `{type, x, y, direction, state, element, playerId}` — roughly 80-120 bytes after JSON serialization. With 20 players each sending to 19 others:
- **20Hz:** 20 × 20 × 19 × ~100 bytes = ~760 KB/sec aggregate across the mesh; per-client outbound = ~38 KB/sec
- **60Hz:** ~2.3 MB/sec aggregate; per-client outbound = ~114 KB/sec

LAN at 1 Gbps = ~125 MB/sec capacity. We'd use **~0.06% of LAN bandwidth at 20Hz, ~0.18% at 60Hz.** Either is rounding error.

### Sustained-load test plan
I'll add a parameterized throughput test (`throughput-hz.test.ts`) that runs the 20-peer scenario at 30Hz, 60Hz, and 120Hz to compare scaling. This is queued for §8.

---

## 5. Real LAN / WebRTC concerns at 60Hz

### What the fake-RTC test does NOT exercise
1. **SCTP send-buffer backpressure** — real `RTCDataChannel.send()` queues into the underlying SCTP transport. If the receiving peer is slow or the channel is congested, `bufferedAmount` rises. **The current code does not monitor or react to `bufferedAmount`** — we just call `send()` blindly.
2. **DTLS encryption overhead** — adds tens of microseconds per packet, irrelevant at 60Hz × 20 peers.
3. **Real LAN packet loss/reorder** — unordered/unreliable channel handles this correctly; the only risk is sustained loss eating into perceived smoothness, but on a wired uni LAN this is essentially zero.

### Position channel mode — already optimal
[src/networking/network-manager.ts:533](../../src/networking/network-manager.ts#L533):
```ts
pc.createDataChannel('pos', { ordered: false, maxRetransmits: 0 });
```

This is **UDP-equivalent**: unordered, no retransmits. Stale packets are simply dropped. Exactly what you want for 60Hz position updates — old samples should be discarded, not replayed.

### Spell channel mode
[src/networking/network-manager.ts:534](../../src/networking/network-manager.ts#L534):
```ts
pc.createDataChannel('events', { ordered: true });
```

Reliable + ordered. Correct for spell casts — you cannot drop a spell cast or deliver it before its predecessor. This channel is **not affected** by the position tick rate change.

### bufferedAmount monitoring — recommend adding
Real WebRTC SCTP has a default ~16 MB send buffer per channel. At 60Hz × 100 bytes × 19 peers = ~114 KB/sec per channel. To fill the 16 MB buffer would require ~140 seconds of sustained "receiver completely frozen" — practically impossible on a healthy LAN. **However:** Chrome will start refusing `send()` calls (throwing) once `bufferedAmount` exceeds 16 MB, which would silently corrupt the mesh.

I recommend adding a simple bufferedAmount guard: skip the position send for that peer if `ch.bufferedAmount > THRESHOLD_BYTES` (e.g. 256 KB = ~2 seconds of position data). This is defensive — should never fire on LAN, but if it does, the mesh degrades gracefully instead of crashing. Concrete implementation in §8.

---

## 6. Latency and smoothness

### Current interpolation buffer
There is **no time-based interpolation buffer**. [src/scenes/game-scene.ts:3946-3955](../../src/scenes/game-scene.ts#L3946-L3955):

```ts
#interpolateRemotePlayers(delta: number): void {
  const lerpSpeed = 20;
  const t = Math.min(1, lerpSpeed * (delta / 1000));
  for (const remote of this.#remotePlayers.values()) {
    // ...
    remote.x = Phaser.Math.Linear(remote.x, target.x, t);
    remote.y = Phaser.Math.Linear(remote.y, target.y, t);
  }
}
```

This is an **exponential follow** (lerp factor `1 - e^(-20·dt)` per frame, ~0.33 per 16ms frame). At 60Hz render + 20Hz network samples, the remote sprite converges to the latest received position over ~3 frames (~50ms) regardless of how stale the sample is. This is **interpolation-without-delay**: the rendered position is always chasing the latest received sample, never replaying historical samples.

**Consequence:** when the network rate goes from 20Hz to 60Hz, the *time between target updates* shrinks from 50ms to 17ms. The lerp follow stays at the same speed, so the visible result is smoother motion with effectively the same convergence behavior — just less stutter.

### Will 60Hz reduce perceived latency?
**Yes, by ~25-33 ms.** Breakdown of latency a remote viewer sees today (LAN, 20Hz):

| Source | At 20Hz | At 60Hz |
|---|---|---|
| Local player input → physics applied | <1 frame (~16ms) | <1 frame (~16ms) |
| Wait for next network tick | up to 50ms | up to 17ms |
| `lastSentSnapshot` diff-skip suppression | 0–50ms extra (if state stable) | 0–17ms extra |
| LAN RTT one-way | ~1ms | ~1ms |
| Remote interpolation follow (~3 frames) | ~50ms | ~50ms |
| **Total worst case** | **~167ms** | **~100ms** |

So going from 20Hz to 60Hz cuts worst-case end-to-end latency by ~40%. Best-case is unchanged (lerp follow dominates), but the *worst-case stutter when state changes slowly* is dramatically reduced.

### Client-side prediction / reconciliation
**No prediction, no reconciliation, no rollback.** The local player's movement is purely client-side — it never waits for or corrects against server state. The server only authoritatively validates damage events (Phase 9.3). Remote players are pure interpolation.

This means **the local player already feels immediate** — going to 60Hz doesn't help local feel at all. It only improves **how smoothly other clients see this player move**. Good news: that's a free win that doesn't require any prediction/reconciliation infrastructure.

### Recommended interpolation buffer for LAN
The current "no buffer, exponential follow" is correct for LAN-style ~1ms RTT. **I would not add a delayed interpolation buffer** (e.g. the Quake-style "render 100ms in the past" trick) — that adds latency unnecessarily on a LAN where the network is reliable.

Two micro-improvements worth considering after the event:
1. Replace lerp-follow with **two-sample linear extrapolation** between the prior and current samples — gives perfectly smooth motion at the cost of a single-sample (~17ms at 60Hz) buffer. Catnip when polished. Not necessary for event-day.
2. Switch from lerp-follow to **predicted-position-from-state**: if `state === 'MOVE_STATE'` and direction is known, extrapolate position from velocity rather than re-lerping. Eliminates the convergence stutter entirely. More work but more correct.

Both are post-event polish, not required for 60Hz to ship.

---

## 7. Recommended architecture

**Recommendation: 30Hz default, 60Hz toggle, with bufferedAmount guard.**

Reasoning:
- **30Hz** is the conservative win. Cuts worst-case latency by ~33ms, halves the suspect surface for SCTP backpressure, doubles the GC churn but it's negligible. Real competitive games (Overwatch, Valorant) ship at 30-60Hz tick. 30Hz is the safe default for any net code.
- **60Hz** is a clean win on a wired LAN with 20 players. We have the throughput evidence at the protocol layer; the only real-world unknown is SCTP buffering, which is unlikely to fire under measured loads.
- The change is so small (one constant) that the right move is **ship 30Hz to the event, measure real LAN with the dev-panel toggle, bump to 60Hz if it feels right at the smoke test**.

Why not the other options:
- **Keep 20Hz** — leaves perceived smoothness on the table for no good reason. The constant is one line; the throughput is fine.
- **Sim at 60Hz, net at 60Hz** — sim is already at 60Hz. No-op.
- **Sends at 30Hz, inputs immediate** — inputs aren't sent at all (no client prediction model); local player simulates locally. There's no "input" rate to speed up separately.
- **Adaptive tick by player count** — over-engineering for a college event. Add the bufferedAmount guard as a safety net, ship a fixed rate, done.

**Required defensive additions:**
1. Monitor `bufferedAmount` on the unreliable channel
2. Add the tick rate to RUNTIME_CONFIG so it's tunable from the in-game debug panel without recompiling

---

## 8. Implementation plan

### Files to modify

**1. [src/common/config/network.ts](../../src/common/config/network.ts)**
- Change `NETWORK_TICK_RATE_HZ = 20` → `30` (default for the event)
- Add a comment block explaining the choice and the LAN-vs-internet tradeoff

**2. [src/common/runtime-config.ts](../../src/common/runtime-config.ts)**
- Add `NETWORK_TICK_RATE_HZ` to the runtime-tunable set so the debug panel can adjust it live during smoke testing. Requires updating `startGameTick` to read from `RUNTIME_CONFIG` instead of the static `CONFIG` import.

**3. [src/networking/network-manager.ts](../../src/networking/network-manager.ts)**
Add three things:
- Read tick rate from RUNTIME_CONFIG so the debug panel can retune it
- Add a `restartGameTick()` method that the debug panel calls after changing the rate
- Add `bufferedAmount` guard in `#broadcastUnreliable`:
  ```ts
  const MAX_BUFFERED_BYTES = 256 * 1024;  // 256 KB ~ 2s of position data
  for (const ch of this.#unreliableChannels.values()) {
    if (ch.readyState === 'open' && ch.bufferedAmount < MAX_BUFFERED_BYTES) {
      ch.send(msg);
      this.#msgSentCount++;
    } else if (ch.bufferedAmount >= MAX_BUFFERED_BYTES) {
      this.#droppedDueToBuffer++;  // new diagnostic counter
    }
  }
  ```
- Surface the dropped counter in `debugSnapshot()` so we can see backpressure events.

**4. [src/debug/debug-panel.ts](../../src/debug/debug-panel.ts)**
- Add a slider for NETWORK_TICK_RATE_HZ (range 10-120, step 10)
- Wire it to call `NetworkManager.getInstance().restartGameTick()` on change

### Tests to add

**5. [src/networking/\_\_tests\_\_/throughput-hz.test.ts](../../src/networking/__tests__/throughput-hz.test.ts)** (new)
Parameterized throughput test running 20 peers × 30s simulated at 30Hz, 60Hz, 120Hz. Asserts zero loss/duplicates/out-of-order at each rate, prints comparison table to stderr.

**6. Existing tests**
- [throughput.test.ts](../../src/networking/__tests__/throughput.test.ts): no changes (already tests 20Hz baseline)
- [mesh-formation.test.ts](../../src/networking/__tests__/mesh-formation.test.ts), [disconnect.test.ts](../../src/networking/__tests__/disconnect.test.ts): no changes (rate-independent)

### Metrics to log during real LAN smoke test

When the smoke-test build runs at the prof's box:
1. `bufferedAmount` per channel (peak observed during a 5-minute match)
2. `dropped-due-to-buffer` counter (must be 0 at 30/60 Hz on LAN)
3. `[NET] sent/recv msg/s` (already logged — confirm matches expected count for the rate)
4. Local frame rate via Chrome DevTools Performance tab (should stay at solid 60 fps)
5. Subjective: do remote players feel smoother at 30Hz vs 60Hz?

### Risks

| Risk | Likelihood | Severity | Mitigation |
|---|---|---|---|
| SCTP send buffer fills under sustained 60Hz × 20p load on real Chrome | Low | High (silent send failure) | bufferedAmount guard, dropped counter, debug panel |
| Phaser frame rate drops because update() now has more inbound JSON parses | Low | Medium | Tested at protocol layer; profile in DevTools during smoke test |
| GC pressure from 3× allocation rate | Very low | Low | Allocations are tiny; modern V8 handles 60 small allocs/sec without measurable cost |
| Increased network traffic exposes a firewall throttle on the campus network | Low | High | LAN smoke test before the event reveals this |
| `setInterval` drift at 60Hz (16.67ms not a clean multiple of timer resolution) | Very low | Very low | Real-world drift is ~1-2ms over 30s, irrelevant for visual smoothness |

### Rollback plan

If the smoke test shows problems at 60Hz:
1. **First fallback:** flip back to 30Hz via the debug panel slider — zero rebuild required
2. **Second fallback:** edit `NETWORK_TICK_RATE_HZ` to 20, rebuild, re-deploy — five-minute revert
3. **If a bug is found:** the change is one line in one file; `git revert` reverses it cleanly

---

## Information needed for final recommendation

- **Current simulation Hz:** ~60 Hz (Phaser default RAF loop, variable but capped at vsync; no fixed timestep, [src/scenes/game-scene.ts:269](../../src/scenes/game-scene.ts#L269))
- **Current render behavior/FPS target:** Same as simulation — 60 Hz RAF. No separate render budget.
- **Current network position Hz:** 20 Hz, defined exactly once at [src/common/config/network.ts:8](../../src/common/config/network.ts#L8) and consumed exactly once at [src/networking/network-manager.ts:271-283](../../src/networking/network-manager.ts#L271-L283)
- **Current input capture frequency:** Every Phaser frame (~60 Hz). Polled via `Phaser.Input.Keyboard.KeyboardPlugin.addKey()`, no DOM listeners.
- **Current spell/ability send behavior:** Immediate, event-driven over the reliable channel. NOT batched into the position tick. Spell sends are unaffected by NETWORK_TICK_RATE_HZ.
- **Current interpolation delay:** Zero (no buffered delay). Remote player position uses exponential lerp-follow toward the latest received target ([src/scenes/game-scene.ts:3946-3955](../../src/scenes/game-scene.ts#L3946-L3955), lerp coefficient 20/sec). Converges in ~50ms regardless of network rate.
- **Current DataChannel mode for position updates:** `ordered: false, maxRetransmits: 0` — UDP-equivalent. Optimal for position data; old packets drop, latest wins.
- **Expected CPU/network impact at 60Hz:** 3× the current load. CPU: ~3% sustained (was ~1%); negligible. Bandwidth: ~0.18% of 1 Gbps LAN (was 0.06%); negligible. Memory/GC: negligible.
- **Main code changes required:** One constant change (`20` → `30` or `60`). Optionally: bufferedAmount guard (~10 lines), runtime-config tie-in (~15 lines), debug-panel slider (~5 lines). Total even with optionals: under 50 lines across 4 files.
- **Main risks:** (1) SCTP bufferedAmount growth under real-world load — unlikely on LAN but unmonitored; mitigated by the proposed guard. (2) Local Phaser frame rate degradation from increased inbound JSON parse load — protocol layer is fine, real-world frame impact is a smoke-test question. Both have clean rollback (debug-panel slider or one-line revert).
- **Your recommendation:** **Ship at 30Hz with the bufferedAmount guard + debug-panel slider in place. Run the LAN smoke test with the slider exposed; if 60Hz feels meaningfully smoother and `bufferedAmount` stays low, bump to 60Hz live during the test.** The architecture is unusually well-suited to this change because there's no fixed-timestep simulation, no client prediction, and no batching — only the outbound interval changes.
