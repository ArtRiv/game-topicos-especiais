---
slug: phantom-fireball
status: root-cause-identified
trigger: "Casting a fireball sometimes spawns a 2nd phantom projectile that flies straight right (only visible on the caster's client; not broadcast to other players; does not collide with earth walls)."
created: 2026-05-21
updated: 2026-05-21
related_phase: 09.3
goal: find_root_cause_only
---

# Debug Session — Phantom Fireball

## Symptoms

DATA_START
- **Expected behavior:** A single fireball is spawned and travels from the player toward the mouse cursor. The fireball collides with environment (walls / earth-wall pillars) and is visible to all other connected players via the existing remoteSpellGroup broadcast.
- **Actual behavior:** Most of the time the expected fireball spawns correctly toward the cursor. INTERMITTENTLY, in addition to the correct fireball, a second "phantom" fireball spawns at the same time and flies straight to the right (positive X direction) regardless of cursor position.
- **Distinguishing properties of the phantom:**
  - Only exists on the caster's client. Other players observing the caster do NOT see the phantom projectile (it is not broadcast).
  - Does NOT collide with earth walls or the collision layer — passes through environment.
  - Cannot be confirmed to deal or not deal damage because cross-player damage is not yet implemented (Phase 9.3 work).
  - Visually appears as a normal fireball sprite — same asset.
- **Error messages:** None observed in the browser console at cast time.
- **Timeline:** First noticed during the post-Phase-9.2-merge playtest on 2026-05-21. May have existed earlier — Phase 9.2 was a UI-only phase and did not touch spell-casting code, so the bug likely pre-dates 9.2 but was not previously reported. The merge of `main` into `multiplayer` brought in main's font-loading fix and CreateLobby/JoinLobby scenes — neither touches spell casting on its face, but worth ruling out.
- **Reproduction:** Cast fireball repeatedly during a match. The phantom appears non-deterministically; not every cast triggers it. Frequency feels somewhere between "1-in-5" and "1-in-15" casts but no reliable repro recipe has been found yet.
- **Hypotheses to falsify (initial guesses):**
  1. A stale pointerdown listener or pointermove fallback fires a second cast with default direction (right = positive X) when the cursor data is briefly null/undefined.
  2. Two input code paths (keyboard 1/2/3 spell-slot key AND mouse click? Or keydown AND keyup?) both invoke the cast routine within the same frame.
  3. A race between the radial-menu close event and the cast input where the radial menu's "commit selection" handler accidentally also fires the cast with a fallback aim of (1, 0).
  4. The fireball constructor / spell-casting component has a default direction of (1, 0) used when its `targetPos`/`aim` argument is undefined; some code path is calling the cast without supplying the cursor.
  5. A double-tap somehow leaks a stale velocity vector from the previous frame.
DATA_END

## Repro Context

- Repo: `C:/Users/Arthu/Desktop/code/game-topicos-especiais`
- Branch: `main` (after Phase 9.2 merge, currently at `f297902`)
- Run command: `npm run dev`, open `http://localhost:5173/`, click through Splash → MainMenu → CRIAR LOBBY → connect to local server → start match → cast fireball repeatedly
- Player input on cast: mouse cursor positions the aim, keys `1`/`2`/`3` select spell slot (fireball is slot 1), left-click fires (or however the existing cast trigger works — debugger to confirm via code)

## Key Files (Starting Points)

- `src/scenes/game-scene.ts` lines 326, 373, 377, 435, 466, 478, 482, 506, 699, 829, 882 — all `spellGroup` references; lots of cast-side code
- `src/game-objects/spells/fire-bolt.ts` — fireball implementation; check constructor for default direction
- `src/components/spell-casting/` — does NOT exist as a directory (grep earlier returned no matches); likely the spell-casting logic lives directly inside `Player` or its components — debugger to locate
- `src/components/input/keyboard-component.ts` — current key bindings (lines 21–34)
- `src/components/input/input-component.ts` line 158 — `isRadialMenuKeyJustDown` pattern; check for similar getters around spell casting
- `src/networking/network-manager.ts` line 32 (union), 165 (broadcast), 423 (incoming spell case) — to confirm the phantom is genuinely not broadcast (which is itself a clue: if it doesn't broadcast, it doesn't go through the normal broadcast helper; it's spawned via a different code path)

## Investigation Plan (initial)

1. Locate the actual fire-bolt cast code path — search for the constructor call site(s). If MORE than one call site exists, one of them is the phantom source.
2. If only one call site exists, instrument it temporarily: log `{ timestamp, aimX, aimY, callerStack }` on every invocation and reproduce. Two log lines on one user-triggered cast = double-fire confirmed; one log line but two visible projectiles = something downstream of the cast call (Group.add called twice? Tween / physics setting velocity twice?).
3. Check the fireball/projectile constructor's handling of undefined/null direction params — look for a `|| (1, 0)` or `direction ?? new Vector2(1, 0)` style fallback.
4. Check all `pointerdown` / `pointerup` / keyboard listeners that could trigger a cast — look for unguarded duplicates (e.g., listener added in both `create()` and `wake()` on a sleeping scene).
5. Verify that the phantom is genuinely created locally and not coming from `#remoteSpellGroup` (if multiplayer is connected, could a self-echo from the broadcast be re-rendering as a phantom?).

## Current Focus

- **hypothesis:** Root cause identified — see Resolution.
- **test:** —
- **expecting:** —
- **next_action:** Hand off to /gsd-plan-phase --gaps for fix planning (Phase 9.3 D-20).

## Evidence

- **E1 — FireBolt velocity computation produces straight-right when target == caster position.** `src/game-objects/spells/fire-bolt.ts:35-51` computes velocity via `Phaser.Math.Angle.Between(x, y, targetX, targetY)`. When `targetX === x` and `targetY === y`, `Math.atan2(0,0) === 0`, yielding velocity `(SPEED, 0)` — exactly "straight right" with no fallback default required. Likewise when `targetX = x + 1, targetY = y` → `atan2(0, 1) === 0` → straight right.
- **E2 — FireBolt has exactly one constructor call site.** `grep "new FireBolt"` returns one hit: `src/game-objects/spells/fire-bolt.ts:152` (the registry factory). All FireBolt instances come through `SPELL_FACTORY_REGISTRY[SPELL_ID.FIRE_BOLT]`.
- **E3 — The factory has exactly two callers.**
  - `src/components/game-object/spell-casting-component.ts:81` (local cast via `castSpell` — always uses real `targetX/Y` from caller).
  - `src/scenes/game-scene.ts:1756` (remote cast via `#onRemoteSpellCast`).
- **E4 — `#onRemoteSpellCast` has a defensive "straight-right" fallback.** Lines 1760-1761:
  ```ts
  payload.targetX ?? payload.x + 1,
  payload.targetY ?? payload.y,
  ```
  When `payload.targetX` is nullish, target becomes `(casterX + 1, casterY)` → FireBolt velocity is `(SPEED, 0)` → straight right. This is the *only* code path in the entire codebase that can produce the observed straight-right direction without the user aiming straight right.
- **E5 — `#remoteSpellGroup` has NO collider against `#earthWallGroup`.** `grep "remoteSpellGroup.*earthWallGroup"` returns zero matches. `game-scene.ts:881-882` registers the local `spellGroup` vs `#earthWallGroup` overlap; no equivalent exists for `#remoteSpellGroup`. This precisely explains why the phantom "passes through earth walls" — phantoms spawned via `#onRemoteSpellCast` are added to `#remoteSpellGroup` (line 1765) which has no wall-pillar overlap.
- **E6 — `#remoteSpellGroup` is NOT broadcast.** `#onRemoteSpellCast` (game-scene.ts:1747-1770) only spawns and group-adds; it does NOT call `nm.sendSpellCast`. This matches "not broadcast to other players". (The header comment at line 1748 explicitly calls this out to avoid an infinite re-broadcast loop.)
- **E7 — `#onRemoteSpellCast` does not filter `payload.playerId === localPlayerId`.** Lines 1747-1770: there is no self-filter. In contrast, `#onRemotePlayerUpdate` (line 1639-1664) explicitly drops self-updates at line 1642. This means *if* the local client ever receives its own spell broadcast (loopback / self-mesh), it will spawn a remote ghost. Inspection of the WebRTC mesh (network-manager.ts:326-332) shows self is skipped when wiring peers (`if (peer.socketId === mySocketId) return;`), so under normal solo runs no self-echo occurs — but the missing guard is a latent defect that would resurface if mesh wiring changes.
- **E8 — `SpellCastPayload.targetX`/`targetY` are typed as required `number`** (`src/networking/types.ts:67-68`). The `??` fallback in E4 is dead-defensive code under the current contract — it only fires if a producer sends `null`/`undefined` (e.g., serialization quirk, a future code path that forgets to set it, or a malformed message). JSON.parse preserves `null` but coerces `undefined` to absent → on the receiver side, `msg.targetX === undefined` → fallback fires.
- **E9 — Phaser-3 input plugin returns `worldX = 0` for `activePointer` before the first pointer event.** If a remote player's client casts via `isSpell1KeyJustDown` *before* their mouse has moved, `mouseWorldX/Y === 0`, and they broadcast `targetX: 0, targetY: 0` (legitimate zero, not undefined). The local client computes velocity from `Angle.Between(remoteX, remoteY, 0, 0)`, which gives a direction toward the world origin — NOT straight right unless the remote player happens to be at `y === 0`. So this is NOT a direct contributor to the straight-right symptom, but it explains *another* class of "phantom flies toward (0,0)" misbehaviors should they arise.
- **E10 — Latent state-machine queue dispatch bug (not the phantom cause, but flag for cleanup).** `src/components/state-machine/state-machine.ts:44` redispatches as `this.setState(queuedState.state, queuedState.args)` — passing the captured args ARRAY as a single positional arg rather than spreading it. The correct call is `this.setState(queuedState.state, ...queuedState.args)`. With the current bug, a queued `CASTING_STATE` transition resolves with `args[0]` being the full args array (cast to number → NaN) so `canCast(NaN)` returns false and the cast silently no-ops. This corrupts queued casts (silent failures) but does NOT spawn a phantom — included here so Phase 9.3 can choose to fix it in the same change-set.
- **E11 — Keyboard component duplicates the spell-1 `JustDown` query.** `src/components/input/keyboard-component.ts:71-73` (`isAttackKeyJustDown`) and `:83-85` (`isSpell1KeyJustDown`) both call `Phaser.Input.Keyboard.JustDown(this.#spell1Key)`. Only the game-over scene consumes `isAttackKeyJustDown`, so during gameplay there is no double-consumption. Not a contributor to the phantom; flagged as code smell.

## Eliminated Hypotheses

- **H1 (stale pointerdown listener):** No mouse-button cast path exists. Casts are triggered exclusively by `isSpell1KeyJustDown`/`isSpell2KeyJustDown` (keyboard 1/2) read from input-component getters; verified via `grep castSpell|CASTING_STATE`.
- **H2 (keyboard + mouse double cast):** Only the keyboard path triggers cast; no mouse-button binding for FireBolt. (Mouse left-click is used by EarthWall only.)
- **H3 (radial-menu close → cast race):** Radial-menu input (`isRadialMenuKeyJustDown` on CTRL) is a separate getter; no code path in `idle-state.ts`/`move-state.ts` chains radial close to a spell cast.
- **H4 (FireBolt constructor default direction `(1,0)`):** The constructor has NO default-direction fallback; it always uses `Angle.Between(x, y, targetX, targetY)`. Straight-right output emerges naturally when `targetX === x && targetY === y` OR `(targetX, targetY) === (x+1, y)`.
- **H5 (double-tap stale velocity):** Each FireBolt is a fresh sprite with a fresh body; no cross-instance velocity carryover possible.

## Resolution

### Root Cause

The phantom right-flying fireball is spawned by `GameScene.#onRemoteSpellCast` at `src/scenes/game-scene.ts:1747-1770` when an inbound `NETWORK_SPELL_CAST` message arrives with `targetX === null/undefined`. The defensive fallback `payload.targetX ?? payload.x + 1, payload.targetY ?? payload.y` (lines 1760-1761) makes the FireBolt's target exactly one pixel to the right of the caster, which `Phaser.Math.Angle.Between` resolves to angle `0` → velocity `(SPEED, 0)` → straight right.

The phantom matches every observed property:

| Symptom | Mechanism |
|---|---|
| Flies straight right regardless of cursor | `target = caster + (1, 0)` → atan2 = 0 → vx = SPEED, vy = 0 (E1, E4) |
| Only visible on the caster's client | `#onRemoteSpellCast` is the *receiving* handler — only fires on whichever client received the message; the originator does not loop it back over WebRTC (E6, NetworkManager P2P mesh) |
| Not broadcast to others | `#onRemoteSpellCast` does NOT call `sendSpellCast` — by design, to avoid infinite re-broadcast loops (E6) |
| Does not collide with earth walls | `#remoteSpellGroup` has NO collider registered against `#earthWallGroup` (E5) — gap in collider registration |
| Intermittent | Only fires when `payload.targetX` is nullish — a corner case in the producer side, not every cast |

**Note on perspective:** the symptom report says the phantom appears "on the caster's client". Based on this analysis the phantom actually appears on whichever client RECEIVES the spell broadcast (i.e., the non-caster peers). It is plausible the bug was observed during a session where the user was watching another player's cast and misattributed the phantom to their own simultaneous cast. **This is the single open ambiguity in the report and should be confirmed during fix testing** by casting fireballs from each player in turn and noting which client(s) see the phantom relative to who pressed "1".

### Recommended Fix Sketch (do not apply — for Phase 9.3 planning only)

Three independent defects, ordered by causal weight. Fix at least #1 (root cause); fix #2 + #3 in the same change-set to harden adjacent code.

1. **PRIMARY — Eliminate the straight-right fallback in `#onRemoteSpellCast`.** At `src/scenes/game-scene.ts:1760-1761` either:
   - **(a) Strict drop:** If `payload.targetX == null || payload.targetY == null`, log a `console.warn` and `return` without spawning. The producer contract requires both fields; the consumer should not paper over violations with a silent direction guess.
   - **(b) Use the broadcast `direction` field:** `payload.direction` is already on the wire (`SpellCastPayload.direction: string`, e.g. `'RIGHT'`). Derive a sane target offset from the 4-way direction instead of `(+1, 0)`. This preserves intent if a producer ever ships without `targetX`.
   - **Recommended:** option (a) — strict drop with a warn. The wire format already guarantees `targetX`/`targetY`; any nullish receipt is a real bug in the producer or transport and should be loud, not silent.
2. **SECONDARY — Add the missing `#remoteSpellGroup` vs `#earthWallGroup` collider.** Mirror the local-spellGroup handler at `game-scene.ts:881` to register an identical overlap for `#remoteSpellGroup`. This ensures remote-cast fireballs (legitimate AND phantom, if any slip through) collide with earth-wall pillars exactly like local ones — both fixing the symptom and closing a latent cross-player combat bug that Phase 9.3 will exercise more heavily.
3. **TERTIARY (defense-in-depth) — Add a self-filter in `#onRemoteSpellCast`.** Match the pattern from `#onRemotePlayerUpdate` (game-scene.ts:1642): `if (nm && payload.playerId === nm.localPlayerId) return;`. The WebRTC mesh currently prevents self-echo (network-manager.ts:327), so this is not the *current* cause, but it future-proofs against mesh-wiring changes that could introduce loopback.

**Out of scope for the fix task but worth flagging in the plan:**

- **State-machine queue dispatch bug (E10)** at `src/components/state-machine/state-machine.ts:44`: change `this.setState(queuedState.state, queuedState.args)` to `this.setState(queuedState.state, ...queuedState.args)`. Silent-fails queued state transitions; not the phantom cause but corrupts spell casts queued during state changes.
- **Duplicate `JustDown` query (E11)** in `keyboard-component.ts:71-73` vs `:83-85`: low priority; safe to leave or to make `isAttackKeyJustDown` an alias `get isAttackKeyJustDown() { return this.isSpell1KeyJustDown; }` so JustDown is only consumed once per frame regardless of which getter is read.

### Verification Plan (for the fix task)

1. **Repro confirmation pre-fix:** With 2 clients, have player A repeatedly cast fireballs. Temporarily instrument `#onRemoteSpellCast` to log `{ playerId, targetX, targetY, x, y }` for every received message. Confirm that the phantom occurrences correlate with log entries where `targetX == null`. If they DO NOT correlate, the root cause hypothesis is wrong and we need to escalate (most likely candidate then becomes a producer-side bug yet to identify).
2. **Producer-side investigation (only if step 1 confirms `targetX == null` on the wire):** Trace upstream — the only producer is `#onLocalSpellCast` → `sendSpellCast`, which always supplies `targetX: payload.targetX` from `SPELL_CAST` event. The event is emitted in `spell-casting-component.ts:90` with `targetX: targetX` parameter. The parameter comes from `casting-state.ts:21-22` (`args[1] as number`). If `args[1]` is ever `undefined` (e.g., due to the state-machine queue bug E10, OR a direct `setState(CASTING_STATE, slotIndex)` call without target args), the entire chain propagates `undefined` to the broadcast. Audit `setState(CASTING_STATE, ...)` call sites and the queue-dispatch bug above as candidates.
3. **Post-fix:** After applying fix #1, repeat the 2-client repro. The phantom must not appear. After applying fix #2, cast a remote-player fireball into an earth-wall pillar from the observer client — the bolt must explode on the pillar, not pass through.

### Confidence

**High** for the symptom-to-mechanism mapping (E1-E6 are direct code-level evidence — the right-flying behavior is mechanically only possible via the `(payload.x + 1, payload.y)` fallback). **Medium** for whether the producer is sending `targetX: null` on the wire (no live repro instrumentation done; step 1 of the verification plan must confirm). If verification step 1 disproves this, the next candidate is a producer-side bug feeding `undefined` into `castSpell`/`sendSpellCast`, with the state-machine queue dispatch defect (E10) as the leading suspect.
