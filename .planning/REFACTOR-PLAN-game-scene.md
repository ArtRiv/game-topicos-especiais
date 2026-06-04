# Refactor Plan — game-scene.ts (POST-EVENT)

> **DO NOT do this before the event.** It's a large mechanical change with real `this`-binding risk. Execute only after Friday, with the full test suite + manual playtests as the safety net. This plan exists so the work is calm and scoped when you get to it.

## Why
`src/scenes/game-scene.ts` is ~5,683 lines / ~174 private methods — the project's god-file. It mixes ~6 independent subsystems. The cost isn't just readability: every time you (or an agent) touch one concern, you read/scan past thousands of irrelevant lines, wasting context and inviting mistakes. The bugs fixed during event-prep (death-anim race, tint cache, HP scale) were all harder to find because networking, death logic, interpolation, and tint were tangled in one class.

## Rough subsystem sizing (by keyword density)
| Subsystem | Approx references | Extraction priority |
|---|---|---|
| TDM (death/respawn/tint/intro/countdown/pickups) | ~216 | High — biggest, most self-contained |
| Spell spawn + cross-spell combos | ~139 + ~73 combo | High — huge, independent |
| Earth Wall draw-mode state machine | ~105 | Medium — very self-contained, easy first win |
| Networking handlers (#on* + interpolation) | ~99 | Medium — clear boundary |

## The core risk
Every method references `this.#player`, `this.#remotePlayers`, `this.scene`, `this.add`, `this.physics`, `this.tweens`, `this.time`, `EVENT_BUS`, etc. Extracting them means either:
- **(A) Controller pattern (RECOMMENDED):** each subsystem becomes a class that takes the `GameScene` (or a narrow interface) in its constructor and calls back into it (`this.#scene.player`, `this.#scene.add...`). GameScene instantiates the controllers in `create()` and delegates.
- (B) Mixins — composes onto the class but is fiddly with `#private` fields and TS. Avoid.

The danger with (A): the `#on*` handlers are **arrow-function class fields** bound to `this` (the scene). Moving them to a controller changes what `this` is — every `EVENT_BUS.on(EVENT, this.#handler, this)` registration and every internal `this.#field` must be re-pointed. A single missed re-point = a silent runtime break the type-checker won't catch.

## Safe incremental order (one PR each, test between)
Do these **one at a time**, running `pnpm build` + `npm test` (both suites) + a 2-client playtest after each. Never batch.

### Step 1 — Earth Wall draw-mode → `EarthWallController` (lowest risk, do first)
The ~105 earth-wall lines (`#earthWall*` fields + draw-mode methods + the update call) are the most isolated subsystem — it's a self-contained state machine with little overlap. Extract to `src/scenes/controllers/earth-wall-controller.ts`. GameScene keeps a `#earthWall = new EarthWallController(this)` and calls `this.#earthWall.update()` from `update()`. **This is the proof-of-concept** — if it goes smoothly, the pattern is validated for the bigger ones.

### Step 2 — Cross-spell combos → `ComboController`
The ~44 `#update*Combo` methods + their `WeakMap`/`WeakSet` state (`#tornadoGrindState`, `#lavaDamageState`, `#earthBumpsThatPushed*`, etc.) are called each frame from `update()`. Extract to a `ComboController` that exposes a single `update(delta)`. These methods read spell groups + players — pass them via the scene reference. High value (biggest single chunk), moderate risk (lots of cross-references to map carefully).

### Step 3 — Networking → `NetworkController`
The `#on*` EVENT_BUS handlers + `#interpolateRemotePlayers` + `#buildLocalPlayerSnapshot` + remote-player spawn/lifecycle + `#deadPlayerIds` + `#pickups`. This is the trickiest because of the arrow-field/`this`-binding issue above. Extract carefully; keep the EVENT_BUS register/unregister in the controller's own `setup()/teardown()`. Test multiplayer thoroughly after.

### Step 4 — TDM match flow → `TdmController`
Death/respawn/tint/intro-cinematic/countdown/results-launch. Largest by reference count but much of it is event-driven (clean boundaries). Extract last, once the network controller (which it overlaps with) is stable.

### What stays in GameScene
Tilemap/room loading, collider registration, camera setup, the `create()`/`update()` orchestration that wires the controllers together. Target: GameScene drops from ~5,700 to ~1,500-2,000 lines of "scene setup + delegation."

## Guardrails for the refactor
1. **One subsystem per PR.** Build + both test suites + 2-client playtest between each. Revert instantly if a playtest regresses.
2. **Don't change behavior** — pure move. No "while I'm here" fixes mixed in (they hide refactor breakage).
3. **Grep for every moved method name** after each extraction to catch stragglers (`EVENT_BUS.on/off`, internal calls).
4. **The arrow-field handlers** (`#onX = (p) => {...}`) keep their arrow form in the controller so `this` binds to the controller instance; update their registration sites to `this.#netController.onX` won't work (private) — instead the controller registers its own handlers in `setup()`.
5. Consider adding a few **integration tests** first (e.g. a headless "spawn → damage → eliminate → respawn" sequence) so the refactor has a behavioral safety net beyond manual playtests.

## Estimated effort
- Step 1 (Earth Wall): ~1-2 hrs incl. testing — good first session.
- Step 2 (Combos): ~3-4 hrs — the biggest mechanical move.
- Step 3 (Network): ~3-4 hrs — highest care needed.
- Step 4 (TDM): ~3-4 hrs.
Total ~2 focused days. Worth it: every future change to this codebase gets faster and safer.
