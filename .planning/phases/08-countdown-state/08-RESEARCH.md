# Phase 8: COUNTDOWN State - Research

**Researched:** 2026-05-15
**Domain:** Match lifecycle FSM extension (server timer + client cinematic), input gating, camera animation
**Confidence:** HIGH

## Summary

Phase 8 takes the working LOADING → COUNTDOWN → ACTIVE happy-path from Phase 7 (currently
stubbed as a 50ms `setTimeout` in `server.ts`) and turns it into a real ~3-4s server-driven
countdown that does four things visible to players:

1. **Locks input** on every client during `COUNTDOWN` so neither movement keys nor
   spell-cast keys (1/2/3) drive game-state changes (LFC-06, LFC-09).
2. **Animates the camera** from a zoomed-out cinematic view to the normal play zoom over
   ~3-4s (LFC-07).
3. **Shows a `3 → 2 → 1 → FIGHT!` overlay** in sync on every client (LFC-08).
4. **Unlocks combat simultaneously** on every client at the exact moment the server
   broadcasts `match:state-changed: ACTIVE` (LFC-09).

The codebase already has 90% of what we need. The server FSM (`game-room.ts`) accepts
`COUNTDOWN → ACTIVE` cleanly. The client already listens for `NETWORK_MATCH_STATE_CHANGED`
and ships `serverTs` for sync. The input system already has a global `isMovementLocked`
flag honored by every player state. The only thing we need to invent is the **countdown
timer/tick discipline on the server** and the **scene that renders the overlay + animates
the camera** on the client.

**Primary recommendation:** Server owns ALL countdown timing. Replace the Phase-7 50ms
stub with a single `setTimeout` per countdown number (3, 2, 1, FIGHT, then transitionTo
'ACTIVE'). Broadcast each tick as a `match:countdown-tick` event carrying the integer
remaining (3, 2, 1, 0) plus `serverTs`. Client listens on the same `NETWORK_MATCH_STATE_CHANGED`
event for the `COUNTDOWN` transition (PreloadScene's GameScene-start hook) and on a new
`NETWORK_MATCH_COUNTDOWN_TICK` event for the per-second overlay update. Movement/spell
input is locked the moment GameScene receives the `COUNTDOWN` broadcast and unlocked the
moment it receives the `ACTIVE` broadcast — using the existing `controls.isMovementLocked`
flag plus a new same-scope `#combatLocked` flag for spells (because `isMovementLocked`
alone doesn't block spell casts — see Architecture Patterns).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LFC-06 | During COUNTDOWN, players are locked at spawn — movement and spell casting disabled on all clients | `controls.isMovementLocked` already blocks movement & state-machine-driven spell casts (`idle-state.ts:34`, `move-state.ts:20`). EarthWall + FireBreath casts go through scene-level handlers and need a separate `#combatLocked` guard. |
| LFC-07 | Camera animates from zoomed-out to normal play zoom over ~3–4 seconds during countdown | `Phaser.Cameras.Scene2D.Camera.zoomTo(zoom, duration, ease)` is the canonical Phaser 3 API. Existing `setupCamera()` calls `cameras.main.startFollow(player)` — we add `setZoom(0.6)` initially and `zoomTo(1.0, 3000, 'Sine.easeOut')` on COUNTDOWN. |
| LFC-08 | A visible `3 → 2 → 1 → FIGHT!` overlay is shown on all clients during countdown | Render in a new UI overlay scene OR in GameScene itself with `setScrollFactor(0)` text. Driven by per-second server tick broadcast — not by client clock — to survive background-tab throttling. |
| LFC-09 | Movement and spell casting unlock simultaneously on all clients at COUNTDOWN → ACTIVE transition | The existing `match:state-changed: ACTIVE` broadcast already drives every client at the same instant. Listener flips `isMovementLocked = false` and `#combatLocked = false`. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Countdown timing & ticks | game-server (Node) | — | Server-authoritative timing is the canonical fix for Phaser clock pause on background tabs (Phase 7 lesson). |
| FSM transition COUNTDOWN→ACTIVE | game-server (`game-room.ts` + `server.ts`) | — | FSM already lives here; the Phase-7 STUB at server.ts:119-131 is the exact replacement site. |
| Input lock state | client (`GameScene` + `InputComponent`) | — | The lock flag is already in `InputComponent`; the gate already exists in the state machine. |
| Countdown overlay rendering | client (new `CountdownScene` or GameScene UI text) | — | Pure presentation — must coexist with GameScene/UI scene already running. |
| Camera zoom animation | client (`GameScene`) | — | Camera is created and owned by GameScene; tween belongs alongside `#setupCamera`. |
| Event transport | socket.io (existing) | — | Reliable, already used for `match:state-changed`. No new transport needed. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Phaser | 3.87.0 | Game engine; provides `Camera.zoomTo()`, `Scene.events`, tween system | Already locked at project root `package.json`. No upgrade needed. [VERIFIED: package.json line "phaser": "3.87.0"] |
| socket.io | 4.8.3 (client) / 4.8.0+ (server) | Reliable event transport for FSM broadcasts and countdown ticks | Already in use for `match:state-changed`; new tick event reuses the same channel. [VERIFIED: package.json] |
| TypeScript | 5.7.3 | Type-safe shared payload types | Already in use; mirror-types discipline already established. [VERIFIED: package.json] |
| vitest | ^4.1.6 (client) / ^2.1.8 (server) | Test framework for FSM unit tests | Phase 7 added 13 tests in `game-room.test.ts`; same pattern continues. [VERIFIED: package.json] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Phaser tweens | (built-in) | Camera zoom animation, optional overlay scale/fade | Use `cameras.main.zoomTo()` — wraps a tween internally with correct camera handling. Tween `setVisibilityChange` config is already inherited from `gameConfig` (no override needed). |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `setTimeout` chain on server | `setInterval` with counter | `setTimeout` chain is easier to cancel (single handle per pending tick); `setInterval` requires extra bookkeeping for "did the room get destroyed mid-countdown" — see Phase 7 WR-07. |
| Per-second `match:countdown-tick` broadcast | Single `COUNTDOWN` broadcast with `durationMs` and let client run its own ticks | **Rejected.** Phase 7 LFC-04 lesson explicitly identified Phaser clock pause on background tabs as a sync hazard. Server-driven ticks make the worst case visibly stutter rather than silently desync. |
| New `CountdownScene` (separate Phaser Scene overlay) | Render overlay inside `GameScene` with `setScrollFactor(0)` text | **Prefer in-GameScene text** — the overlay is short-lived (~3-4s), only needs 1 text object + maybe a tween, and adding a 3rd parallel scene (alongside `GameScene` + `UiScene`) increases scene-lifecycle complexity. See Architecture Patterns for the recommended layout. |
| Server broadcasts `serverTs`-based ticks; client extrapolates | Server broadcasts exact integer per tick | Extrapolation introduces drift on slow networks. The numbers are 3/2/1/FIGHT — there's no precision gained from extrapolation. |

**Installation:** No new dependencies. [VERIFIED: scope check against Phase 7 STATE.md decision "Zero new dependencies needed -- existing stack covers all v1.2 requirements"]

## Package Legitimacy Audit

> Not applicable — Phase 8 installs no new packages. All required functionality is in
> existing Phaser/socket.io/vitest already verified in earlier phases.

## Architecture Patterns

### System Architecture Diagram

```
                     ┌────────────────────────────────────────────┐
                     │  game-server (Node)                        │
                     │                                            │
                     │  match:loaded (all acks) ───┐              │
                     │                             ▼              │
                     │  GameRoom.transitionTo('COUNTDOWN')        │
                     │                             │              │
                     │            ┌────────────────┴──────────┐   │
                     │            ▼                           ▼   │
                     │  broadcast match:state-changed   schedule countdown
                     │  state='COUNTDOWN'+serverTs      ticks via setTimeout
                     │                                  chain (or single timer)
                     │                                          │
                     │  ┌───────────────────────────────────────┘
                     │  │   t+0s    broadcast tick {remaining: 3}
                     │  │   t+1s    broadcast tick {remaining: 2}
                     │  │   t+2s    broadcast tick {remaining: 1}
                     │  │   t+3s    broadcast tick {remaining: 0, label: 'FIGHT'}
                     │  │   t+3.5s  GameRoom.transitionTo('ACTIVE')
                     │  │           broadcast match:state-changed state='ACTIVE'
                     │  └─→ store timer handle on GameRoom for cancellation
                     └────────────┬───────────────────────────────┘
                                  │ socket.io reliable
                  ┌───────────────┴────────────────┐
                  ▼                                ▼
   ┌─────────────────────────┐         ┌─────────────────────────┐
   │  Client A               │         │  Client B               │
   │                         │         │                         │
   │  NetworkManager         │         │  NetworkManager         │
   │  emits EVENT_BUS:       │         │  (same as Client A)     │
   │   NETWORK_MATCH_STATE_  │         │                         │
   │     CHANGED             │         │                         │
   │   NETWORK_MATCH_        │         │                         │
   │     COUNTDOWN_TICK      │         │                         │
   │                         │         │                         │
   │  GameScene listens:     │         │                         │
   │   on COUNTDOWN →        │         │                         │
   │     • set controls.     │         │                         │
   │       isMovementLocked  │         │                         │
   │       = true            │         │                         │
   │     • set #combatLocked │         │                         │
   │       = true            │         │                         │
   │     • cameras.main      │         │                         │
   │       .setZoom(0.6)     │         │                         │
   │       .zoomTo(1.0,3000) │         │                         │
   │     • show overlay text │         │                         │
   │   on COUNTDOWN_TICK →   │         │                         │
   │     • setText("3"/"2"/  │         │                         │
   │       "1"/"FIGHT!")     │         │                         │
   │   on ACTIVE →           │         │                         │
   │     • clear locks       │         │                         │
   │     • hide overlay      │         │                         │
   └─────────────────────────┘         └─────────────────────────┘
```

**Data flow summary:**
1. Server completes LOADING sync barrier → transitions to COUNTDOWN → broadcasts state.
2. Server schedules 4 ticks (3, 2, 1, FIGHT) + 1 transition to ACTIVE.
3. Each tick broadcasts a tick event; tick #4 ("FIGHT") fires shortly before the ACTIVE transition for visual overlap.
4. ACTIVE broadcast unlocks input on every client at the same instant.

### Recommended Project Structure

```
game-server/src/
├── game-room.ts           # ADD: #countdownTimers handle, startCountdown(), clearCountdownTimers()
├── server.ts              # MODIFY: replace Phase-7 STUB with startCountdown() call;
│                          #         add disconnect-mid-countdown cleanup
└── types.ts               # ADD: MatchCountdownTickPayload, COUNTDOWN_DURATION_MS constant

src/
├── networking/
│   ├── types.ts           # MIRROR: MatchCountdownTickPayload
│   └── network-manager.ts # ADD: socket.on('match:countdown-tick', ...) → EVENT_BUS emit
├── common/
│   └── event-bus.ts       # ADD: NETWORK_MATCH_COUNTDOWN_TICK constant
└── scenes/
    └── game-scene.ts      # MODIFY: subscribe to NETWORK_MATCH_STATE_CHANGED and
                           # NETWORK_MATCH_COUNTDOWN_TICK in #setupNetworking;
                           # add #combatLocked field; gate EarthWall + FireBreath on it;
                           # initial setZoom(0.6) in #setupCamera until COUNTDOWN arrives;
                           # add #countdownText overlay (in-GameScene, setScrollFactor(0))
```

### Pattern 1: Server-side countdown timer (replaces Phase-7 STUB)

**What:** Replace the `setTimeout(...50)` stub in `server.ts:119-131` with a chained
`setTimeout` sequence that broadcasts ticks every 1000ms, stores its handles on the
`GameRoom`, and clears them if the room is destroyed.

**When to use:** Always — single canonical implementation, called once per
LOADING→COUNTDOWN transition.

**Example:**
```typescript
// game-room.ts — add state
export class GameRoom {
  #countdownHandles: NodeJS.Timeout[] = [];

  clearCountdownTimers(): void {
    for (const h of this.#countdownHandles) clearTimeout(h);
    this.#countdownHandles = [];
  }

  pushCountdownHandle(h: NodeJS.Timeout): void {
    this.#countdownHandles.push(h);
  }
}

// server.ts — replace lines 119-131 (the Phase-7 STUB) with:
const COUNTDOWN_DURATION_MS = 3000;   // 3-2-1 happens over 3s
const FIGHT_HOLD_MS = 500;            // "FIGHT!" stays visible for 500ms before ACTIVE

function startCountdown(lobbyId: string, room: GameRoom): void {
  const ticks: { atMs: number; remaining: number; label: string }[] = [
    { atMs: 0,    remaining: 3, label: '3' },
    { atMs: 1000, remaining: 2, label: '2' },
    { atMs: 2000, remaining: 1, label: '1' },
    { atMs: 3000, remaining: 0, label: 'FIGHT' },
  ];

  for (const tick of ticks) {
    const handle = setTimeout(() => {
      if (gameRooms.get(lobbyId) !== room) return;   // room replaced — drop
      if (room.state !== 'COUNTDOWN') return;        // already ENDED — drop
      io.to(`lobby:${lobbyId}`).emit('match:countdown-tick', {
        lobbyId, remaining: tick.remaining, label: tick.label, serverTs: Date.now(),
      });
    }, tick.atMs);
    room.pushCountdownHandle(handle);
  }

  const activeHandle = setTimeout(() => {
    if (gameRooms.get(lobbyId) !== room) return;
    if (room.state !== 'COUNTDOWN') return;
    try { room.transitionTo('ACTIVE'); } catch { return; }
    broadcastMatchState(lobbyId, room);
  }, COUNTDOWN_DURATION_MS + FIGHT_HOLD_MS);
  room.pushCountdownHandle(activeHandle);
}
```

### Pattern 2: Client input lock (extends existing `isMovementLocked`)

**What:** Two flags: `controls.isMovementLocked` blocks WASD movement and the state-machine-
driven spell branches (slots 1 & 2). A new scene-local `#combatLocked` flag blocks the two
scene-level spell handlers that DON'T go through the state machine.

**Why two flags:** `isMovementLocked` is checked in `idle-state.ts:34` and `move-state.ts:20`
BEFORE the spell-cast branches, so setting it to `true` already blocks Spell 1 and Spell 2.
But:
- **FireBreath (Spell 3)** is driven by `#updateFireBreathChanneling()` in
  `game-scene.ts:209` — it reads `controls.isSpell3KeyDown` directly from the scene update
  loop and is NOT gated by `isMovementLocked`.
- **EarthWall (Spell 3 when Earth element active)** is driven by `#updateEarthWallSpell()` in
  `game-scene.ts:506` — same story, scene-level handler, not state-machine.

A scene-local `#combatLocked` guarded at the top of both handlers covers them cleanly. Both
existing scene handlers already have early-return guards (`if (!this.#player?.active) return;`)
so adding `if (this.#combatLocked) return;` follows the established pattern.

**When to use:** Always — set both at the moment GameScene receives `COUNTDOWN`, clear both
at the moment it receives `ACTIVE`.

**Example:**
```typescript
// game-scene.ts — add field and event handler
#combatLocked: boolean = true;   // start locked; cleared on ACTIVE

#onMatchStateChanged = (payload: MatchStateChangedPayload): void => {
  if (payload.state === 'COUNTDOWN') {
    this.#controls.isMovementLocked = true;
    this.#combatLocked = true;
    (this.#player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.cameras.main.setZoom(0.6);                       // jump to zoomed-out
    this.cameras.main.zoomTo(1.0, 3000, 'Sine.easeOut'); // animate to play zoom
    this.#showCountdownOverlay();
  } else if (payload.state === 'ACTIVE') {
    this.#controls.isMovementLocked = false;
    this.#combatLocked = false;
    this.#hideCountdownOverlay();
  }
};

// #updateFireBreathChanneling and #updateEarthWallSpell each gain:
//   if (this.#combatLocked) return;
// at the very top, alongside the existing player-active guards.
```

### Pattern 3: Server-driven countdown overlay (LFC-08)

**What:** GameScene renders a single Phaser Text object with `setScrollFactor(0)` and
`setDepth(1000)`. The text content is updated entirely by inbound tick events — the client
never runs its own countdown clock.

**Why:** Mirrors the Phase 7 LFC-04 lesson. Phaser's clock pauses when the tab is backgrounded
on most browsers (see Sources). A client-side timer can drift seconds behind the server. Server
ticks are simple, observable in DevTools, and don't require minimum-display anchoring like
LoadingScene did.

**Example:**
```typescript
// game-scene.ts
#countdownText: Phaser.GameObjects.Text | null = null;

#showCountdownOverlay(): void {
  if (!this.#countdownText) {
    this.#countdownText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      '',
      { fontFamily: '"Press Start 2P"', fontSize: '48px', color: '#ffdd55' },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
  }
  this.#countdownText.setText('').setVisible(true);
}

#onCountdownTick = (payload: MatchCountdownTickPayload): void => {
  if (!this.#countdownText) return;
  this.#countdownText.setText(payload.label);
  // Optional juice: scale-bounce per tick
  this.tweens.add({
    targets: this.#countdownText,
    scale: { from: 1.3, to: 1.0 }, duration: 250, ease: 'Back.easeOut',
  });
};

#hideCountdownOverlay(): void {
  this.#countdownText?.setVisible(false);
}
```

### Pattern 4: Cleanup on listener registration (apply Phase 7 WR-04 lesson forward)

Every EVENT_BUS subscription must be paired with an `off()` in the matching
`Phaser.Scenes.Events.SHUTDOWN` handler. GameScene's existing `#registerCustomEvents()`
SHUTDOWN block (line 899) is the right place; add `NETWORK_MATCH_STATE_CHANGED` and
`NETWORK_MATCH_COUNTDOWN_TICK` to both the `on()` calls and the `off()` calls.

### Anti-Patterns to Avoid

- **Client-driven countdown clock.** Don't write `setInterval(() => updateText(--n), 1000)`
  in GameScene. Phaser's clock pauses on backgrounded tabs and falls behind real time.
  Server ticks are the source of truth.

- **Multiple Phaser scenes for the overlay.** Don't `scene.launch(COUNTDOWN_SCENE)` —
  Phaser already has 2 parallel scenes (`GameScene` + `UiScene`), and adding a third
  creates a 3-way scene lifecycle that's harder to clean up on disconnect. A single
  `setScrollFactor(0)` text object is enough.

- **Using GameRoom STUB pattern names without removing the STUB.** Grep for
  `"Phase 7 STUB"` in `server.ts` — it MUST be removed in this phase. Leaving it in
  alongside the real countdown creates a race: both `setTimeout`s would fire, the
  second triggering `transitionTo('ACTIVE')` from an already-ACTIVE room (throws,
  caught, but creates duplicate broadcasts). The single search-and-replace target
  is `grep -n "Phase 7 STUB" game-server/src/server.ts` — must read 0 hits after
  this phase.

- **Hand-rolled tween for camera zoom.** Don't write `tweens.add({ targets:
  cameras.main, zoom: 1.0 })`. Use `cameras.main.zoomTo(1.0, 3000)` — it's the
  official Phaser API and handles internal camera state correctly. [CITED:
  https://docs.phaser.io/api-documentation/class/cameras-scene2d-camera]

- **Setting `setZoom(0.6)` inside `#setupCamera`.** If you set initial zoom there,
  players entering a match while the server is already past COUNTDOWN (host
  disconnect / late reconnect) will be zoomed-out forever. Only set the
  zoomed-out value in the `COUNTDOWN` event handler, and use the normal zoom
  (1.0 implicit default) as the resting state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Camera zoom animation | Tween on `cameras.main.zoom` property | `cameras.main.zoomTo(zoom, duration, ease)` | Built-in method handles camera bounds, follow, and dirty-rect invalidation correctly. |
| Per-client countdown clock | `setInterval` decrementing local state | Server ticks broadcast via socket.io | Phase 7 LFC-04 lesson — Phaser clock pauses on background tabs. |
| Input-locking primitive | New flag system | Existing `controls.isMovementLocked` + new `#combatLocked` | Movement and the slot-1/slot-2 spell branches in `idle-state.ts`/`move-state.ts` already honor `isMovementLocked`. Only the two scene-level spell handlers need the new scope. |
| Match-state event bus | New event channel | Existing `NETWORK_MATCH_STATE_CHANGED` on EVENT_BUS | Phase 7 established this pattern; everyone needing FSM state plugs into the same event. |
| Cleanup of timer on disconnect | Free-floating `setTimeout` handles | Store handles on `GameRoom` + clear in `removePlayer` / room replacement | Phase 7 WR-07 explicitly flagged free-floating timeouts as a leak risk. |

**Key insight:** This is a 100% additive phase. Every primitive we need already exists.
The work is composition + 1 new tick event + 1 new server-side timer object.

## Runtime State Inventory

> Phase 8 is a feature addition, not a rename/refactor. Skipping the full Runtime State
> Inventory step.

**Nothing found in any category** — no stored data renames, no live service config
changes, no OS-registered state, no secret/env var changes, no build artifacts.
Verified by: no string renames in scope; only new code paths added.

## Common Pitfalls

### Pitfall 1: Phaser clock pause kills client-side countdown timers
**What goes wrong:** A tab in the background gets RAF-throttled. `this.time.delayedCall(1000, ...)`
fires several seconds late. Client overlays display "3" while server has already moved
to "1".
**Why it happens:** Browser RAF throttling on hidden tabs is universal; Phaser config
inherits this behavior. [VERIFIED: Phaser Discourse "disableVisibilityChange" and
multiple GitHub issues — see Sources]
**How to avoid:** Server is the single source of truth for tick timing. Client only
updates the overlay text on inbound tick events; it never runs its own clock.
**Warning signs:** Two-tab smoke test where one tab is backgrounded — if the foreground
tab's overlay finishes before the background tab's "FIGHT" appears, the design is wrong.
**Detection in this phase:** Manual checkpoint task — open two windows side-by-side
(NOT one foreground + one background), then repeat with one backgrounded — both
must show "FIGHT!" within ~500ms of each other.

### Pitfall 2: `isMovementLocked` does NOT block FireBreath or EarthWall
**What goes wrong:** Phase 8 plan sets `isMovementLocked = true` on COUNTDOWN and assumes
spells are blocked. Player presses 3 during the countdown — FireBreath fires (or EarthWall
goes into pending-click mode).
**Why it happens:** Both spells are driven by scene-level update handlers
(`#updateFireBreathChanneling` at game-scene.ts:209, `#updateEarthWallSpell` at
game-scene.ts:506) that read `controls.isSpell3KeyDown` and `controls.isSpell3KeyJustDown`
directly. Neither checks `isMovementLocked` because the existing FireBreath code uses
`isMovementLocked = true` for a DIFFERENT purpose: locking the player in place WHILE
breathing fire (line 280).
**How to avoid:** Introduce a separate scene-local `#combatLocked` flag (distinct from
movement lock) and gate both handlers at the top.
**Warning signs:** Two-tab test with rapid spell-key mashing during countdown — must
produce zero `match:state-changed`-unrelated socket traffic (no spell broadcasts).
**Detection in this phase:** Add a manual UAT step "press 3 during countdown, verify no
spell appears on either tab."

### Pitfall 3: Late-joining or reconnecting clients see stale zoom-out
**What goes wrong:** Client A loaded, server entered COUNTDOWN, A's GameScene set
zoom=0.6 and is animating. Client B disconnects-reconnects mid-COUNTDOWN; B's GameScene
never receives the COUNTDOWN event (B joined after it was broadcast), so B sees the
default zoom and no overlay.
**Why it happens:** `match:state-changed` is broadcast on transitions, not
on initial-state. (See Phase 7 IN-02.)
**How to avoid:** Phase 8 should NOT try to fix reconnect-during-countdown — that's
Phase 12's scope. Document explicitly that reconnect during COUNTDOWN is out of scope
and may produce a brief zoom desync. As long as `match:state-changed: ACTIVE` does
arrive (it will, because reconnecting clients re-join the room name), the unlock
still fires. Acceptable for v1.2 happy path.
**Warning signs:** Cannot test until Phase 12 lands — note as a known limitation in
SUMMARY.md.

### Pitfall 4: Removing the Phase 7 STUB without also removing its 50ms timer
**What goes wrong:** Plan adds the new `startCountdown()` but the Phase 7 STUB at
`server.ts:119-131` is left in place. Both fire: STUB transitions COUNTDOWN→ACTIVE
in 50ms, then `startCountdown` tries to transition again after 3.5s, throws, the
catch swallows it — but clients flicker COUNTDOWN → ACTIVE → (server-side error
log) → countdown ticks arrive but room is already ACTIVE.
**Why it happens:** The STUB is unconditional `setTimeout` with no guard against
external replacement. The new code adds its own setTimeout chain but the STUB still
runs first.
**How to avoid:** **The plan MUST contain an explicit task: "remove Phase 7 STUB
lines 119-131 in server.ts."** Verification: `grep -c "Phase 7 STUB" game-server/src/server.ts`
must return 0 after the phase is complete.
**Warning signs:** Match starts and goes straight to ACTIVE without showing the
countdown.

### Pitfall 5: `lobby:start` non-idempotent (CR-02 from Phase 7 review, still open)
**What goes wrong:** Host double-clicks Start. Two `GameRoom`s are created back-to-back,
overwriting each other in `gameRooms.set(lobby.id, room)`. The second one starts a NEW
countdown timer. The first one's timer keeps running (no clearTimeout fired). Result:
two `match:state-changed: ACTIVE` broadcasts, two countdown tick streams interleaved.
**Why it happens:** `lobbyManager.startLobby` (lobby-manager.ts:78) only checks host
identity, not `lobby.status`. [VERIFIED: read of current source]
**How to avoid:** This is an **inherited Phase 7 BLOCKER** (CR-02 in `07-REVIEW.md`)
that was not fixed before Phase 7 was marked complete. Phase 8 introduces a real
countdown timer with handles stored on `GameRoom`, which makes the bug **more**
visible (double timers → duplicate ticks → flicker). The plan should EITHER:
1. **Fix the inherited bug** as a small upfront task (recommended): add
   `if (lobby.status !== 'waiting') return null;` to `lobbyManager.startLobby` AND
   `if (gameRooms.has(lobby.id)) return;` to `server.ts:lobby:start`. ~10 lines
   total, defensible as "Phase 8 prerequisite because it interacts with our new
   timer."
2. Document the limitation in SUMMARY.md and defer.
**Recommendation:** Option 1 — the bug is small, well-understood, has a documented
fix in 07-REVIEW.md CR-02, and Phase 8's new timer makes the symptom worse.
**Warning signs:** Manual test of double-clicking Start in lobby and observing
two countdown overlays or stuttered tick text.

### Pitfall 6: Countdown timer leak when match ends mid-countdown
**What goes wrong:** Host disconnects during COUNTDOWN. `removePlayer` runs but the
4 `setTimeout` handles on `GameRoom.#countdownHandles` are never cleared. They fire
~1-3s later, look up `gameRooms.get(lobbyId)` (returns undefined since lobby was
destroyed → guard short-circuits) — OK but ugly.
**Why it happens:** No code path currently calls `clearCountdownTimers()`.
**How to avoid:** Call `room.clearCountdownTimers()` in:
1. `GameRoom.removePlayer` when the room ends up empty (combined with the WR-01 fix
   that deletes the room from `gameRooms`).
2. `transitionTo('ENDED')` — defensive: if we ever add an ENDED-from-COUNTDOWN path
   (host disconnect in Phase 11), ticks should stop.
**Warning signs:** Repeated open/close lobbies in dev produce growing log spam from
late-firing timer guard short-circuits.

## Code Examples

### Server: Countdown timer wiring (replaces Phase 7 STUB)
```typescript
// game-server/src/server.ts — replaces lines 119-131
// Source: pattern composition from server.ts:121 (existing STUB shape) +
// game-room.ts:50 (transitionTo) + game-room.ts:23 (removePlayer)

socket.on('match:loaded', (payload: unknown) => {
  if (!payload || typeof payload !== 'object' || typeof (payload as any).lobbyId !== 'string') return;
  const { lobbyId } = payload as MatchLoadedPayload;
  const room = gameRooms.get(lobbyId);
  if (!room) return;
  const allLoaded = room.markLoaded(socket.id);
  if (!allLoaded) return;

  try { room.transitionTo('COUNTDOWN'); } catch { return; }
  broadcastMatchState(lobbyId, room);

  // Schedule per-second tick + final transition to ACTIVE.
  // All handles are stored on `room` so they can be cancelled on room teardown.
  const TICKS = [
    { atMs: 0,    remaining: 3, label: '3'     },
    { atMs: 1000, remaining: 2, label: '2'     },
    { atMs: 2000, remaining: 1, label: '1'     },
    { atMs: 3000, remaining: 0, label: 'FIGHT' },
  ];
  for (const tick of TICKS) {
    room.pushCountdownHandle(setTimeout(() => {
      if (gameRooms.get(lobbyId) !== room || room.state !== 'COUNTDOWN') return;
      io.to(`lobby:${lobbyId}`).emit('match:countdown-tick', {
        lobbyId, remaining: tick.remaining, label: tick.label, serverTs: Date.now(),
      });
    }, tick.atMs));
  }
  room.pushCountdownHandle(setTimeout(() => {
    if (gameRooms.get(lobbyId) !== room || room.state !== 'COUNTDOWN') return;
    try { room.transitionTo('ACTIVE'); } catch { return; }
    broadcastMatchState(lobbyId, room);
  }, 3500));   // 3000 ticks + 500ms "FIGHT" hold
});
```

### Server: GameRoom timer-handle storage
```typescript
// game-server/src/game-room.ts — additions
// Source: extension of existing GameRoom class; clears in transitionTo per Phase 7's
// existing #loadedSocketIds.clear() pattern at line 56-58

#countdownHandles: NodeJS.Timeout[] = [];

pushCountdownHandle(h: NodeJS.Timeout): void {
  this.#countdownHandles.push(h);
}

clearCountdownTimers(): void {
  for (const h of this.#countdownHandles) clearTimeout(h);
  this.#countdownHandles = [];
}

// MODIFY transitionTo to clear handles on any transition OUT of COUNTDOWN:
transitionTo(next: MatchState): void {
  const allowed = VALID_NEXT[this.#state];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid match transition: ${this.#state} → ${next}`);
  }
  const prev = this.#state;
  this.#state = next;
  if (next !== 'LOADING') this.#loadedSocketIds.clear();
  if (prev === 'COUNTDOWN' && next !== 'COUNTDOWN') this.clearCountdownTimers();
}

// MODIFY removePlayer to clear handles when room becomes empty:
removePlayer(socketId: string): string | undefined {
  const playerId = this.#players.get(socketId);
  this.#players.delete(socketId);
  this.#loadedSocketIds.delete(socketId);
  if (this.#players.size === 0) this.clearCountdownTimers();
  return playerId;
}
```

### Server / Client mirror types
```typescript
// game-server/src/types.ts — append
export type MatchCountdownTickPayload = {
  lobbyId: string;
  remaining: number;   // 3, 2, 1, 0
  label: string;       // '3' | '2' | '1' | 'FIGHT'
  serverTs: number;
};

// src/networking/types.ts — append (mirror)
export type MatchCountdownTickPayload = {
  lobbyId: string;
  remaining: number;
  label: string;
  serverTs: number;
};
```

### Client: NetworkManager wires the new event
```typescript
// src/networking/network-manager.ts — add inside #bindSocketEvents()
this.#socket.on('match:countdown-tick', (payload: MatchCountdownTickPayload) => {
  EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_MATCH_COUNTDOWN_TICK, payload);
});

// src/common/event-bus.ts — append to CUSTOM_EVENTS
NETWORK_MATCH_COUNTDOWN_TICK: 'NETWORK_MATCH_COUNTDOWN_TICK',
```

### Client: GameScene wires lock + overlay + zoom
```typescript
// src/scenes/game-scene.ts — additions

// New field (alongside other private fields):
#combatLocked: boolean = false;
#countdownText: Phaser.GameObjects.Text | null = null;

// In #setupNetworking() — add:
EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
EVENT_BUS.on(CUSTOM_EVENTS.NETWORK_MATCH_COUNTDOWN_TICK, this.#onCountdownTick, this);

// In #registerCustomEvents() SHUTDOWN cleanup — add matching off():
EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_STATE_CHANGED, this.#onMatchStateChanged, this);
EVENT_BUS.off(CUSTOM_EVENTS.NETWORK_MATCH_COUNTDOWN_TICK, this.#onCountdownTick, this);

#onMatchStateChanged = (payload: MatchStateChangedPayload): void => {
  if (payload.state === 'COUNTDOWN') {
    this.#enterCountdownMode();
  } else if (payload.state === 'ACTIVE') {
    this.#exitCountdownMode();
  }
};

#enterCountdownMode(): void {
  this.#controls.isMovementLocked = true;
  this.#combatLocked = true;
  if (this.#player?.body) {
    (this.#player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }
  this.cameras.main.setZoom(0.6);
  this.cameras.main.zoomTo(1.0, 3000, 'Sine.easeOut');
  if (!this.#countdownText) {
    this.#countdownText = this.add.text(
      this.cameras.main.centerX,
      this.cameras.main.centerY,
      '',
      { fontFamily: '"Press Start 2P"', fontSize: '48px', color: '#ffdd55',
        stroke: '#000000', strokeThickness: 4 },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
  }
  this.#countdownText.setVisible(true).setText('');
}

#exitCountdownMode(): void {
  this.#controls.isMovementLocked = false;
  this.#combatLocked = false;
  this.#countdownText?.setVisible(false);
}

#onCountdownTick = (payload: MatchCountdownTickPayload): void => {
  if (!this.#countdownText) return;
  this.#countdownText.setText(payload.label).setScale(1);
  this.tweens.add({
    targets: this.#countdownText,
    scale: { from: 1.3, to: 1.0 },
    duration: 280,
    ease: 'Back.easeOut',
  });
};

// MODIFY #updateFireBreathChanneling — add at the very top:
if (this.#combatLocked) return;

// MODIFY #updateEarthWallSpell — add at the very top:
if (this.#combatLocked) return;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Client-side countdown clock | Server-driven tick broadcasts | Phase 7 LFC-04 fix (2026-05-15) | Phase 7's `4f2b07d` commit literally established this rule for LoadingScene — we apply it forward. |
| Free-floating `setTimeout` on server | Handles stored on the room object | This phase (responding to 07-REVIEW WR-07) | Allows cleanup on disconnect / room replacement. |
| Single STUB transition | Multi-tick state with explicit per-tick events | This phase | Replaces the deliberately-shortlived 50ms stub with the real implementation. |

**Deprecated/outdated:**
- The 50ms Phase 7 STUB at `server.ts:119-131` — must be deleted entirely by the end of
  this phase. Verification: `grep -c "Phase 7 STUB" game-server/src/server.ts` returns 0.

## Project Constraints (from CLAUDE.md)

**No CLAUDE.md found in the project root.** [VERIFIED: file does not exist per Read tool;
git status confirms no untracked `CLAUDE.md`.] No project-level mandatory directives apply
beyond the team conventions established in Phases 1-7 (see "Patterns established" below).

**Team conventions inferred from Phase 1-7 SUMMARY.md files:**
- Mirror-type discipline: every protocol type in `game-server/src/types.ts` is mirrored
  byte-for-byte in `src/networking/types.ts` with a header comment.
- Listener pairing: every `EVENT_BUS.on(...)` is paired with a matching `EVENT_BUS.off(...)`
  in a `Phaser.Scenes.Events.SHUTDOWN` handler.
- "Phase N STUB" comment convention for temporary code that the next phase must remove.
- `grep -c "Phase N STUB"` should return 0 at the end of phase N+1 for any STUB introduced
  in phase N.
- Tests live alongside the source file (e.g., `game-room.test.ts` next to `game-room.ts`).
- Atomic per-task commits with Conventional Commits prefix and `(NN-NN)` plan reference.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A zoom factor of 0.6 → 1.0 over 3000ms feels "cinematic enough" for LFC-07. | Pattern 2 + Code Examples | Numeric tuning only — easily adjusted in plan/execution. [ASSUMED — phase description says "~3-4s" so 3s + 500ms FIGHT hold totals 3.5s and is in range, but the start zoom value 0.6 is a guess. The plan should treat this as a tunable constant in `config.ts`.] |
| A2 | A single `setScrollFactor(0)` text object inside GameScene is sufficient for the overlay (vs. a separate Scene). | Pattern 3 + Anti-Patterns | If we ever need richer overlay UI (background dim, multiple text layers), a separate Scene becomes preferable. For "3 2 1 FIGHT" alone, in-GameScene is correct. [ASSUMED — based on simplicity principle + existing UiScene precedent.] |
| A3 | `FIGHT!` should stay visible for ~500ms before the ACTIVE transition. | Pattern 1 | Numeric tuning only. Plan should treat as a config constant. [ASSUMED] |
| A4 | Fixing Phase 7 CR-02 (lobby:start idempotency) as part of Phase 8 is correct scoping. | Pitfall 5 | If skipped, double-clicking Start in lobby produces double countdown timers — a regression the new code surfaces. [ASSUMED — could be deferred and documented; recommendation is to fix because the bug interacts with this phase's new timer object.] |
| A5 | No new Phaser dependency or version bump is needed for `zoomTo`. | Standard Stack | Phaser 3.87.0 docs confirm `zoomTo` exists with the documented signature. [CITED: https://docs.phaser.io/api-documentation/class/cameras-scene2d-camera] |
| A6 | `cameras.main.zoomTo()` does not get paused by browser tab visibility differently than the rest of Phaser. | Pattern 1 | If true, backgrounded tabs may finish their zoom early/late. The visible symptom would be a player who tabs back in mid-countdown seeing the zoom snap. Acceptable for v1.2 since the overlay/ACTIVE transition is still server-driven. [ASSUMED — confirmed indirectly via Phaser Discourse threads that Phaser pauses RAF on tab-hidden, but specific `zoomTo` behavior was not verified.] |

## Open Questions

1. **Should the countdown duration be exactly 3000ms or 4000ms?**
   - What we know: Phase description says "~3-4 seconds." Phase 7 SUMMARY explicitly
     calls the Phase-7 STUB a "50ms placeholder" and points to "real 3-2-1 countdown."
   - What's unclear: Whether the spec preference is "3-2-1-FIGHT cleanly fits 3 seconds
     of ticks + 0.5s FIGHT hold (=3.5s total)" or "4 seconds of ticks for more drama."
   - Recommendation: Default to 3 ticks of 1000ms + 500ms FIGHT hold = 3500ms total.
     Expose `COUNTDOWN_DURATION_MS` and `FIGHT_HOLD_MS` as named constants in
     `game-server/src/server.ts` (or a shared config file) so tuning is one-line.

2. **Should the camera animation start from a different position, not just a different zoom?**
   - What we know: LFC-07 says "camera animates from a zoomed-out position to the normal
     play zoom." That literally specifies zoom-only motion.
   - What's unclear: Whether the spec also expects a pan (e.g., zoomed-out view shows
     the whole map, then pans to the player's spawn).
   - Recommendation: Phase 8 ships zoom-only, leaves pan for v1.3 polish. Document
     in SUMMARY.md.

3. **Should the overlay show team-color particles or other visual juice?**
   - What we know: Spec says "3 → 2 → 1 → FIGHT! overlay is visible on every client."
   - What's unclear: Any visual styling beyond the text.
   - Recommendation: Ship plain text + scale tween (already in Pattern 3). Add juice
     in v1.3 if time permits.

## Environment Availability

> Phase 8 is code-only — no new external dependencies. The phase reuses Node (game-server),
> the browser runtime (client), socket.io, and Phaser, all of which are confirmed working
> by the Phase 7 manual smoke test (`07-02-SUMMARY.md` Task 3 passed).

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + tsx | game-server dev server | ✓ | per package.json | — |
| socket.io server | All FSM broadcasts | ✓ | 4.8.0+ | — |
| socket.io-client | Inbound countdown ticks | ✓ | 4.8.3 | — |
| Phaser | Camera zoom, scene system, tween system | ✓ | 3.87.0 (locked) | — |
| vitest | Server unit tests for FSM extensions | ✓ | game-server ^2.1.8 | — |

**No missing dependencies.**

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 2.1.8 (game-server) / 4.1.6 (client) |
| Config file | `game-server/vitest.config.ts` (assumed — Phase 7 ran `vitest run src/game-room.test.ts` without explicit config flag) |
| Quick run command | `cd game-server && npx vitest run src/game-room.test.ts` |
| Full suite command | `cd game-server && npx vitest run` (server) + `npx vitest run` (client root) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LFC-06 | Movement and spell input locked during COUNTDOWN | manual-only (UAT) | (none — input gating is rendered behavior) | N/A — manual checkpoint |
| LFC-07 | Camera zoom animation plays during COUNTDOWN | manual-only (UAT) | (none — visual) | N/A — manual checkpoint |
| LFC-08 | `3 → 2 → 1 → FIGHT!` overlay ticks in sync | manual-only (UAT) for visual, **unit** for tick scheduling | `cd game-server && npx vitest run src/server-countdown.test.ts` (NEW) | ❌ — Wave 0 |
| LFC-09 | Movement/spell unlock simultaneously at ACTIVE | unit (server FSM) + manual-only (visual) for unlock | `cd game-server && npx vitest run src/game-room.test.ts` (existing 13 tests cover FSM transitions, ADD new tests for countdown teardown) | ✅ — extend existing |
| FSM cleanup on disconnect during COUNTDOWN | unit | `cd game-server && npx vitest run src/game-room.test.ts` | ✅ — extend existing |
| Phase 7 STUB removal | grep-based | `[ $(grep -c "Phase 7 STUB" game-server/src/server.ts) -eq 0 ]` | N/A — grep |
| Inherited CR-02 fix (if Option 1) | unit | `cd game-server && npx vitest run src/lobby-manager.test.ts` (NEW or extend) | ❌ — Wave 0 if Option 1 chosen |

### Sampling Rate
- **Per task commit:** `cd game-server && npx vitest run src/game-room.test.ts` (fast — under 2s)
- **Per wave merge:** Full suite green on game-server + grep checks (Phase 7 STUB removal, `gameRooms` cleanup if WR-01 also fixed)
- **Phase gate:** Full suite green + manual 2-tab smoke test (see Manual UAT below)

### Wave 0 Gaps
- [ ] `game-server/src/game-room.test.ts` — add tests:
  - `clearCountdownTimers cancels pending handles`
  - `transitionTo('ENDED') clears countdown handles`
  - `removePlayer clears countdown handles when room becomes empty`
- [ ] `game-server/src/server-countdown.test.ts` (new) — OR extend an existing
  integration test file: drive `lobby:start → all clients match:loaded → expect 4
  countdown ticks within 3500ms → expect match:state-changed ACTIVE` using a
  socket.io client mock or supertest-style harness. **Note:** Phase 7 explicitly
  flagged this gap in IN-03 ("no integration test covering the auto-transition path
  itself"). Phase 8 should close it.
- [ ] (If Option 1 for CR-02) `game-server/src/lobby-manager.test.ts` — add test
  `startLobby rejects when status === 'in-progress'`.
- [ ] Client-side: no unit tests required for the camera/overlay since they're
  pure presentation. **Manual UAT covers them.**

### Manual UAT additions to checkpoint task
1. Start dev server + 2 browser windows side-by-side.
2. Create lobby, host starts match.
3. Verify: both windows show 3 → 2 → 1 → FIGHT! ticks within ~200ms of each other.
4. Verify: WASD and 1/2/3 inputs do nothing during the countdown.
5. Verify: camera zoom smoothly animates from zoomed-out to normal during the 3s.
6. Verify: at "FIGHT!", combat input works on both clients.
7. Verify: DevTools → Network → WS shows the expected event sequence:
   `match:state-changed: COUNTDOWN`, 4× `match:countdown-tick`,
   `match:state-changed: ACTIVE`.
8. Verify: double-click Start in lobby → no duplicate countdown (catches inherited CR-02).
9. Verify: one tab backgrounded, other foreground — overlay still ticks visibly on
   the foreground tab; both tabs unlock combat at the same moment when re-focused.

## Security Domain

> No external attack-surface changes in this phase. The new `match:countdown-tick` event
> is server-emitted only (clients never send it). The new `match:loaded` extension that
> kicks off the countdown was already shipped in Phase 7. The phase adds one inbound
> server-side socket handler change (replacing the STUB) and zero new inbound events.
> ASVS V5 (Input Validation) — the existing Phase 7 WR-02 finding (handlers don't
> validate payload shape) is INHERITED and should be addressed as part of Phase 8's
> changes to `match:loaded` (small surface: just check `typeof lobbyId === 'string'`).

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | (no new identity surface) |
| V3 Session Management | no | (socket lifecycle unchanged) |
| V4 Access Control | yes (minor) | Inherited Phase 7 issue: handler should reject `match:loaded` for sockets not in the room (`markLoaded` already returns `false` for non-members — defense in depth). |
| V5 Input Validation | yes | Add `typeof lobbyId === 'string'` guard at top of `match:loaded` handler (Phase 7 WR-02 recommended pattern). |
| V6 Cryptography | no | — |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `match:loaded` payload (Phase 7 WR-02) | Tampering / DoS | Validator at handler entry — already documented in 07-REVIEW.md WR-02 |
| Forged `match:countdown-tick` from a peer | Spoofing | N/A — client never accepts this event from peers; it's server-emitted only and arrives over the trusted socket.io channel from the server. WebRTC data channels are P2P but they don't carry FSM events. |

## Sources

### Primary (HIGH confidence)
- `game-server/src/game-room.ts` (lines 1-86) — confirmed FSM `VALID_NEXT[COUNTDOWN]
  = ['ACTIVE', 'ENDED']`, `transitionTo()` throws on invalid edges, `removePlayer()` is the
  cleanup hook. [VERIFIED via Read]
- `game-server/src/server.ts` (lines 105-132) — confirmed Phase 7 STUB location and the
  exact transition flow `markLoaded → transitionTo('COUNTDOWN') → broadcast → setTimeout(50)
  → transitionTo('ACTIVE') → broadcast`. [VERIFIED via Read]
- `src/scenes/loading-scene.ts` (lines 95-128) — confirmed the LoadingScene scene-exit
  trigger (`COUNTDOWN` OR `ACTIVE`), and the LFC-04 visibility fix pattern (`#ackSentAt`,
  `MIN_DISPLAY_MS`, `#scheduleTransition`). [VERIFIED via Read]
- `src/scenes/game-scene.ts` (lines 209-296, 506-571, 1046-1051, 1475-1491, 899-928) —
  confirmed `isMovementLocked` is set/cleared at multiple points but doesn't gate
  FireBreath/EarthWall scene handlers; confirmed `#setupCamera` uses `setBounds + startFollow`
  but no zoom; confirmed `#registerCustomEvents` SHUTDOWN pattern. [VERIFIED via Read]
- `src/components/state-machine/states/character/idle-state.ts:34` and
  `move-state.ts:20` — confirmed `isMovementLocked` blocks spell branches 1 & 2 in the
  state machine. [VERIFIED via Read]
- `src/components/input/input-component.ts:38-44` — confirmed `isMovementLocked` is a
  plain boolean with getter/setter on InputComponent base class. [VERIFIED via Read]
- `.planning/phases/07-loading-state-match-fsm-foundation/07-REVIEW.md` — confirmed CR-02
  (lobby:start non-idempotent) is still open and recommended fix syntax. [VERIFIED via Read]
- `.planning/phases/07-loading-state-match-fsm-foundation/07-02-SUMMARY.md` —
  confirmed LFC-04 visibility lesson (Phaser clock pause on background tabs). [VERIFIED via Read]
- Git history (`git log --oneline -20`) — confirmed CR-02 / WR-01 / WR-07 from Phase 7
  review have NOT been fixed since the review (no commits after `3d675cf docs(phase-07):
  complete phase execution` that touch the relevant files). [VERIFIED via git log]
- Phaser 3 official API documentation —
  `Camera.zoomTo(zoom, [duration], [ease], [force], [callback], [context])`. [CITED:
  https://docs.phaser.io/api-documentation/class/cameras-scene2d-camera]

### Secondary (MEDIUM confidence)
- Phaser Discourse + GitHub issues threads — Phaser's clock pauses by default when the
  browser tab is hidden (RAF throttling). [CITED:
  https://phaser.discourse.group/t/pause-everything-on-tab-switch/6095 ,
  https://phaser.discourse.group/t/disablevisibilitychange/7029 ,
  https://github.com/photonstorm/phaser/issues/682]
- Phaser tween system handles `tweens.add({ targets, scale })` on text objects —
  used widely in the codebase (e.g., LobbyScene buttons). [VERIFIED indirectly via
  existing usage in lobby-scene.ts]

### Tertiary (LOW confidence)
- None — every claim in this research is backed by either source-code read or Phaser
  official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via `package.json`; no new deps; existing
  Phaser API (`zoomTo`) confirmed in official docs.
- Architecture: HIGH — replaces a single well-isolated stub; all surrounding patterns
  (FSM, event-bus, scene shutdown cleanup, mirror-types) are established by Phase 7.
- Pitfalls: HIGH — Phase 7's code review (07-REVIEW.md) catalogued every adjacent
  hazard; Phase 8 inherits and either fixes (CR-02 recommendation) or documents them.
- Validation: HIGH — clear seam at `game-room.test.ts` for unit tests; manual UAT
  pattern proven by Phase 7's two-tab test.

**Research date:** 2026-05-15
**Valid until:** 2026-06-14 (30 days — Phaser 3.87 is stable, socket.io 4.x is stable,
no fast-moving deps in scope)

Sources:
- [Phaser 3 Camera API — zoomTo](https://docs.phaser.io/api-documentation/class/cameras-scene2d-camera)
- [Phaser Discourse — Pause everything on tab switch](https://phaser.discourse.group/t/pause-everything-on-tab-switch/6095)
- [Phaser Discourse — disableVisibilityChange](https://phaser.discourse.group/t/disablevisibilitychange/7029)
- [Phaser Discourse — Tab visibility and game time elapsed](https://phaser.discourse.group/t/tab-visibility-and-game-time-elapsed/2601)
- [Phaser GitHub Issue #682 — Game pause with disableVisibilityChange](https://github.com/photonstorm/phaser/issues/682)
