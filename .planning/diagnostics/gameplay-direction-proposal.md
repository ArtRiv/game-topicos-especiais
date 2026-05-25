# Gameplay Direction Proposal — Team Deathmatch + Specials Mechanic

**Author:** Claude (game-design pass)
**Date:** 2026-05-25
**Scope:** Replace "last-player-dies → match over" with a real team-deathmatch lifecycle, design the "special spells" mechanic around DarkBolt, slot the work into the existing v1.2 roadmap.
**Audience:** Two devs, ~3 months to the college event.

---

## 1. Current match-end semantics audit

The current truth: **there is no real win condition wired in.** The server FSM has the slot for it, but the client and server never close the loop.

Concrete state of the world:

- **Server FSM** (`game-server/src/game-room.ts:9-15`) — explicit `LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED` table. ENDED has no outgoing edges. ENDED can be entered from any of LOADING / COUNTDOWN / ACTIVE — but **nothing on the server ever calls `transitionTo('ENDED')`**.
- **`MatchMode` enum exists** (`game-server/src/types.ts:129`):
  ```ts
  export type MatchMode = 'respawn' | 'last-standing';
  ```
  Set per-room via `GameRoom.setMatchMode` (game-room.ts:223). **Default is `'respawn'`** (game-room.ts:32). No socket event exposes the setter to clients — it's structural-only (per `T-09.3.02-07 mitigation` comment).
- **Respawn already works**: server schedules `RespawnPayload` broadcast `RESPAWN_DELAY_MS = 5000` ms after a 0-HP confirmation (`server.ts:303-308`, `game-room.ts:209-219`). Client handler at `src/scenes/game-scene.ts:2905-2922` restores position + HP + tint. Local-player elimination shows a "RESPAWNING IN N..." overlay (`game-scene.ts:2860-2899`).
- **`last-standing` mode short-circuits respawn** (`game-room.ts:210`: `if (this.#matchMode === 'last-standing') return;`). But because **no one in the codebase calls `setMatchMode('last-standing')`**, the live behavior is always "respawn forever".
- **The actual "match over" trigger today:** `src/scenes/game-scene.ts:3799-3804` — `#handlePlayerDefeatedEvent` listens to a single-player defeat event and starts `GAME_OVER_SCENE` on the local client only. This is the leftover from the original single-player Zelda-clone, **not** a multiplayer match-end. In multiplayer mode the local player respawns via `#onRespawn` before this fires (life is `resetToFull()` on respawn).
- **No win-condition checker exists** on the server. No frag counter. No team-score state. No timer. The grep for `ENDED` outside the FSM table returns zero hits.

**Bottom line:** the engine is already a respawn-with-no-end-condition machine. To ship team deathmatch you only need to (a) add a frag counter on the server, (b) add a win-condition check that fires `transitionTo('ENDED')`, (c) write a results screen.

---

## 2. Spawn point system audit

**Spawns are not data-driven, not per-team, and they exist in two unsynced places.**

### Client spawn logic
`src/scenes/game-scene.ts:3249-3296` (`#setupPlayer`) picks the spawn from the **starting door** of the current room in the Tiled map:

```ts
const startingDoor = this.#objectsByRoomId[this.#levelData.roomId].doorMap[this.#levelData.doorId];
const playerStartPosition = {
  x: startingDoor.x + startingDoor.doorTransitionZone.width / 2,
  y: startingDoor.y - startingDoor.doorTransitionZone.height / 2,
};
```

Every player on every client spawns at **the same door**. There is no per-player offset, no per-team offset, no spawn-point list. The maps have no spawn-point object layer (the Tiled JSONs at `public/assets/levels/world/world.json` and `public/assets/levels/dungeon-1/dungeon-1.json` are doors/chests/pots/rooms only — `Glob` on `*.tmj` returned zero, and there are no `spawn`-typed objects in the parsed structures).

### Server spawn logic
`game-server/src/server.ts:91-99` — at `COUNTDOWN → ACTIVE` the server registers each player with a **hardcoded deterministic offset**:

```ts
lobby.players.forEach((info, idx) => {
  const spawnX = 100 + idx * 64;
  const spawnY = 100;
  room.registerPlayer(info, spawnX, spawnY, maxHp);
});
```

The comment literally admits the mismatch: `TODO: align with client-side spawn allocation when lobby exposes per-slot spawn coordinates.` These coordinates are only used by **respawn** (`RespawnPayload`); the initial spawn comes from the client's door-based logic. So today: **initial spawn ≠ respawn position**.

### Where team spawns wire in
The minimum-viable change is small. We need three things:

1. **Tiled object layer in each map**, type `"team-spawn"`, with `team: 0|1` and `slotIndex: 0..N` custom properties. Add to `public/assets/levels/world/world.json` and `public/assets/levels/dungeon-1/dungeon-1.json`.
2. **Spawn-point parser** in `GameScene` — walk the object layer at map-load time, build `Map<teamId, SpawnPoint[]>`, expose via getter for both `#setupPlayer` and the network respawn handler.
3. **Pass the chosen spawn to the server** in the `match:loaded` ack so `room.registerPlayer` gets the *real* spawn point, not the 100+64i placeholder.

Files to touch:
- `src/scenes/game-scene.ts:3249-3296` (rewrite `#setupPlayer` to consult team-spawn list keyed on `PlayerInfo.team`)
- `game-server/src/server.ts:91-99` (replace the inline offset with the spawn the client reported)
- `game-server/src/types.ts` (extend `MatchLoadedPayload` or add a `match:spawn-claim` event)
- Map JSON files (add object layer)

---

## 3. Recommended game modes — ranked

Below: four modes I considered, ranked by event-readiness. The recommended pick is bolded.

### 3.1 **Team Deathmatch (TDM) — first team to N kills [RECOMMENDED]**

- **Pitch:** Two teams. Respawn after 5 s. First team to reach a kill quota wins.
- **Win condition:** First team to **30 team-kills** wins. Hard tiebreaker on equal-score timeout: highest team damage.
- **Why it fits:** The server already runs the host-authoritative damage pipeline; you only add a `Map<teamId, number>` frag counter on `GameRoom` and increment in `applyDamage` when `result.eliminated === true`. Respawn already works. Crowd-readability is straightforward — "Blue 27, Red 22" is legible from a phone-camera shot.
- **Complexity: Low.** Maybe a day of server work + a day for HUD score plate + a half-day for results screen plumbing. Reuses every system already shipped in Phase 9.3.
- **New reqs:**
  - `GMD-01`: Server tracks `teamKills: Map<number, number>` keyed by team; increments on `result.eliminated === true` against the caster's team.
  - `GMD-02`: Server transitions to `ENDED` when any team reaches `TEAM_KILL_TARGET` (config: 30 default, tunable from lobby).
  - `GMD-03`: A `team:score-updated` broadcast fires on every kill with the current `{team, kills}[]` snapshot.
  - `GMD-04`: Lobby config gains `gameMode: 'tdm' | 'br'` and (for TDM) `killTarget: number` — extends `LobbyConfig` per LBC-07 already-extensible schema.

### 3.2 Domination (control-point capture)

- **Pitch:** 1–3 control points on the map. Standing on a point with no enemies present accrues team score; first team to N points wins.
- **Win condition:** First team to **300 score** (1 pt/sec/zone × team-members-in-zone).
- **Why it fits in theory:** Adds map-aware tactics and spreads fights across the arena instead of clumping at chokepoints. Specials become tactical (DarkBolt erases an enemy off a contested point).
- **Why I'm skipping it:** Requires zone-trigger objects on every map, per-zone owner state with broadcast tickers, and a contested-vs-decaying UI. **Maybe 2 weeks** of work for the mechanic + visuals. Don't ship this for the event unless TDM is done first and you have spare time.
- **Complexity: Medium-High.**
- **New reqs (sketch):** `GMD-05..09` for zone objects, capture timer, score-tick broadcast, contested rules, UI.

### 3.3 Bounty / "First Blood"

- **Pitch:** Single-life elimination rounds, best-of-5. Whoever kills first that round wins the round. Specials charge across rounds.
- **Win condition:** First team to win **3 rounds**.
- **Why it could fit:** No respawn-during-round means the existing `last-standing` short-circuit at `game-room.ts:210` already works for one round. You'd add a round counter on top.
- **Why I'm passing:** Best-of-5 rounds at ~90s each = 7.5 minute matches with significant downtime between rounds. For a college-event spectator crowd, you want continuous action, not "round 3 of 5, please wait." Also — if your slowest player dies in 5 seconds, they spend most of the match watching. Bad for first-time players at a college event who want to FEEL the game.
- **Complexity: Low-Medium.**

### 3.4 Kill Confirmed (drop-pickup variant)

- **Pitch:** TDM but kills don't count until a teammate (or the killer) picks up a "soul" the corpse drops. Enemies can deny by picking it up themselves.
- **Why it's interesting:** Forces engagement at kill sites and turns specials into territory weapons (DarkBolt erases a soul → denied to both teams).
- **Why I'm passing:** Adds a whole new pickup type, pickup broadcast, claim/deny logic, and per-soul visuals. Too much surface area for 3 months when straight TDM gives 80% of the energy. Park it as a v1.3 evolution of TDM if the event lands well.
- **Complexity: Medium.**

### Recommended default

**TDM, kill-target 30, ~10-minute time cap, respawn 5 s.** It is the only option that:

1. Builds entirely on systems that already shipped in Phase 9.3 (damage, elimination broadcast, respawn).
2. Has a single-glance scoreboard the audience can read.
3. Has natural "set" length: 30 kills @ ~3 kills/min/team ≈ 8–10 minutes. Aligns with the locked **15-min session length** constraint in PROJECT.md.
4. Doesn't require new art beyond a score plate.

Build TDM. Defer everything else.

---

## 4. The "special spells" mechanic — what to build

DarkBolt is the prototype for a **class of spells distinct from element slots**. Today it's a one-off bound to a pickup with charges. We turn this into a real system without a rewrite.

### What makes a spell "special" vs standard?

Three orthogonal axes. A "special" hits all three:

1. **Off the element budget.** Standard spells are bound to the active element (1/2/3 keys) and consume mana/cooldown. Specials are bound to a **dedicated cast key** (R, already wired — `keyboard-component.ts:44`, `isSpecialCastJustDown`). They do not consume mana and do not use the cooldown system.
2. **Resource-gated by something OTHER than mana.** DarkBolt uses `PICKUP_CHARGES = 5` (config/spells/dark-bolt.ts:23). The general model: each special has a **finite resource** — pickup charges, kill-streak counter, or per-match meter that fills from damage dealt. Pick ONE per special.
3. **Game-state-altering, not just damage.** DarkBolt erases the world. Specials should DO something a regular spell can't: erase, displace, revive, redirect, mark, lock, see-through. Not "I do 50 damage in a bigger circle." If the only difference is bigger numbers, it's not a special, it's an ult.

### How is special-spell-casting bound?

Already done. `R` is the special-cast key. `keyboard-component.ts:143-145` exposes `isSpecialCastJustDown`, consumed at `game-scene.ts:1622`. There's a `SpecialSpellInventory` singleton (referenced game-scene.ts:1629 — `inv.activeSpellId`, `inv.tryConsume()`) that holds the currently-equipped special and decrements the resource on cast. **VoidOrb and DarkBolt already compete for the single slot** (per the comment at config/spells/dark-bolt.ts:4-7). The infrastructure is in place — we just need more specials in the registry.

### Three new specials to design

Pick one per remaining "family." DarkBolt is the Darkness representative. Build these:

#### Special #2: **Phoenix Ember (Fire)**
- **What:** A consumable that, when cast on yourself or an ally, **revives** the next time you (or that ally) would die — restoring you at the death location with full HP, dealing AOE fire damage on rebirth.
- **Resource:** Single-use pickup that drops from the map at intervals. One charge.
- **Why Fire:** Phoenix iconography. Sells the "rebirth" fantasy. Counterbalance to DarkBolt's "erasure" — DarkBolt removes, Phoenix restores.
- **Balance:** 60 s pickup respawn timer. The revive triggers a 600ms revival-flash so opponents see the comeback and can punish during the flash window.

#### Special #3: **Cyclone Veil (Wind)**
- **What:** Held cast (1.0 s windup, mirrors DarkBolt's caster lock). Releases a ring of howling wind that, for ~3 s, **deflects every incoming projectile** outward and silences all friendly-fire ticks within the radius. Caster cannot cast while veil is up.
- **Resource:** Charges via **damage taken** — fills after taking 50 HP of damage in the match. One-shot per fill.
- **Why Wind:** Wind's identity in the existing roster is air pressure and displacement (`AirBurst`, `WindBolt`). A protective deflector extends that without copying Earth Wall's static-barrier feel.
- **Balance:** The silence-on-friendly-fire is the kicker — turns the veil into a team-rally tool, not a self-defense crutch. Caster being unable to cast while it's up means it's a save-the-pile move, not a duel-winner.

#### Special #4: **Glacier Mausoleum (Ice)**
- **What:** Targeted ground-cast. Encases the target enemy in a frozen statue for 2.5 s. They are invulnerable AND unable to move/cast. Allies can break it early (full HP restored), enemies can shatter it for 80 damage. If neither acts, the target emerges at 1 HP with frostbite (-30% spell damage dealt for 5 s).
- **Resource:** Kill-streak. **Unlocks after the caster gets 3 kills without dying** in the current life.
- **Why Ice:** Ice doesn't have an identity yet besides IceShard. A "lock" mechanic on a target plays into "frozen in time" iconography and creates a **3-way decision** (ally save? enemy execute? do nothing?) — that's the kind of moment college-crowd play talks about afterward.
- **Balance:** Kill-streak unlock means snowballing players become reactive — they can't use Glacier to extend the streak, only to flip a teammate's fight.

#### Reserved family slots (for v2.0 / post-event)
- Water: "Tidal Reversal" — rewind a target's position 2 seconds. Reactive utility.
- Earth: "Aftershock" — channeled. Map-wide tremor that interrupts every channeled spell.
- Thunder: "Mark of Storms" — paint an enemy; their next 10 seconds of position broadcasts are visible to the whole team. Information warfare.

### Balancing levers (in priority order)

1. **Resource availability.** This is the dominant lever. A pickup-respawn special with a 60s cycle is fundamentally different from a kill-streak-unlock one — even at identical raw power.
2. **Windup duration.** DarkBolt's 500ms windup is the model. Specials should be telegraph-able. Anything that fires instantly without telegraph reads as "the game decided I died" — bad crowd experience.
3. **Counterplay.** Every special must have a counter in the standard roster. DarkBolt is countered by movement (it's a slow projectile). Phoenix is countered by the rebirth-flash window. Cyclone Veil is countered by waiting it out. Glacier is countered by allies/enemies acting on the statue.
4. **Cooldown is NOT the lever.** Per "off the element budget" above — if you balance specials with a CD timer, you've reinvented the slot system. Use the resource gate.

---

## 5. Team-deathmatch integration with existing systems

### Match FSM
**No new states needed.** The existing `LOBBY → LOADING → COUNTDOWN → ACTIVE → ENDED` graph covers TDM. The only delta is **WHO calls `transitionTo('ENDED')`**: today nobody; in TDM, `GameRoom.applyDamage` returns `eliminated: true` → server increments team-kill counter → if counter reaches target, `room.transitionTo('ENDED')` + broadcast a `match:ended` payload containing winning team + per-player kill/damage breakdown for the results screen.

### Respawn flow
`RESPAWN_DELAY_MS = 5000` (game-server/src/types.ts:188) is fine for TDM as-is. Bounty mode (deferred) would need it tuned per-mode. Add this when needed, not now — but make `RESPAWN_DELAY_MS` per-mode on `GameRoom` instead of a top-level constant when you do.

### Results screen (Phase 10)
The server's `match:ended` payload should include:

```ts
type MatchEndedPayload = {
  winningTeam: number | null;            // null = draw
  reason: 'kill-target' | 'time-cap' | 'all-disconnected';
  perPlayer: Array<{
    playerId: string;
    team: number;
    kills: number;
    deaths: number;
    damageDealt: number;
    damageTaken: number;
  }>;
  mvpPlayerId: string;                   // top damage; tiebreak top kills
};
```

This means **the server has to track damage-dealt and damage-taken per player across the match**. Add two `Map<playerId, number>` to `GameRoom` and increment them in `applyDamage`. No new sockets. The MVP calculation is one sort at end-of-match. This is the only new server state Phase 10 needs.

### Friendly fire toggle + team assignment
**Teams are assigned in the lobby** by the host clicking A/B buttons next to each player row. Implementation:

- UI: `src/scenes/lobby-scene.ts:426-451` — host sees clickable A/B buttons, non-host sees a read-only badge.
- Wire: `NetworkManager.sendLobbyAssignTeam(player.id, team)` → server `lobby:assign-team` handler at `server.ts:160-163` → `LobbyManager.setPlayerTeam` (`lobby-manager.ts:97-106`).
- Storage: `PlayerInfo.team: number | undefined` (`types.ts:9`). 0 = A, 1 = B, undefined = unassigned.
- Friendly fire check: `GameRoom.isSameTeam` (`game-room.ts:159-165`). Already correctly short-circuits friendly fire when BOTH players have defined teams that match.

**For TDM, you must enforce both-teams-have-≥1-player** in `startLobby`. Today there's no such check (`lobby-manager.ts:86-95`) — a host can start with everyone on Team A and no Team B. Add an `isLobbyTeamValid` guard that rejects start when any player is unassigned or one team is empty. Surface the error via the existing `lobby:error` channel.

---

## 6. Roadmap impact

### Slot the TDM work into existing phases

**Do NOT create a new top-level phase.** The work folds into existing phases cleanly:

- **Phase 9.4 (Combo System & Spell Roster Expansion) — extend to include Special Spells.** The "special spells" mechanic is structurally a spell-roster expansion: DarkBolt, VoidOrb, Phoenix, Cyclone, Glacier are all instances of the same `SpecialSpellInventory` plug. Add `GMD-SP-01..04` to Phase 9.4 covering: (1) extract `SpecialSpellInventory` cleanly, (2) Phoenix Ember spell + pickup, (3) Cyclone Veil spell + damage-meter resource, (4) Glacier Mausoleum + kill-streak resource. Treat #1 as the blocker and ship at least Phoenix before #2.
- **Phase 10 (Match End & Results Screen) — extend to OWN the TDM win condition.** Phase 10 is currently scoped to MER-01/02/07: "transitions to ENDED on win condition" with "last team standing." Rewrite the success criteria: ENDED fires on `team-kills ≥ target` OR `time-cap reached`, results screen displays per-player kills/damage/MVP. Add `GMD-01..04` from §3.1 above to Phase 10.
- **Phase 12 (In-Match Feedback HUD) — already covers the score plate.** FBK-04 mentions "elapsed match time"; expand it to "match time + team score plate." Trivial scope addition.

### New decimal phase 9.5? **No.**

Tempting to write Phase 9.5 = "Team Spawn Points + Team-Validated Lobby Start" as a discrete piece. **Don't.** Fold the spawn-point work into Phase 10 plan-1 — you can't build the win-condition phase without spawn coordinates that respect team identity, so couple them. Make the very first plan in Phase 10 be "team spawn data layer (Tiled object layer + parser + server registerPlayer rewire)" and the second plan be "win condition + match:ended payload."

### What to NOT do before the event

These look tempting but defer:

- **Domination mode and Kill Confirmed.** Per §3, ship TDM only.
- **The full special spells suite.** Build Phoenix Ember (because it's the dramatic counter-narrative to DarkBolt and reads instantly to a crowd). Ship Cyclone Veil **only if** Phoenix lands and is balanced. Glacier Mausoleum requires kill-streak tracking — that's net-new state with edge cases (disconnect mid-streak?), so defer to v1.3 unless the other two specials' resource models are fully validated by playtest.
- **Per-mode `RESPAWN_DELAY_MS`.** Use the 5s default. Add per-mode tuning when you add a second mode.
- **Spectator mode (Phase 13).** TDM with 5 s respawns means players are never dead for long — spectator is way less critical than in last-standing modes. Defer past the event if time tightens.
- **Reconnect grace window (Phase 11).** Lower priority than the actual match-end semantics. Defer if it's still pending at week 10 of 12.

### Sequencing call

Build order I'd recommend:

1. Spawn data layer (Tiled object layer + parser) — **3 days**
2. Server team-kill counter + win condition + `match:ended` payload — **3 days**
3. Results screen scene — **4 days**
4. Lobby validation: both teams ≥1 player, surface error — **1 day**
5. Score plate in UiScene + score broadcast — **2 days**
6. `SpecialSpellInventory` extraction, then Phoenix Ember — **5 days**
7. Cyclone Veil if Phoenix lands — **3 days**

That's ~3 weeks of focused work for the must-haves (1-5) plus a week of polish for Phoenix Ember. Comfortably inside the 3-month window even with a buffer.

---

*Cite when implementing: this document, `game-server/src/game-room.ts`, `game-server/src/types.ts:129`, `src/scenes/game-scene.ts:3249-3296` for spawns, `src/components/input/keyboard-component.ts:44` for the special-cast key.*
