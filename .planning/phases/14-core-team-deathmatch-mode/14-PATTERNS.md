# Phase 14: Core Team Deathmatch Mode - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 11 (8 modified, 1 new scene, 2 new tuning/config additions)
**Analogs found:** 11 / 11 (all surfaces extend existing code — this phase is heavily reuse-driven)

> Every TDM surface extends an existing Phase 8 / Phase 9.3 mechanism. There is almost no greenfield code: the cinematic extends `#enterCountdownMode`, scoring slots into the existing `result.eliminated` branch, invuln extends `validateHit` + i-frame blink, the score plate copies the countdown-tick pop tween, and the results screen copies the menu-button hover pattern. Treat "analog" here as "the exact code block to extend in place," not "a file to imitate elsewhere."

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `game-server/src/types.ts` | model (protocol) | request-response | self (`MatchMode` union, `EliminationPayload`) | exact (extend in place) |
| `game-server/src/game-room.ts` | service (match FSM) | event-driven | self (`applyDamage`/`validateHit`/`scheduleRespawn`) | exact (extend in place) |
| `game-server/src/server.ts` | controller (socket handlers) | event-driven | self (`spell:hit` `result.eliminated` branch, `startCountdown` registerPlayer loop) | exact (extend in place) |
| `src/networking/types.ts` | model (protocol mirror) | request-response | `game-server/src/types.ts` (mirror) | exact |
| `src/common/event-bus.ts` | config (event registry) | pub-sub | self (`NETWORK_*` block, `CUSTOM_EVENTS`) | exact (extend in place) |
| `src/networking/network-manager.ts` | service (socket→bus bridge) | event-driven | self (`on('elimination')` → `EVENT_BUS.emit`) | exact (extend in place) |
| `src/scenes/game-scene.ts` | scene (cinematic + respawn) | event-driven | self (`#enterCountdownMode`/`#onCountdownTick`/`#onRespawn`) | exact (extend in place) |
| `src/scenes/ui-scene.ts` | scene (HUD) | event-driven | self (`#hudContainer`, mana bar, cooldown pop) | role-match (add score plate) |
| `src/scenes/tdm-results-scene.ts` (NEW) | scene (results overlay) | event-driven | `main-menu-scene.ts` `#drawMenu` + `game-over-scene.ts` | role-match |
| `src/common/config/` (new `tdm.ts` + `network.ts`) + `runtime-config.ts` | config | n/a | `network.ts` Phase 9.3 tunables block | exact |
| `src/debug/debug-panel.ts` | config (debug UI) | n/a | self (`SECTIONS` ParamDef list) + `lobby-debug-panel.ts` COPY VALUES | exact |

---

## Shared Patterns (apply across multiple files)

### Server ↔ client protocol mirror (D-03, D-07, discretion field shapes)
**Source of truth:** `game-server/src/types.ts`; **mirror:** `src/networking/types.ts`. Every payload exists in BOTH with identical field shapes. The `MatchMode` union is currently duplicated in both files:

`game-server/src/types.ts:130` and `src/networking/types.ts:193`:
```typescript
export type MatchMode = 'respawn' | 'last-standing';
```
Add `'team-deathmatch'` in BOTH (D-03). Add any new payload (e.g. team-score broadcast, ENDED-with-stats payload) in BOTH. The header comment on both files makes this contract explicit ("keep field shapes identical" / "keep in sync when protocol changes").

### New network event wiring (3-step bridge + SHUTDOWN cleanup)
Any new server→client broadcast follows this exact 3-step path. Use the existing `elimination` event as the template:

1. **Add `CUSTOM_EVENTS` key** — `src/common/event-bus.ts:48-52` (Phase 9.3 block):
```typescript
NETWORK_DAMAGE_CONFIRMED: 'NETWORK_DAMAGE_CONFIRMED',
NETWORK_ELIMINATION: 'NETWORK_ELIMINATION',
NETWORK_RESPAWN: 'NETWORK_RESPAWN',
```
2. **Bridge socket → EVENT_BUS** — `src/networking/network-manager.ts:541-546`:
```typescript
this.#socket.on('elimination', (payload: EliminationPayload) => {
  EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_ELIMINATION, payload);
});
this.#socket.on('respawn', (payload: RespawnPayload) => {
  EVENT_BUS.emit(CUSTOM_EVENTS.NETWORK_RESPAWN, payload);
});
```
3. **Subscribe in scene with matched SHUTDOWN cleanup** — `src/scenes/game-scene.ts:3699-3700` (on) paired with `:3716-3717` (off). EVERY `EVENT_BUS.on` MUST have a matching `EVENT_BUS.off` inside the `this.events.once(Phaser.Scenes.Events.SHUTDOWN, …)` block (game-scene.ts:3702). The `HUD_REVEAL` event (UI-SPEC surface 1 step 5) follows this same pattern but `UiScene` is the subscriber — pair the `on` at `ui-scene.ts:206-213` with the `off` at `ui-scene.ts:215-224`.

### Tunable config → RUNTIME_CONFIG → debug panel → COPY VALUES loop (D-01, D-09, D-12)
Every new tunable (`TDM_WIN_TARGET`, `SPAWNPOINTS`, `RESPAWN_INVULN_MAX_MS`) follows the existing Phase 9.3 path:

**Static default** — `src/common/config/network.ts:36-41`:
```typescript
// Phase 9.3 — host-authoritative damage tunables (mirrored from game-server/src/types.ts).
// TODO: tune from playtest.
export const RESPAWN_DELAY_MS = 5000;
export const MAX_SPELL_DAMAGE = 50;
```
**Re-export through barrel** — `src/common/config/index.ts:19-25` (`export * from './network';` — add `export * from './tdm';` if a new file is created).
**Mirror into RUNTIME_CONFIG** — import at `runtime-config.ts:92-95`, add to the object at `:258-262` (the labeled "Phase 9.3 — host-authoritative damage tunables" block is the precedent for grouping a phase's tunables).
**Add a debug-panel section** — `src/debug/debug-panel.ts:20-29` `SECTIONS` array, one `ParamDef` per scalar:
```typescript
{
  title: 'TDM',
  params: [
    { key: 'TDM_WIN_TARGET', label: 'Win target', min: 1, max: 100, step: 1 },
  ],
},
```
**COPY VALUES** — the gameplay `debug-panel.ts` does NOT yet have a COPY button; the canonical COPY-VALUES implementation is `src/debug/lobby-debug-panel.ts:220-260`:
```typescript
const copyBtn = document.createElement('button');
copyBtn.textContent = 'COPY VALUES';
copyBtn.addEventListener('click', async () => {
  const lines = Object.entries(LOBBY_TUNING).map(([k, v]) => `  ${k}: ${v},`).join('\n');
  const snippet = `export const LOBBY_TUNING = {\n${lines}\n};`;
  await navigator.clipboard.writeText(snippet);
});
```
For non-scalar config (`SPAWNPOINTS` — a nested `{ teamA: [...], teamB: [...] }` object, D-09), the LOBBY_TUNING flat-object + COPY pattern is the closest analog; planner adapts the serialization to emit the nested structure (the spawnpoint editor is a `*_TUNING`-style live-edit panel that COPYs a paste-ready `SPAWNPOINTS` literal, NOT a slider-per-scalar).

### `press_start_2p` BitmapText (all text surfaces — banner, score, countdown, results)
Literal cache key `'press_start_2p'`, NO `ASSET_KEYS` export (UI-SPEC §Design System). Existing uses to copy:
- 32px display, centered, depth, tint — `game-scene.ts:3644-3649` (countdown text)
- 6px micro hint, centered, tint — `ui-scene.ts:196-199` (`SHIFT WIND DASH` at (240,308))
- 16px menu item — `main-menu-scene.ts:288-289`

### Local-vs-remote dispatch (elimination/respawn/HUD events)
All per-player network handlers branch on `payload.playerId === nm.localPlayerId`. Template — `game-scene.ts:3482-3494` / `:3541-3558`:
```typescript
const nm = this.#safeNetworkManager();
const isLocal = nm != null && payload.playerId === nm.localPlayerId;
if (isLocal) { /* local death overlay / respawn */ return; }
const remote = this.#remotePlayers.get(payload.playerId);
if (remote) { /* tint / position */ }
```
The invuln blink (surface 3) attaches to the `isLocal` branch of `#onRespawn` (game-scene.ts:3545-3550).

---

## Pattern Assignments

### `game-server/src/types.ts` (model, request-response)

**Analog:** self — extend the Phase 9.3 block in place.

**MatchMode union to extend** (line 130):
```typescript
export type MatchMode = 'respawn' | 'last-standing';
// → add 'team-deathmatch' (D-03)
```

**Payload shape to copy for new TDM payloads** (lines 154-164) — `EliminationPayload`/`RespawnPayload` are the shape templates for a team-score broadcast + an ENDED-stats payload:
```typescript
export type EliminationPayload = {
  playerId: string;
  eliminatedAt: number;
};
export type RespawnPayload = {
  playerId: string;
  x: number;
  y: number;
};
```

**Tunable constant block to copy** (lines 186-191) — add `TDM_WIN_TARGET`, `RESPAWN_INVULN_MAX_MS` here (server-authoritative copies, D-01/D-14):
```typescript
export const RESPAWN_DELAY_MS = 5000;          // D-09 default. TODO: tune from playtest
export const MAX_SPELL_DAMAGE = 50;            // RESEARCH.md §2 landmine: cap-check claimed damage.
```

**`MAP_POOL` for banner display names** (lines 37-41) — the results/banner map name draws from `displayName`:
```typescript
export const MAP_POOL = [
  { id: 'WORLD', displayName: 'Open Field', thumbnailKey: 'MAP_THUMB_WORLD' },
  { id: 'DUNGEON_1', displayName: 'Dungeon', thumbnailKey: 'MAP_THUMB_DUNGEON_1' },
  { id: 'STAGES', displayName: 'Arena', thumbnailKey: 'MAP_THUMB_STAGES' },
] as const;
```

---

### `game-server/src/game-room.ts` (service, event-driven)

**Analog:** self — the Phase 9.3 host-authoritative damage block (lines 136-235).

**FSM transition table** (lines 9-15) — `ACTIVE → ENDED` already valid; the win-condition just calls `transitionTo('ENDED')`:
```typescript
const VALID_NEXT: Record<MatchState, MatchState[]> = {
  LOBBY: ['LOADING'], LOADING: ['COUNTDOWN', 'ENDED'],
  COUNTDOWN: ['ACTIVE', 'ENDED'], ACTIVE: ['ENDED'], ENDED: [],
};
```

**`validateHit` — the invuln rejection insertion point (D-14)** (lines 173-184). Add an invuln-until check alongside the existing FF/range/freshness short-circuits:
```typescript
public validateHit(claim, now): boolean {
  if (this.isSameTeam(claim.casterId, claim.targetId)) return false;   // FF
  const known = this.#lastPos.get(claim.targetId);
  if (!known) return false;
  if (now - known.ts > PLAUSIBILITY_STALE_MS) return false;            // freshness
  // → ADD: if (now < (this.#invulnUntil.get(claim.targetId) ?? 0)) return false;
  const dx = known.x - claim.hitX; const dy = known.y - claim.hitY;
  return dx * dx + dy * dy <= PLAUSIBILITY_RANGE_PX * PLAUSIBILITY_RANGE_PX;  // range
}
```

**`applyDamage` returns the `eliminated` flag** (lines 196-205) — this is what `server.ts` branches on for scoring; do not change the return shape, read it:
```typescript
return { newHp: next, eliminated: cur > 0 && next === 0, cappedAmount: amount };
```

**`scheduleRespawn` callback — fresh spawnpoint + start invuln (D-10, D-12)** (lines 209-219). Today it restores HP and fires the caller's callback; extend so the caller picks a NEW farthest-from-enemy spawn (not `#spawnPoints` single value) and the room sets `#invulnUntil`:
```typescript
public scheduleRespawn(playerId: string, onFire: () => void): void {
  if (this.#matchMode === 'last-standing') return;
  const existing = this.#respawnHandles.get(playerId);
  if (existing) clearTimeout(existing);
  const h = setTimeout(() => {
    this.#hp.set(playerId, this.#maxHp);     // restore HP at respawn
    this.#respawnHandles.delete(playerId);
    // → ADD: this.#invulnUntil.set(playerId, Date.now() + RESPAWN_INVULN_MAX_MS);
    onFire();
  }, RESPAWN_DELAY_MS);
  this.#respawnHandles.set(playerId, h);
}
```

**`#playerInfo` team lookup + `isSameTeam`** (lines 31, 159-165) — the model for caster-team attribution (D-04). A `#teamScores: [number, number]` field + an `addTeamKill(casterId)` method belongs alongside this:
```typescript
public isSameTeam(casterId, targetId): boolean {
  const a = this.#playerInfo.get(casterId);
  const b = this.#playerInfo.get(targetId);
  if (!a || !b) return false;
  if (a.team === undefined || b.team === undefined) return false;
  return a.team === b.team;
}
```

**`#lastPos` + `#hp` give living-enemy data for farthest-from-enemy (D-10)** (lines 27-28, 141-143). No new plumbing — `recordPosition` already feeds `#lastPos` at 20 Hz; a `pickSpawn(teamId, mapId)` method reads `#lastPos` + `#hp > 0` to find living enemies.

**`registerPlayer` / `#spawnPoints` / `clearCombatState`** (lines 145-155, 226-235) — new TDM state (`#teamScores`, `#kills`, `#deaths`, `#invulnUntil`) must be initialized in `registerPlayer` and wiped in `clearCombatState` (the latter is called on `ENDED` and on room-empty; line 95 + 56-59).

---

### `game-server/src/server.ts` (controller, event-driven)

**Analog:** self — the `spell:hit` handler (lines 271-310).

**THE `result.eliminated` branch (D-04, D-07 — scoring + kill/death + win-check plug in HERE)** (lines 299-309):
```typescript
if (result.eliminated) {
  const elim: EliminationPayload = { playerId: claim.targetId, eliminatedAt: Date.now() };
  io.to(`lobby:${lobbyId}`).emit('elimination', elim);

  room.scheduleRespawn(claim.targetId, () => {
    const spawn = room.getSpawnPoint(claim.targetId);   // → D-10: replace with farthest-from-enemy pick
    if (!spawn) return;
    const payload: RespawnPayload = { playerId: claim.targetId, x: spawn.x, y: spawn.y };
    io.to(`lobby:${lobbyId}`).emit('respawn', payload);
  });
}
```
TDM additions in this branch: `room.addTeamKill(claim.casterId)` (attributes to caster's team via `#playerInfo`), increment per-player kills (`casterId`) + deaths (`targetId`), broadcast updated team scores, then `if (teamScore >= TDM_WIN_TARGET) { room.transitionTo('ENDED'); broadcast ENDED-with-stats; }`.

**Broadcast pattern** (lines 297, 301, 307) — every server→client emit uses the room channel:
```typescript
io.to(`lobby:${lobbyId}`).emit('<event-name>', payload);
```
Use this for the new `match:team-score` (or new field on an existing event — discretion D) and the ENDED-stats broadcast. `broadcastMatchState` (lines 35-42) is the template for a dedicated broadcast helper.

**`registerPlayer` spawn-allocation loop — REPLACE the naive offset (D-10)** (lines 88-99):
```typescript
lobby.players.forEach((info, idx) => {
  const spawnX = 100 + idx * 64;   // ← D-10: replace with SPAWNPOINTS[mapId] farthest-from-enemy
  const spawnY = 100;
  room.registerPlayer(info, spawnX, spawnY, maxHp);
});
```
`lobby.config.mapId` (the active map) is available via `lobbyManager.getLobbyById(lobbyId).config.mapId` — feed it to `SPAWNPOINTS[mapId]`.

**Default mode is already `'team-deathmatch'`** (line 192) — `mode: lobby.mode ?? 'team-deathmatch'`. The room must call `room.setMatchMode(...)` so respawn semantics follow `'respawn'` (D-03); `setMatchMode` exists at game-room.ts:223.

**State guard** (lines 274-275) — every gameplay handler early-returns unless `room.state === 'ACTIVE'`; keep this guard on any new TDM socket handler.

---

### `src/scenes/game-scene.ts` (scene — intro cinematic + respawn invuln, event-driven)

**Analog:** self — `#enterCountdownMode` / `#onCountdownTick` (cinematic) and `#onRespawn` / `#clearLocalDeath` (respawn).

**Intro cinematic base to EXTEND (D-18/D-20), NOT rewrite** (lines 3623-3683). The camera snap-out → zoom-in is already here; add a `pan` between them and the banner reveal before:
```typescript
#enterCountdownMode(): void {
  this.#controls.isMovementLocked = true;
  this.#combatLocked = true;
  if (this.#player?.body) (this.#player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  // LFC-07: snap-out → animate-in.
  this.cameras.main.setZoom(0.6);                          // ← outZoom (reuse 0.6 as wide establishing)
  this.cameras.main.zoomTo(1.0, 3000, 'Sine.easeOut');    // ← playZoom. Insert pan(player.x, player.y, …) before this
  if (this.#countdownText === null) {
    this.#countdownText = this.add
      .bitmapText(centerX, centerY, 'press_start_2p', '', 32)
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000).setTint(0xffdd55);
  }
  this.#countdownText.setVisible(true).setText('');
}
```
D-18 sequence (banner → wide hold → `cameras.main.pan(player.x, player.y, panMs, ease)` → `zoomTo` → HUD reveal via `HUD_REVEAL` event → 5..1 ticks → unlock). Sequence the pan→zoom via pan's completion callback or `tweens.chain` (UI-SPEC surface 1 Camera). The zoomed-OUT value is set ONLY here, never in `#setupCamera` (late-joiner safety — comment at lines 3619-3621).

**Countdown-tick pop tween — DO NOT change shape; the score plate copies it verbatim (D-17)** (lines 3673-3683):
```typescript
#onCountdownTick = (payload: MatchCountdownTickPayload): void => {
  if (this.#countdownText === null) return;
  this.#countdownText.setText(payload.label);   // ← 5|4|3|2|1 labels now come from server ticks (D-18 step 6)
  this.tweens.add({
    targets: this.#countdownText,
    scale: { from: 1.3, to: 1.0 },
    duration: 250,
    ease: 'Back.easeOut',
  });
};
```
The label sequence change (`5..1` instead of `3 2 1 FIGHT`) is server-driven — change `startCountdown`'s `TICKS` array in `server.ts:56-61`, NOT a client interval.

**`#exitCountdownMode` is the unlock gate (D-18 step 7)** (lines 3660-3664) — movement + casting unlock here, still triggered by the host `COUNTDOWN → ACTIVE` broadcast via `#onMatchStateChanged` (lines 3604-3610). Keep this gate.

**Respawn handler — the invuln-blink attach point (surface 3, D-12/D-13)** (lines 3541-3558):
```typescript
#onRespawn = (payload: RespawnPayload): void => {
  const isLocal = nm != null && payload.playerId === nm.localPlayerId;
  if (isLocal) {
    this.#clearLocalDeath();
    this.#player.setPosition(payload.x, payload.y);
    this.#player.lifeComponent.resetToFull();
    this.#player.clearTint();
    // → ADD: start the invuln pulse tween here (after death overlay torn down by #clearLocalDeath)
    return;
  }
  // remote branch …
};
```

**Invuln blink contract (D-13)** — reuse the alpha-pulse mechanic. The hurt-state precedent for "set invulnerable, schedule clear" is `hurt-state.ts:72-90` (boolean toggle + `delayedCall`). The respawn blink differs: sustained looping `yoyo`/`repeat:-1` alpha tween ~150ms/half, stopped on first of move/cast/timeout (`RESPAWN_INVULN_MAX_MS`), then hard `alpha = 1.0`. Store the tween ref to stop it. The player already exposes `iFrameUntil` (player.ts:59) and `invulnerableComponent` (InvulnerableComponent at invulnerable-component.ts:4-25) — the client gates locally for visual correctness; server is authority (D-14). Cancel-on-move/cast hooks into the existing movement/cast handlers (the `#combatLocked` / `isMovementLocked` checks at game-scene.ts:1910-1911, 1995-1996, 2640-2642 are the cast/move entry points to read).

**SHUTDOWN cleanup (lines 3702-3719)** — any new EVENT_BUS subscription (e.g. a new score event GameScene listens to) AND any new tween/timer (the invuln pulse) must be torn down here. `#clearLocalDeath` is already called at line 3719.

---

### `src/scenes/ui-scene.ts` (scene — team-score HUD plate, event-driven)

**Analog:** self — `#hudContainer` build + the cooldown pop/fade tweens.

**`#hudContainer` is the home for the score plate (surface 2)** (lines 122, 146, 167, 203) — the plate must be `this.#hudContainer.add(...)` so it reveals/hides with the rest of the HUD during the cinematic (D-15, UI-SPEC surface 2 Home). The mana bar build is the layout template:
```typescript
this.#manaBarBg = this.add.rectangle(manaBarX, manaBarY, manaBarWidth, manaBarHeight, 0x222244).setOrigin(0);
this.#hudContainer.add([this.#manaBarBg, this.#manaBarFill, this.#manaText]);
```
Collision-avoidance anchors (do NOT overlap): mana bar `x=8,y=14,w=60` (line 154-159), hearts `x=157+8i, y=25/33` (lines 128-145). Top-center band `x 100-380, y 4-20` is free (UI-SPEC Spacing). Score plate at center-X `240`, `y≈8-12`.

**BitmapText micro/heading pattern** (lines 196-199) — separate BitmapText objects per tint piece (`[A]`+numA cyan, `–` white/gold, numB+`[B]` red), all `press_start_2p`:
```typescript
this.#windDashHint = this.add
  .bitmapText(240, 308, 'press_start_2p', 'SHIFT  WIND DASH', 6)
  .setOrigin(0.5)
  .setTint(0x44ff99);
```

**Score-pop tween — copy the countdown-tick shape (D-17)** — same `scale {from:1.3,to:1.0}, duration:250, ease:'Back.easeOut'` as game-scene.ts:3677-3682. Apply only to the number that changed. The cooldown-entry fade-in tween (lines 412-413) is the in-scene tween precedent.

**EVENT_BUS subscribe + SHUTDOWN cleanup** (lines 206-224) — the score plate listens to the new team-score event; the `HUD_REVEAL` listener also lives here. Mirror every `on` with an `off`:
```typescript
EVENT_BUS.on(CUSTOM_EVENTS.MANA_UPDATED, this.updateManaInHud, this);
// …
this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
  EVENT_BUS.off(CUSTOM_EVENTS.MANA_UPDATED, this.updateManaInHud, this);
});
```

**Team colors** — hoist `TEAM_COLORS = [0x44aaff, 0xff5533]` (UI-SPEC §Color) from lobby-scene.ts:1495 (badge tints, NOT toggle-button fills) into a shared constant indexable by `PlayerInfo.team`.

---

### `src/scenes/tdm-results-scene.ts` (NEW scene — results overlay, event-driven)

**Primary analog:** `src/scenes/main-menu-scene.ts` (`#drawMenu` button hover/tint/scale) + `src/scenes/game-over-scene.ts` (scene lifecycle / scene.start back-nav). Read `skills/scenes/SKILL.md` for launch/shutdown.

**Scene boilerplate** — copy `game-over-scene.ts:9-19, 44-48`:
```typescript
export class TdmResultsScene extends Phaser.Scene {
  constructor() { super({ key: SCENE_KEYS.TDM_RESULTS_SCENE }); }  // ← add key to scene-keys.ts
  public create(): void {
    // …
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { /* off any EVENT_BUS listeners */ });
  }
}
```
**Registration** — add `SCENE_KEYS.TDM_RESULTS_SCENE` to `src/scenes/scene-keys.ts:1-19` and `game.scene.add(...)` in `src/main.ts:112-115` (next to `GAME_OVER_SCENE` at line 114).

**RETURN TO LOBBY button — copy the menu-button hover pattern verbatim (D-06)** — `main-menu-scene.ts:285-310`:
```typescript
const item = this.add
  .bitmapText(cx, y, 'press_start_2p', 'RETURN TO LOBBY', 16)
  .setOrigin(0.5)
  .setTint(0xffffff)
  .setInteractive({ useHandCursor: true });
item.on('pointerover', () => {
  this.tweens.add({ targets: item, scaleX: 1.05, scaleY: 1.05, duration: 100, ease: 'Quad.Out' });
  item.setTint(0xffdd55);   // gold select
});
item.on('pointerout', () => {
  item.setTint(0xffffff);
  this.tweens.add({ targets: item, scaleX: 1, scaleY: 1, duration: 100, ease: 'Quad.Out' });
});
item.on('pointerup', () => { /* return to LobbyScene / rematch */ });
```
**Scrim + panel frame** — death-overlay scrim shape from `game-scene.ts:3506-3510` (`rectangle(0,0,w,h,0x000000,~0.7).setOrigin(0,0).setScrollFactor(0).setDepth(…)`); optional panel frame from `lobby-scene.ts:670-671` (`0x0a0f1f`@0.92 fill + 1px `0x2a3a55` stroke).
**Winner line / table rows** — 32px `press_start_2p` display tinted with `TEAM_COLORS[winningTeam]` (gold `0xffdd55` for `DRAW`); 8px per-player rows (separate BitmapText per row for per-team tinting, explicit Y per row at 16px pitch — UI-SPEC §Typography, surface 4 layout). MVP = highest kills, tie-break fewest deaths → first-to-reach → stable (D-07).
**Reads stats from the ENDED payload** — the win broadcast carries per-player kills/deaths + winningTeam + mvpPlayerId (shape is planner's discretion, mirrored in both `types.ts`). Launch on the `ENDED` `match:state-changed` (or a dedicated results event); fall back to `0`/neutral tint on missing fields (UI-SPEC error state).

---

## No Analog Found

None. Every surface extends an existing mechanism. The only NEW file (`tdm-results-scene.ts`) is a role-match composite of `main-menu-scene.ts` (button) + `game-over-scene.ts` (scene shell), not greenfield.

---

## Metadata

**Analog search scope:** `game-server/src/` (types, server, game-room), `src/scenes/` (game, ui, main-menu, lobby, game-over), `src/networking/` (types, network-manager), `src/common/` (event-bus, config/, runtime-config), `src/components/game-object/` (invulnerable), `src/components/state-machine/states/character/` (hurt-state), `src/debug/` (debug-panel, lobby-debug-panel), `src/game-objects/player/`, `src/main.ts`, `src/scenes/scene-keys.ts`
**Files scanned:** 16
**Pattern extraction date:** 2026-05-29
